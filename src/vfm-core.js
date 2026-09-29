import { decodeCBOR } from "./cbor.js";

export const VFM_MAGIC = Uint8Array.of(0x56,0x46,0x4d,0x00,0x0d,0x0a,0x1a,0x0a);
export const PROFILE_CVNSS4_FEATURE = "org.xulytiengviet.vfm.feature-cvnss4/1";
const td = new TextDecoder();
const te = new TextEncoder();

export function hex(bytes){ return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""); }
export function formatBytes(n){
  if(n<1024) return n+" B";
  if(n<1024**2) return (n/1024).toFixed(1)+" KB";
  if(n<1024**3) return (n/1024**2).toFixed(2)+" MB";
  return (n/1024**3).toFixed(2)+" GB";
}
function eq(a,b){return a.length===b.length && a.every((v,i)=>v===b[i]);}
function safeNumber(v,label){
  if(v>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(label+" vượt giới hạn Number an toàn");
  return Number(v);
}
function viewU64(dv,o){return safeNumber(dv.getBigUint64(o,true),"u64");}
export function crc32c(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0x82f63b78:0);
  }
  return (crc^0xffffffff)>>>0;
}
export async function sha256(bytes){
  return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
}
function slice(bytes,o,n,label){
  if(o<0||n<0||o+n>bytes.length) throw new Error((label||"range")+" nằm ngoài file");
  return bytes.subarray(o,o+n);
}
async function decodeStoredSection(bytes,e){
  if(e.encryptionId!==0) throw new Error(e.type+": encryption_id "+e.encryptionId+" chưa được hỗ trợ");
  const stored=slice(bytes,e.offset,e.storedLength,e.type);
  if(e.compressionId===0) return stored;
  if(e.compressionId===2){
    if(typeof DecompressionStream==="undefined") throw new Error(e.type+": trình duyệt chưa hỗ trợ giải nén GZIP");
    const ds=new DecompressionStream("gzip");
    const ab=await new Response(new Blob([stored]).stream().pipeThrough(ds)).arrayBuffer();
    const raw=new Uint8Array(ab);
    if(raw.length!==e.rawLength) throw new Error(e.type+": RAW_LENGTH_MISMATCH");
    return raw;
  }
  throw new Error(e.type+": compression_id "+e.compressionId+" chưa được hỗ trợ");
}
function fourcc(bytes,o){return String.fromCharCode(...bytes.slice(o,o+4));}

function parseHeader(bytes){
  if(bytes.length<256) throw new Error("File nhỏ hơn Header VFM 256 byte");
  if(!eq(bytes.slice(0,8),VFM_MAGIC)) throw new Error("E0001 BAD_MAGIC — không phải VFM Core 1.x");
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const h={
    formatMajor:dv.getUint16(8,true), formatMinor:dv.getUint16(10,true),
    headerSize:dv.getUint16(12,true), directoryEntrySize:dv.getUint16(14,true),
    byteOrder:dv.getUint8(16), headerRevision:dv.getUint8(17),
    hashAlgorithm:dv.getUint8(18), metaCodec:dv.getUint8(19),
    flags:dv.getUint32(20,true), sectionCount:dv.getUint32(24,true),
    directoryOffset:viewU64(dv,32), directoryLength:viewU64(dv,40),
    manifestOffset:viewU64(dv,48), manifestLength:viewU64(dv,56),
    bootstrapEnd:viewU64(dv,64), footerOffset:viewU64(dv,72),
    declaredFileSize:viewU64(dv,80), datasetUUID:bytes.slice(88,104),
    generation:viewU64(dv,104), contentRootDigest:bytes.slice(112,144),
    directoryDigest:bytes.slice(144,176), manifestDigest:bytes.slice(176,208),
    buildId:bytes.slice(208,224), artifactCreatedUnixMs:viewU64(dv,224),
    headerCRC32C:dv.getUint32(252,true)
  };
  if(h.formatMajor!==1) throw new Error("E0002 UNSUPPORTED_MAJOR — chỉ hỗ trợ VFM major 1");
  if(h.headerSize!==256||h.directoryEntrySize!==64||h.byteOrder!==1) throw new Error("Header không phù hợp VFM Core 1.3");
  return h;
}

