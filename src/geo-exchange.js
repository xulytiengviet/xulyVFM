const te=new TextEncoder();
const td=new TextDecoder();

function escText(v){return String(v??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
function escAttr(v){return escText(v).replace(/"/g,"&quot;");}
function coord(p){return Array.isArray(p)?p.filter((_,i)=>i<3).join(","):"";}
function coordList(a){return (a||[]).map(coord).join(" ");}

function geometryToKML(g,indent="      "){
  if(!g)return "";
  const i=indent, j=i+"  ";
  if(g.type==="Point")return `${i}<Point><coordinates>${coord(g.coordinates)}</coordinates></Point>`;
  if(g.type==="LineString")return `${i}<LineString><tessellate>1</tessellate><coordinates>${coordList(g.coordinates)}</coordinates></LineString>`;
  if(g.type==="Polygon"){
    const rings=g.coordinates||[];let s=`${i}<Polygon>`;
    if(rings[0])s+=`\n${j}<outerBoundaryIs><LinearRing><coordinates>${coordList(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
    for(const r of rings.slice(1))s+=`\n${j}<innerBoundaryIs><LinearRing><coordinates>${coordList(r)}</coordinates></LinearRing></innerBoundaryIs>`;
    return s+`\n${i}</Polygon>`;
  }
  const children=[];
  if(g.type==="MultiPoint")for(const x of g.coordinates||[])children.push({type:"Point",coordinates:x});
  else if(g.type==="MultiLineString")for(const x of g.coordinates||[])children.push({type:"LineString",coordinates:x});
  else if(g.type==="MultiPolygon")for(const x of g.coordinates||[])children.push({type:"Polygon",coordinates:x});
  else if(g.type==="GeometryCollection")children.push(...(g.geometries||[]));
  if(children.length)return `${i}<MultiGeometry>\n${children.map(x=>geometryToKML(x,j)).join("\n")}\n${i}</MultiGeometry>`;
  return "";
}

export function featurePayloadToKML(payload){
  if(!payload||!Array.isArray(payload.features))throw new Error("VFM không có Feature payload có thể xuất KML");
  const docName=(payload.source?.fileName||"VFM dataset").replace(/\.(kml|kmz|vfm)$/i,"");
  const rows=payload.features.map((f,idx)=>{
    const p=f.properties||{};
    const name=p.name??p.ten_tinh??p.ten??("Feature "+(idx+1));
    const description=p.description??"";
    const style=p.styleUrl??"";
    const extra=Object.entries(p).filter(([k])=>!["name","description","styleUrl"].includes(k));
    let s=`    <Placemark id="${escAttr(f.id||("feature-"+(idx+1)))}">\n      <name>${escText(name)}</name>`;
    if(description)s+=`\n      <description><![CDATA[${String(description).replace(/]]>/g,"]]]]><![CDATA[>")}]]></description>`;
    if(style)s+=`\n      <styleUrl>${escText(style)}</styleUrl>`;
    if(extra.length){
      s+="\n      <ExtendedData>";
      for(const [k,v] of extra){
        const value=typeof v==="string"?v:JSON.stringify(v);
        s+=`\n        <Data name="${escAttr(k)}"><value>${escText(value)}</value></Data>`;
      }
      s+="\n      </ExtendedData>";
    }
    const g=geometryToKML(f.geometry,"      ");if(g)s+="\n"+g;
    return s+"\n    </Placemark>";
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escText(docName)}</name>\n${rows}\n  </Document>\n</kml>\n`;
}

function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function cat(parts){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let at=0;for(const p of parts){o.set(p,at);at+=p.length;}return o;}
function u16(a,o,v){new DataView(a.buffer,a.byteOffset,a.byteLength).setUint16(o,v,true);}
function u32(a,o,v){new DataView(a.buffer,a.byteOffset,a.byteLength).setUint32(o,v>>>0,true);}

export function kmlToKMZ(kmlText){
  const name=te.encode("doc.kml"),data=te.encode(kmlText),crc=crc32(data);
  const local=new Uint8Array(30+name.length);
  u32(local,0,0x04034b50);u16(local,4,20);u16(local,6,0);u16(local,8,0);
  u32(local,14,crc);u32(local,18,data.length);u32(local,22,data.length);u16(local,26,name.length);u16(local,28,0);local.set(name,30);
  const central=new Uint8Array(46+name.length);
  u32(central,0,0x02014b50);u16(central,4,20);u16(central,6,20);u16(central,8,0);u16(central,10,0);
  u32(central,16,crc);u32(central,20,data.length);u32(central,24,data.length);u16(central,28,name.length);u16(central,30,0);u16(central,32,0);
  u32(central,38,0);u32(central,42,0);central.set(name,46);
  const eocd=new Uint8Array(22);
  u32(eocd,0,0x06054b50);u16(eocd,8,1);u16(eocd,10,1);u32(eocd,12,central.length);u32(eocd,16,local.length+data.length);
  return cat([local,data,central,eocd]);
}

function findEOCD(bytes){
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0,true)===0x06054b50)return i;
  }
  return -1;
}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==="undefined")throw new Error("Trình duyệt chưa hỗ trợ giải nén KMZ/DEFLATE");
  const ds=new DecompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}

export async function kmzToKML(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const eocd=findEOCD(bytes);if(eocd<0)throw new Error("KMZ/ZIP không có End of Central Directory");
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const count=dv.getUint16(eocd+10,true),cdOffset=dv.getUint32(eocd+16,true);
  let at=cdOffset,best=null;
  for(let n=0;n<count;n++){
    if(dv.getUint32(at,true)!==0x02014b50)throw new Error("Central Directory KMZ không hợp lệ");
    const method=dv.getUint16(at+10,true),comp=dv.getUint32(at+20,true),raw=dv.getUint32(at+24,true);
    const fn=dv.getUint16(at+28,true),ex=dv.getUint16(at+30,true),cm=dv.getUint16(at+32,true),local=dv.getUint32(at+42,true);
    const name=td.decode(bytes.subarray(at+46,at+46+fn));
    if(/\.kml$/i.test(name) && (!best || /(^|\/)doc\.kml$/i.test(name)))best={name,method,comp,raw,local};
    at+=46+fn+ex+cm;
  }
  if(!best)throw new Error("KMZ không chứa file KML");
  if(dv.getUint32(best.local,true)!==0x04034b50)throw new Error("Local header KMZ không hợp lệ");
  const fn=dv.getUint16(best.local+26,true),ex=dv.getUint16(best.local+28,true);
  const start=best.local+30+fn+ex,compressed=bytes.subarray(start,start+best.comp);
  let raw;
  if(best.method===0)raw=compressed;
  else if(best.method===8)raw=await inflateRaw(compressed);
  else throw new Error("KMZ dùng compression method chưa hỗ trợ: "+best.method);
  if(best.raw && raw.length!==best.raw)throw new Error("KMZ uncompressed size không khớp");
  return {kml:td.decode(raw),entryName:best.name};
}

export async function saveBytes(bytes,fileName,mime="application/octet-stream"){
  if("showSaveFilePicker" in window){
    const ext="."+fileName.split(".").pop().toLowerCase();
    const handle=await window.showSaveFilePicker({suggestedName:fileName,types:[{description:"Tệp "+ext.toUpperCase(),accept:{[mime]:[ext]}}]});
    const writable=await handle.createWritable();await writable.write(bytes);await writable.close();return "direct";
  }
  const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mime});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return "browser";
}
export async function saveText(text,fileName,mime="application/vnd.google-earth.kml+xml"){
  return saveBytes(te.encode(text),fileName,mime);
}
