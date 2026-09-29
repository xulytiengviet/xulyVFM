import { cbor } from "./cbor.js";
import { VFM_MAGIC, PROFILE_RASTER, crc32c, sha256, utf8Bytes } from "./vfm-core.js";

const HEADER=256,DIR=64,HASHREC=48,NONE=0xffffffff;
const HF_HASH=1<<1,HF_PROF=1<<2,HF_DET=1<<5,HF_STRICT=1<<6,HF_IMMUTABLE=1<<7;
const SF_CRITICAL=1<<0,SF_CONTENT=1<<1,SF_HOT=1<<2,SF_IMMUTABLE=1<<7;
const align=(n,a=8)=>(n+a-1)&~(a-1);
const cat=parts=>{const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length;}return o;};
function w64(dv,o,n){dv.setBigUint64(o,BigInt(n),true);}
function hashRecord(kind,id,digest){const a=new Uint8Array(HASHREC),d=new DataView(a.buffer);d.setUint8(0,kind);d.setUint8(1,1);d.setUint8(2,32);d.setUint8(3,3);w64(d,4,id);a.set(digest,12);return a;}
function dirEntry({type,flags,id,offset,length,profileId=0,crc,hashRef=NONE}){const a=new Uint8Array(DIR),d=new DataView(a.buffer);for(let i=0;i<4;i++)a[i]=type.charCodeAt(i);d.setUint32(4,flags,true);w64(d,8,id);w64(d,16,offset);w64(d,24,length);w64(d,32,length);d.setUint16(40,profileId,true);d.setUint16(42,1,true);d.setUint32(48,crc,true);d.setUint32(52,hashRef,true);return a;}

export async function buildRasterVFM(rasterBytes,info={}){
  const rast=rasterBytes instanceof Uint8Array?rasterBytes:new Uint8Array(rasterBytes);
  if(!rast.length)throw new Error("Raster rỗng.");
  const uuid=(await sha256(rast)).slice(0,16);
  const meta=cbor.mapInt([[0,cbor.array([cbor.uint(1),cbor.uint(3)])],[1,cbor.bytes(uuid)],[4,cbor.uint(3)],[5,cbor.uint(2)]]);
  const prof=cbor.array([cbor.text(PROFILE_RASTER)]);
  const rinf=utf8Bytes(JSON.stringify({schema:1,profile:PROFILE_RASTER,mediaType:"image/tiff; application=geotiff",...info}));
  const dMeta=await sha256(meta),dProf=await sha256(prof),dInfo=await sha256(rinf),dRast=await sha256(rast);
  const hashes=cat([hashRecord(1,1,dMeta),hashRecord(1,3,dProf),hashRecord(1,100,dInfo),hashRecord(1,101,dRast)]);
  const root=await sha256(hashes);
  const count=5,dirOff=256,dirLen=count*64;
  const metaOff=align(dirOff+dirLen,64),profOff=align(metaOff+meta.length),infoOff=align(profOff+prof.length),rastOff=align(infoOff+rinf.length),hashOff=align(rastOff+rast.length);
  const size=hashOff+hashes.length;
  const entries=[
    dirEntry({type:"META",flags:SF_CRITICAL|SF_CONTENT|SF_HOT|SF_IMMUTABLE,id:1,offset:metaOff,length:meta.length,crc:crc32c(meta),hashRef:0}),
    dirEntry({type:"HASH",flags:SF_CRITICAL|SF_IMMUTABLE,id:2,offset:hashOff,length:hashes.length,crc:crc32c(hashes)}),
    dirEntry({type:"PROF",flags:SF_CRITICAL|SF_CONTENT|SF_HOT|SF_IMMUTABLE,id:3,offset:profOff,length:prof.length,crc:crc32c(prof),hashRef:1}),
    dirEntry({type:"RINF",flags:SF_CONTENT|SF_IMMUTABLE,id:100,offset:infoOff,length:rinf.length,profileId:1,crc:crc32c(rinf),hashRef:2}),
    dirEntry({type:"RAST",flags:SF_CONTENT|SF_IMMUTABLE,id:101,offset:rastOff,length:rast.length,profileId:1,crc:crc32c(rast),hashRef:3})
  ];
  const directory=cat(entries),header=new Uint8Array(HEADER),d=new DataView(header.buffer);
  header.set(VFM_MAGIC,0);d.setUint16(8,1,true);d.setUint16(10,3,true);d.setUint16(12,256,true);d.setUint16(14,64,true);d.setUint8(16,1);d.setUint8(17,1);d.setUint8(18,1);d.setUint8(19,1);
  d.setUint32(20,HF_HASH|HF_PROF|HF_DET|HF_STRICT|HF_IMMUTABLE,true);d.setUint32(24,count,true);
  w64(d,32,dirOff);w64(d,40,dirLen);w64(d,48,metaOff);w64(d,56,meta.length);w64(d,80,size);header.set(uuid,88);header.set(root,112);header.set(await sha256(directory),144);header.set(await sha256(meta),176);d.setUint32(252,crc32c(header.slice(0,252)),true);
  const out=new Uint8Array(size);out.set(header);out.set(directory,dirOff);out.set(meta,metaOff);out.set(prof,profOff);out.set(rinf,infoOff);out.set(rast,rastOff);out.set(hashes,hashOff);
  return out;
}
