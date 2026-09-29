const te=new TextEncoder(),td=new TextDecoder();

function cat(parts){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length;}return o;}
function head(major,n){
  if(n<24)return Uint8Array.of((major<<5)|n);
  if(n<=0xff)return Uint8Array.of((major<<5)|24,n);
  if(n<=0xffff){const a=new Uint8Array(3);a[0]=(major<<5)|25;new DataView(a.buffer).setUint16(1,n,false);return a;}
  if(n<=0xffffffff){const a=new Uint8Array(5);a[0]=(major<<5)|26;new DataView(a.buffer).setUint32(1,n,false);return a;}
  const a=new Uint8Array(9);a[0]=(major<<5)|27;new DataView(a.buffer).setBigUint64(1,BigInt(n),false);return a;
}
function enc(v){
  if(v===null)return Uint8Array.of(0xf6);
  if(v===false)return Uint8Array.of(0xf4);
  if(v===true)return Uint8Array.of(0xf5);
  if(typeof v==="number"){
    if(Number.isSafeInteger(v) && v>=0)return head(0,v);
    if(Number.isSafeInteger(v) && v<0)return head(1,-1-v);
    const a=new Uint8Array(9);a[0]=0xfb;new DataView(a.buffer).setFloat64(1,v,false);return a;
  }
  if(typeof v==="string"){const b=te.encode(v);return cat([head(3,b.length),b]);}
  if(v instanceof Uint8Array)return cat([head(2,v.length),v]);
  if(Array.isArray(v))return cat([head(4,v.length),...v.map(enc)]);
  if(typeof v==="object"){
    const entries=Object.entries(v).map(([k,val])=>[enc(k),enc(val)]);
    entries.sort((a,b)=>a[0].length-b[0].length||compare(a[0],b[0]));
    return cat([head(5,entries.length),...entries.flat()]);
  }
  throw new Error("GeoCBOR: kiểu dữ liệu không hỗ trợ");
}
function compare(a,b){for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;}
function len(bytes,s,ai){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(ai<24)return ai;if(ai===24)return bytes[s.i++];if(ai===25){const v=dv.getUint16(s.i,false);s.i+=2;return v;}
  if(ai===26){const v=dv.getUint32(s.i,false);s.i+=4;return v;}if(ai===27){const v=dv.getBigUint64(s.i,false);s.i+=8;return Number(v);}
  throw new Error("GeoCBOR indefinite length không được hỗ trợ");
}
function dec(bytes,s){
  const b=bytes[s.i++],major=b>>5,ai=b&31,dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(major===7){
    if(ai===20)return false;if(ai===21)return true;if(ai===22)return null;
    if(ai===27){const v=dv.getFloat64(s.i,false);s.i+=8;return v;}
    throw new Error("GeoCBOR simple/float chưa hỗ trợ");
  }
  const n=len(bytes,s,ai);
  if(major===0)return n;if(major===1)return -1-n;
  if(major===2){const v=bytes.slice(s.i,s.i+n);s.i+=n;return v;}
  if(major===3){const v=td.decode(bytes.slice(s.i,s.i+n));s.i+=n;return v;}
  if(major===4)return Array.from({length:n},()=>dec(bytes,s));
  if(major===5){const o={};for(let i=0;i<n;i++){const k=dec(bytes,s);o[String(k)]=dec(bytes,s);}return o;}
  throw new Error("GeoCBOR major type không hỗ trợ");
}
export function encodeGeoCBOR(payload){
  return enc({type:"xulyVFM.GeoCBOR",version:1,crs:payload.crs||"EPSG:4326",payload});
}
export function decodeGeoCBOR(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),s={i:0},o=dec(bytes,s);
  if(!o||o.type!=="xulyVFM.GeoCBOR"||!o.payload)throw new Error("CBOR không thuộc profile xulyVFM.GeoCBOR/1");
  return o.payload;
}
