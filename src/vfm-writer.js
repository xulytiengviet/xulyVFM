import { cbor } from "./cbor.js";
import { VFM_MAGIC, PROFILE_CVNSS4_FEATURE, crc32c, sha256, utf8Bytes } from "./vfm-core.js";

const HEADER=256, DIR=64, HASHREC=48, NONE=0xffffffff;
const HF_HASH=1<<1, HF_PROF=1<<2, HF_DET=1<<5, HF_STRICT=1<<6, HF_IMMUTABLE=1<<7;
const SF_CRITICAL=1<<0, SF_CONTENT=1<<1, SF_HOT=1<<2, SF_IMMUTABLE=1<<7;

const align=(n,a=8)=>(n+a-1)&~(a-1);
const cat=(parts)=>{const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length;}return o;};
function w64(dv,o,n){dv.setBigUint64(o,BigInt(n),true);}
function isZero(a){return a.every(x=>x===0);}
function hashRecord(kind,id,digest){
  const a=new Uint8Array(HASHREC),d=new DataView(a.buffer);
  d.setUint8(0,kind);d.setUint8(1,1);d.setUint8(2,32);d.setUint8(3,3);w64(d,4,id);
  a.set(digest,12);d.setUint32(44,0,true);return a;
}
function dirEntry({type,flags,id,offset,storedLength,rawLength,profileId=0,version=1,compression=0,encryption=0,crc,hashRef=NONE,aux=0}){
  const a=new Uint8Array(DIR),d=new DataView(a.buffer);
  for(let i=0;i<4;i++)a[i]=type.charCodeAt(i);
  d.setUint32(4,flags,true);w64(d,8,id);w64(d,16,offset);w64(d,24,storedLength);w64(d,32,rawLength);
  d.setUint16(40,profileId,true);d.setUint16(42,version,true);d.setUint16(44,compression,true);d.setUint16(46,encryption,true);
  d.setUint32(48,crc,true);d.setUint32(52,hashRef,true);w64(d,56,aux);return a;
}

export async function buildFeatureVFM(featurePayload){
  const feat=utf8Bytes(JSON.stringify(featurePayload));
  let uuid=(await sha256(feat)).slice(0,16);
  if(isZero(uuid)) uuid=Uint8Array.of(1,...new Uint8Array(15));
  const meta=cbor.mapInt([
    [0,cbor.array([cbor.uint(1),cbor.uint(3)])],
    [1,cbor.bytes(uuid)],
    [4,cbor.uint(3)],
    [5,cbor.uint(2)]
  ]);
  const prof=cbor.array([cbor.text(PROFILE_CVNSS4_FEATURE)]);
  const digMeta=await sha256(meta), digProf=await sha256(prof), digFeat=await sha256(feat);
  const hashPayload=cat([hashRecord(1,1,digMeta),hashRecord(1,3,digProf),hashRecord(1,100,digFeat)]);
  const root=await sha256(hashPayload);

  const count=4, dirOff=256, dirLen=count*64;
  const metaOff=align(dirOff+dirLen,64);
  const profOff=align(metaOff+meta.length,8);
  const featOff=align(profOff+prof.length,8);
  const hashOff=align(featOff+feat.length,8);
  const size=hashOff+hashPayload.length;

  const entries=[
    dirEntry({type:"META",flags:SF_CRITICAL|SF_CONTENT|SF_HOT|SF_IMMUTABLE,id:1,offset:metaOff,storedLength:meta.length,rawLength:meta.length,crc:crc32c(meta),hashRef:0}),
    dirEntry({type:"HASH",flags:SF_CRITICAL|SF_IMMUTABLE,id:2,offset:hashOff,storedLength:hashPayload.length,rawLength:hashPayload.length,crc:crc32c(hashPayload)}),
    dirEntry({type:"PROF",flags:SF_CRITICAL|SF_CONTENT|SF_HOT|SF_IMMUTABLE,id:3,offset:profOff,storedLength:prof.length,rawLength:prof.length,crc:crc32c(prof),hashRef:1}),
    dirEntry({type:"FEAT",flags:SF_CONTENT|SF_IMMUTABLE,id:100,offset:featOff,storedLength:feat.length,rawLength:feat.length,profileId:1,crc:crc32c(feat),hashRef:2})
  ];
  const directory=cat(entries);

  const header=new Uint8Array(HEADER),d=new DataView(header.buffer);
  header.set(VFM_MAGIC,0);
  d.setUint16(8,1,true);d.setUint16(10,3,true);d.setUint16(12,256,true);d.setUint16(14,64,true);
  d.setUint8(16,1);d.setUint8(17,1);d.setUint8(18,1);d.setUint8(19,1);
  d.setUint32(20,HF_HASH|HF_PROF|HF_DET|HF_STRICT|HF_IMMUTABLE,true);
  d.setUint32(24,count,true);d.setUint32(28,0,true);
  w64(d,32,dirOff);w64(d,40,dirLen);w64(d,48,metaOff);w64(d,56,meta.length);w64(d,64,0);w64(d,72,0);w64(d,80,size);
  header.set(uuid,88);w64(d,104,0);header.set(root,112);header.set(await sha256(directory),144);header.set(await sha256(meta),176);
  w64(d,224,0);w64(d,232,0);
  d.setUint32(252,crc32c(header.slice(0,252)),true);

  const out=new Uint8Array(size);
  out.set(header,0);out.set(directory,dirOff);out.set(meta,metaOff);out.set(prof,profOff);out.set(feat,featOff);out.set(hashPayload,hashOff);
  return out;
}