function parseDirectory(bytes,h){
  if(h.directoryOffset!==256) throw new Error("Directory offset phải là 256");
  if(h.directoryLength!==h.sectionCount*64) throw new Error("E0011 DIRECTORY_LENGTH_MISMATCH");
  if(256+h.directoryLength>16384) throw new Error("Directory vượt giới hạn Core");
  const out=[];
  for(let i=0;i<h.sectionCount;i++){
    const o=h.directoryOffset+i*64, dv=new DataView(bytes.buffer,bytes.byteOffset+o,64);
    out.push({
      index:i, type:fourcc(bytes,o), flags:dv.getUint32(4,true),
      logicalId:viewU64(dv,8), offset:viewU64(dv,16),
      storedLength:viewU64(dv,24), rawLength:viewU64(dv,32),
      profileId:dv.getUint16(40,true), sectionVersion:dv.getUint16(42,true),
      compressionId:dv.getUint16(44,true), encryptionId:dv.getUint16(46,true),
      crc32c:dv.getUint32(48,true), hashRef:dv.getUint32(52,true),
      aux:viewU64(dv,56)
    });
  }
  return out;
}

function parseHashRecords(bytes){
  if(bytes.length%48) throw new Error("HASH length không chia hết 48");
  const a=[];
  for(let o=0;o<bytes.length;o+=48){
    const dv=new DataView(bytes.buffer,bytes.byteOffset+o,48);
    a.push({
      objectKind:dv.getUint8(0), algorithm:dv.getUint8(1), digestLength:dv.getUint8(2),
      flags:dv.getUint8(3), objectId:viewU64(dv,4),
      digest:bytes.slice(o+12,o+44), reserved:dv.getUint32(44,true)
    });
  }
  return a;
}

function parseChunks(bytes,entry){
  if(!(entry.flags&(1<<3))) return [];
  const table=slice(bytes,entry.offset,entry.storedLength,"ChunkDescriptor table");
  if(table.length%128) throw new Error("ChunkDescriptor table không chia hết 128");
  const out=[];
  for(let o=0;o<table.length;o+=128){
    const dv=new DataView(table.buffer,table.byteOffset+o,128);
    out.push({
      chunkId:viewU64(dv,0), parentSectionId:viewU64(dv,8),
      logicalKeyHi:viewU64(dv,16), logicalKeyLo:viewU64(dv,24),
      offset:viewU64(dv,32), storedLength:viewU64(dv,40), rawLength:viewU64(dv,48),
      flags:dv.getUint32(56,true), crc32c:dv.getUint32(60,true),
      compressionId:dv.getUint16(64,true), encryptionId:dv.getUint16(66,true),
      hashRef:dv.getUint32(68,true), aux0:viewU64(dv,72), aux1:viewU64(dv,80), aux2:viewU64(dv,88)
    });
  }
  return out;
}

function jsonFriendlyCBOR(v){
  if(v instanceof Uint8Array) return {bytes:hex(v)};
  if(v instanceof Map){
    const o={}; for(const [k,val] of v) o[String(k)]=jsonFriendlyCBOR(val); return o;
  }
  if(Array.isArray(v)) return v.map(jsonFriendlyCBOR);
  return v;
}