function parseCoords(text){
  return text.trim().split(/\s+/).filter(Boolean).map(t=>t.split(",").slice(0,3).map(Number));
}
function childElements(el){return [...el.children];}
function local(el){return el.localName;}
function geometryFrom(el){
  if(!el)return null;
  if(local(el)==="Point"){
    const c=el.querySelector("coordinates");const a=c?parseCoords(c.textContent):[];return a[0]?{type:"Point",coordinates:a[0]}:null;
  }
  if(local(el)==="LineString"){
    const c=el.querySelector("coordinates");return c?{type:"LineString",coordinates:parseCoords(c.textContent)}:null;
  }
  if(local(el)==="Polygon"){
    const rings=[];
    const outer=el.querySelector("outerBoundaryIs coordinates"); if(outer)rings.push(parseCoords(outer.textContent));
    for(const inner of el.querySelectorAll("innerBoundaryIs coordinates"))rings.push(parseCoords(inner.textContent));
    return {type:"Polygon",coordinates:rings};
  }
  if(local(el)==="MultiGeometry"){
    const gs=childElements(el).map(geometryFrom).filter(Boolean);
    if(!gs.length)return null;
    if(gs.every(g=>g.type==="Polygon"))return {type:"MultiPolygon",coordinates:gs.map(g=>g.coordinates)};
    if(gs.every(g=>g.type==="LineString"))return {type:"MultiLineString",coordinates:gs.map(g=>g.coordinates)};
    if(gs.every(g=>g.type==="Point"))return {type:"MultiPoint",coordinates:gs.map(g=>g.coordinates)};
    return {type:"GeometryCollection",geometries:gs};
  }
  return null;
}
function stable32(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,"0");}
function textValue(node,selector){const x=node.querySelector(selector);return x?x.textContent.trim():"";}
function cv4(s){
  if(!s||!globalThis.CVNSSConverter)return "";
  try{return globalThis.CVNSSConverter.fromCqn(s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).cvss||"";}catch{return "";}
}

export function kmlToFeaturePayload(xmlText,fileName="dataset.kml"){
  const xml=new DOMParser().parseFromString(xmlText,"application/xml");
  const err=xml.querySelector("parsererror");if(err)throw new Error("KML/XML không hợp lệ");
  const placemarks=[...xml.getElementsByTagNameNS("*","Placemark")];
  const features=[];
  for(let i=0;i<placemarks.length;i++){
    const p=placemarks[i], name=textValue(p,"name"), description=textValue(p,"description"), styleUrl=textValue(p,"styleUrl");
    const props={};
    if(name)props.name=name;if(description)props.description=description;if(styleUrl)props.styleUrl=styleUrl;
    for(const d of p.getElementsByTagNameNS("*","Data")){
      const key=d.getAttribute("name");const v=d.getElementsByTagNameNS("*","value")[0];
      if(key&&v)props[key]=v.textContent.trim();
    }
    const geomNode=childElements(p).find(x=>["Point","LineString","Polygon","MultiGeometry"].includes(local(x)));
    const geometry=geometryFrom(geomNode);
    const cv={};for(const [k,v] of Object.entries(props))if(typeof v==="string"&&v.trim())cv[k]=cv4(v);
    const id="vfm:kml:"+stable32((name||"feature")+"|"+JSON.stringify(geometry)+"|"+i);
    features.push({id,geometry,properties:props,cv4:cv});
  }
  return {
    schema:1,profile:PROFILE_CVNSS4_FEATURE,crs:"OGC:CRS84",
    source:{format:"KML 2.2",fileName},
    featureCount:features.length,features
  };
}