export async function parseVFM(arrayBuffer){
  const bytes=arrayBuffer instanceof Uint8Array?arrayBuffer:new Uint8Array(arrayBuffer);
  const header=parseHeader(bytes);
  const directory=parseDirectory(bytes,header);
  const sections=new Map(directory.map(e=>[e.logicalId,e]));
  const report={ok:true,checks:[],warnings:[]};

  const check=(name,ok,detail="")=>{report.checks.push({name,ok,detail});if(!ok)report.ok=false;};
  check("Header CRC32C",crc32c(bytes.slice(0,252))===header.headerCRC32C,
        "expected "+header.headerCRC32C.toString(16).padStart(8,"0"));
  check("Declared file size",header.declaredFileSize===bytes.length,header.declaredFileSize+" / "+bytes.length);

  const dirBytes=slice(bytes,header.directoryOffset,header.directoryLength,"Directory");
  check("Directory SHA-256",eq(await sha256(dirBytes),header.directoryDigest));

  const rawSections=new Map();
  for(const e of directory){
    if(e.offset%8) {report.warnings.push(e.type+": offset không align 8"); report.ok=false;}
    const stored=slice(bytes,e.offset,e.storedLength,e.type);
    check(e.type+" CRC32C",crc32c(stored)===e.crc32c,"logical_id="+e.logicalId);
    e.chunks=parseChunks(bytes,e);
    e.profile=null;
    if(!e.chunks.length) rawSections.set(e.logicalId,await decodeStoredSection(bytes,e));
  }

  const metaEntry=sections.get(1), hashEntry=sections.get(2), profEntry=sections.get(3);
  if(!metaEntry||metaEntry.type!=="META") throw new Error("Thiếu META logical_id=1");
  if(!hashEntry||hashEntry.type!=="HASH") throw new Error("Thiếu HASH logical_id=2");
  if(!profEntry||profEntry.type!=="PROF") throw new Error("Thiếu PROF logical_id=3");

  const metaBytes=rawSections.get(metaEntry.logicalId);
  const profBytes=rawSections.get(profEntry.logicalId);
  const hashBytes=rawSections.get(hashEntry.logicalId);
  check("Manifest SHA-256",eq(await sha256(metaBytes),header.manifestDigest));
  check("Content root SHA-256",eq(await sha256(hashBytes),header.contentRootDigest));

  const meta=decodeCBOR(metaBytes);
  const profiles=decodeCBOR(profBytes);
  if(!Array.isArray(profiles)||!profiles.every(x=>typeof x==="string")) throw new Error("PROF không phải mảng text");
  for(const e of directory) if(e.profileId>0) e.profile=profiles[e.profileId-1]||null;

  const hashRecords=parseHashRecords(hashBytes);
  for(const e of directory){
    if((e.flags&(1<<1)) && !(e.flags&(1<<3)) && e.encryptionId===0){
      const rec=hashRecords[e.hashRef];
      if(!rec){ check(e.type+" content hash",false,"hash_ref ngoài phạm vi"); continue; }
      const raw=rawSections.get(e.logicalId);
      check(e.type+" content SHA-256",!!raw && rec.objectKind===1 && rec.objectId===e.logicalId && eq(await sha256(raw),rec.digest),
            "logical_id="+e.logicalId);
    }
  }

  const decodedSections=[];
  let featureCollection=null;
  for(const e of directory){
    const raw=rawSections.get(e.logicalId)||slice(bytes,e.offset,e.storedLength,e.type);
    let decoded=null, kind="binary";
    if(e.type==="META"){decoded=jsonFriendlyCBOR(meta);kind="cbor";}
    else if(e.type==="PROF"){decoded=profiles;kind="cbor";}
    else if(e.type==="HASH"){decoded=hashRecords.map(r=>({...r,digest:hex(r.digest)}));kind="hash";}
    else if(!e.chunks.length && e.encryptionId===0){
      const text=td.decode(raw);
      const trimmed=text.trim();
      if(trimmed.startsWith("{")||trimmed.startsWith("[")){
        try{decoded=JSON.parse(text);kind="json";}catch{}
      }
      if(decoded==null && /^[\x09\x0a\x0d\x20-\x7e\u0080-\uffff]*$/.test(text)){decoded=text;kind="text";}
    }
    if(e.profile===PROFILE_CVNSS4_FEATURE && e.type==="FEAT" && decoded && typeof decoded==="object"){
      featureCollection=decoded;
    }
    decodedSections.push({entry:e,kind,decoded,bytePreview:hex(raw.slice(0,64))});
  }

  return {
    bytes, header, directory, meta:jsonFriendlyCBOR(meta), profiles,
    hashRecords:hashRecords.map(r=>({...r,digest:hex(r.digest)})),
    decodedSections, featureCollection, report,
    summary:{size:bytes.length,uuid:hex(header.datasetUUID),version:header.formatMajor+"."+header.formatMinor}
  };
}

export function getTextRows(vfm){
  const fc=vfm.featureCollection;
  if(!fc||!Array.isArray(fc.features)) return [];
  const rows=[];
  for(const f of fc.features){
    const props=f.properties||{}, cv4=f.cv4||{};
    for(const [key,value] of Object.entries(props)){
      if(typeof value==="string"){
        rows.push({featureId:f.id||"",field:key,unicode:value,cv4:typeof cv4[key]==="string"?cv4[key]:""});
      }
    }
  }
  return rows;
}

export function deriveCv4(unicode){
  const c=globalThis.CVNSSConverter;
  if(!c||typeof c.fromCqn!=="function") return "";
  try{return c.fromCqn(unicode).cvss||"";}catch{return "";}
}

export function canonicalUnicodeFromCv4(code){
  const c=globalThis.CVNSSConverter;
  if(!c||typeof c.fromCvss!=="function") return "";
  try{return c.fromCvss(code).cqn||"";}catch{return "";}
}

export function utf8Bytes(s){return te.encode(s);}
