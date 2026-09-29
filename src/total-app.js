import { FORMATS, FORMAT_MAP, CRS_OPTIONS, detectFormat, extensionOf, compatibility } from "./format-registry.js";
import { parseVFM, formatBytes } from "./vfm-core.js";
import { buildFeatureVFM } from "./vfm-writer.js";
import { buildRasterVFM } from "./vfm-raster.js";
import { kmlToFeaturePayload } from "./vfm-writer.js";
import { featurePayloadToKML, kmlToKMZ, kmzToKML, saveBytes as rawSaveBytes, saveText as rawSaveText, zipFiles } from "./geo-exchange.js";
import { geoJSONToFeaturePayload, featurePayloadToGeoJSON, featurePayloadToJSON, parseGISJSON } from "./light-formats.js";
import { encodeGeoCBOR, decodeGeoCBOR } from "./geocbor.js";
import { vectorToGeoJSON, geoJSONToVector, inspectGdal, rasterConvert, rasterToGTiff, warmGdal, isGdalReady } from "./gdal-engine.js";
import { chooseExecution } from "./execution-router.js";
import { RUNTIME_CONFIG, backendAvailable } from "./runtime-config.js";

import { applyOutputPolicy } from "./output-policy.js";
import { createIdentity, exportIdentity, importIdentity, fingerprint, signOutput, verifyOutput } from "./provenance.js";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const input=$("#fileInput"),folderInput=$("#folderInput"),drop=$("#dropzone"),status=$("#status");
const jobPanel=$("#jobPanel"),sourceName=$("#sourceName"),sourceFiles=$("#sourceFiles"),sourceIcon=$("#sourceIcon");
const targetFormat=$("#targetFormat"),sourceCrs=$("#sourceCrs"),targetCrs=$("#targetCrs"),convertBtn=$("#convertBtn"),jobHint=$("#jobHint");
let state={files:[],fileList:null,format:null,payload:null,vfm:null,sourceIsRaster:false,sourceKind:"unknown",preferredTarget:null};
let category="Tất cả",modalResolver=null;

const te=new TextEncoder(),td=new TextDecoder();
let signingIdentity=null, verifiedPackage=null;
function outputMode(){return $("#outputMode").value;}
function selectedFields(){const value=$("#cvnssFields").value.trim();return value?value.split(",").map(x=>x.trim()).filter(Boolean):null;}
function policyPayload(payload){return applyOutputPolicy(payload,outputMode(),selectedFields());}
async function saveBytes(bytes,name,mime="application/octet-stream"){
  if(outputMode()==="signed"){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes instanceof Blob?await bytes.arrayBuffer():bytes);
    const signed=await signOutput(data,{fileName:name,mime,owner:$("#ownerName").value,identity:signingIdentity});
    return rawSaveBytes(signed,name+".vfms","application/json");
  }
  return rawSaveBytes(bytes,name,mime);
}
async function saveText(text,name,mime="application/vnd.google-earth.kml+xml"){return saveBytes(te.encode(text),name,mime);}
function syncOutputMode(){
  const mode=outputMode();
  $("#fieldPicker").classList.toggle("hidden",mode!=="cvnss");
  $("#signingOptions").classList.toggle("hidden",mode!=="signed");
  $("#outputModeHint").textContent=mode==="normal"?"Giữ thuộc tính Unicode; không xuất bản cv4 song song.":mode==="cvnss"?"Thay text trong các trường đã chọn bằng CVNSS4.0 (kể cả text lồng nhau). Giữ tên trường, số, geometry, ID và liên kết. Đây không phải mã hóa bảo mật và không yêu cầu xin quyền đọc.":"Xuất gói .vfms chứa file GIS + hash + chữ ký. Thuộc tính vẫn đọc được. Tên khai báo chỉ được tin cậy khi đối chiếu khóa qua kênh độc lập.";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setStatus(text,kind=""){status.textContent=text;status.className="total-status "+kind;}
function baseName(name="dataset"){return name.replace(/\.(vfm|geojson|json|kml|kmz|gpx|gml|gpkg|shp|dxf|dgn|tab|mif|mid|e00|sqlite|db|tif|tiff|csv|txt|cbor|zip)$/i,"");}
function primaryName(){return state.files[0]?.name||"dataset";}
function knownWgs84(formatId){return ["kml","kmz","geojson","gpx"].includes(formatId);}
function normalizeCrs(v){
  if(!v)return "UNKNOWN";
  const s=String(v).toUpperCase();
  if(s==="OGC:CRS84"||s.includes("4326"))return "EPSG:4326";
  if(s.includes("4756"))return "EPSG:4756";
  if(s.includes("3405"))return "EPSG:3405";
  if(s.includes("3406"))return "EPSG:3406";
  return v;
}
function outputExt(id){
  return ({vfm:"vfm",dxf:"dxf",dgn:"dgn",kml:"kml",kmz:"kmz",shp:"shp.zip",geojson:"geojson",json:"json",gpx:"gpx",gml:"gml",gpkg:"gpkg",gdb:"gdb.zip",tab:"tab.zip",mif:"mif.zip",e00:"e00",sqlite:"sqlite",tif:"tif",csv:"csv",txt:"txt",cbor:"cbor"})[id]||id;
}
function filesText(files){return [...files].map(f=>f.webkitRelativePath||f.name).slice(0,4).join(", ")+([...files].length>4?` +${[...files].length-4} file`:"");}

function fillCrs(){
  sourceCrs.innerHTML='<option value="AUTO">Tự nhận diện</option>'+CRS_OPTIONS.filter(x=>x.id!=="KEEP").map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join("");
  targetCrs.innerHTML=CRS_OPTIONS.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join("");
  targetCrs.value="EPSG:4326";
}
function fillTargets(){
  targetFormat.innerHTML=FORMATS.filter(f=>f.write).map(f=>`<option value="${f.id}">${esc(f.name)} · ${esc(f.ext)}</option>`).join("");
  const pref=state.preferredTarget&&FORMAT_MAP.get(state.preferredTarget)?.write?state.preferredTarget:null;
  if(pref)targetFormat.value=pref;
  else if(state.format?.id!=="vfm")targetFormat.value="vfm";
  else targetFormat.value=state.sourceIsRaster?"tif":"geojson";
  syncCrsLocks();
}
function syncCrsLocks(){
  const target=FORMAT_MAP.get(targetFormat.value);
  if(target?.crsLocked){targetCrs.value=target.crsLocked;targetCrs.disabled=true;}
  else targetCrs.disabled=false;
  if(knownWgs84(state.format?.id)){sourceCrs.value="EPSG:4326";sourceCrs.disabled=true;}
  else if(state.format?.id==="vfm"&&state.payload?.crs){
    const c=normalizeCrs(state.payload.crs);
    if([...sourceCrs.options].some(o=>o.value===c))sourceCrs.value=c;
    sourceCrs.disabled=false;
  }else sourceCrs.disabled=false;
  updateJobHint();
}
function updateJobHint(){
  if(!state.format)return;
  const target=FORMAT_MAP.get(targetFormat.value),tc=targetCrs.value;
  const c=compatibility(state.format,target,{sourceIsRaster:!!state.sourceIsRaster,targetCrs:tc});
  const parts=[];
  if(c.reason)parts.push(c.reason);
  if(state.format.multi)parts.push("Nguồn nhiều file: hãy chọn đủ sidecar/thư mục để tránh mất schema hoặc geometry.");
  if(sourceCrs.value==="AUTO"&&!knownWgs84(state.format.id)&&state.format.id!=="vfm")parts.push("Nếu file không khai báo CRS, hãy chọn CRS nguồn thủ công trước khi reprojection.");
  if(["EPSG:4756","EPSG:3405","EPSG:3406"].includes(tc))parts.push("Không dùng phép nội suy tên tỉnh để suy ra VN-2000; chỉ EPSG đã chọn mới được áp dụng.");
  jobHint.textContent=parts.join(" ");
}

function renderFormats(){
  const q=$("#formatSearch").value.trim().toLowerCase();
  const rows=FORMATS.filter(f=>(category==="Tất cả"||f.group===category)&&(!q||[f.name,f.ext,f.type,f.note,f.group].join(" ").toLowerCase().includes(q)));
  $("#formatGrid").innerHTML=rows.map(f=>`
    <article class="format-card ${f.engine==="blocked"?"blocked":""}" data-format="${f.id}" data-engine="${f.engine}">
      <div class="format-card-head"><span class="format-icon">${esc(f.id.toUpperCase().slice(0,4))}</span><span class="engine-dot">${f.engine==="native"?"Native":f.engine==="gdal"?"Engine nâng cao":"Cảnh báo"}</span></div>
      <h3>${esc(f.name)}</h3><div class="ext">${esc(f.ext)}</div><p>${esc(f.note)}</p>
    </article>`).join("");
}
function renderCategories(){
  const cats=["Tất cả",...new Set(FORMATS.map(f=>f.group))];
  $("#categoryTabs").innerHTML=cats.map(c=>`<button class="${c===category?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
}
function renderTable(){
  $("#formatTable").innerHTML=FORMATS.map(f=>`<tr>
    <td><b>${esc(f.name)}</b></td><td class="mono">${esc(f.ext)}</td><td>${esc(f.type)}</td>
    <td><span class="engine-badge ${f.engine}">${f.engine==="native"?"Native":f.engine==="gdal"?"Tự động":"Browser block"}</span></td>
    <td><span class="yn ${f.read?"y":"n"}">${f.read?"✓":"—"}</span></td><td><span class="yn ${f.write?"y":"n"}">${f.write?"✓":"—"}</span></td><td>${esc(f.note)}</td>
  </tr>`).join("");
}
function showModal({title="Cảnh báo chuyển đổi",text="",extra="",allowContinue=false,continueLabel="Tiếp tục"}){
  $("#modalTitle").textContent=title;$("#modalText").textContent=text;$("#modalExtra").textContent=extra;
  $("#modalExtra").classList.toggle("hidden",!extra);$("#modalContinue").classList.toggle("hidden",!allowContinue);
  $("#modalContinue").textContent=continueLabel;$("#modal").classList.remove("hidden");
  return new Promise(resolve=>{modalResolver=resolve;});
}
function closeModal(value=false){$("#modal").classList.add("hidden");if(modalResolver){modalResolver(value);modalResolver=null;}}
function preflight(files,format){
  const exts=new Set([...files].map(f=>extensionOf(f.name)));
  if(format.id==="shp"){
    const miss=["shp","shx","dbf"].filter(x=>!exts.has(x));
    if(miss.length)return {ok:false,reason:"Shapefile là bộ nhiều file. Thiếu: "+miss.map(x=>"."+x).join(", ")+". .prj và .cpg không bắt buộc nhưng nên có."};
  }
  if(format.id==="mif"&&!exts.has("mif"))return {ok:false,reason:"MIF/MID cần ít nhất file .mif; .mid chứa thuộc tính đi kèm nếu dataset có bảng thuộc tính."};
  if(format.id==="tab"&&!exts.has("tab"))return {ok:false,reason:"MapInfo TAB cần file .tab và các sidecar liên quan (.dat/.map/.id tùy dataset)."};
  if(format.id==="gdb"){
    const hasFolder=[...files].some(f=>(f.webkitRelativePath||"").toLowerCase().includes(".gdb/"));
    const hasZip=[...files].some(f=>/\.gdb\.zip$/i.test(f.name));
    if(!hasFolder&&!hasZip)return {ok:false,reason:".gdb là một thư mục geodatabase. Hãy dùng “Chọn thư mục .gdb” hoặc cung cấp file .gdb.zip."};
  }
  if(format.id==="mdb")return {ok:false,reason:format.note};
  return {ok:true};
}

async function parseNativeSource(){
  const f=state.files[0],bytes=new Uint8Array(await f.arrayBuffer());
  if(state.format.id==="vfm"){
    state.vfm=await parseVFM(bytes);
    if(!state.vfm.report.ok)throw new Error("VFM không đạt kiểm tra toàn vẹn; dừng chuyển đổi.");
    if(state.vfm.featureCollection){state.payload=state.vfm.featureCollection;state.sourceKind="vector";state.sourceIsRaster=false;}
    else if(state.vfm.rasterAsset){state.sourceKind="raster";state.sourceIsRaster=true;}
    else throw new Error("VFM không có Feature hoặc Raster profile mà Total GIS Converter hiểu.");
  }else if(state.format.id==="kml"){
    state.payload=kmlToFeaturePayload(td.decode(bytes),f.name);state.sourceKind="vector";
  }else if(state.format.id==="kmz"){
    const x=await kmzToKML(bytes);state.payload=kmlToFeaturePayload(x.kml,f.name);state.sourceKind="vector";
  }else if(state.format.id==="geojson"||state.format.id==="json"){
    state.payload=parseGISJSON(td.decode(bytes),f.name);state.sourceKind="vector";
  }else if(state.format.id==="cbor"){
    state.payload=decodeGeoCBOR(bytes);state.sourceKind="vector";
  }else if(state.format.id==="tif"){
    state.sourceKind="raster";state.sourceIsRaster=true;
  }
}

async function selectFiles(files){
  if(!files?.length)return;
  const arr=[...files];
  if(arr.reduce((n,f)=>n+f.size,0)>90_000_000){setStatus("Tổng dữ liệu vượt giới hạn 90 MB.","badtext");return;}
  const format=detectFormat(arr);
  if(!format){await showModal({title:"Không nhận diện được định dạng",text:"Đuôi file chưa nằm trong ma trận Total GIS Converter.",extra:"Có thể đóng gói/đổi tên đúng phần mở rộng hoặc mở issue trên GitHub để bổ sung driver."});return;}
  const pf=preflight(arr,format);
  if(!pf.ok){await showModal({title:"Thiếu thành phần dataset",text:pf.reason});return;}
  state={files:arr,fileList:files,format,payload:null,vfm:null,sourceIsRaster:!!format.raster,sourceKind:format.raster?"raster":"unknown",preferredTarget:state.preferredTarget};
  setStatus("Đang kiểm tra "+format.name+"…","busy");
  try{
    if(format.engine==="native"||format.id==="tif")await parseNativeSource();
    sourceName.textContent=format.name;sourceIcon.textContent=format.id.toUpperCase().slice(0,4);sourceFiles.textContent=filesText(arr);
    fillTargets();jobPanel.classList.remove("hidden");jobPanel.scrollIntoView({behavior:"smooth",block:"center"});
    if(format.engine==="gdal"){
      warmGdal().then(()=>{if(isGdalReady()&&state.format===format)setStatus(format.name+" đã sẵn sàng · engine chuyển đổi nâng cao đã chuẩn bị xong.","good");});
    }
    const count=state.payload?.featureCount;
    const detail=count!=null?` · ${Number(count).toLocaleString()} feature`:state.sourceIsRaster?" · raster":"";
    setStatus(`${format.name} đã sẵn sàng${detail}. Chọn định dạng đích và CRS.`,"good");
  }catch(err){console.error(err);setStatus("Không đọc được dữ liệu: "+err.message,"badtext");await showModal({title:"Không đọc được nguồn",text:err.message});}
}
function declaredSourceCrs(){
  if(knownWgs84(state.format?.id))return "EPSG:4326";
  if(sourceCrs.value!=="AUTO")return sourceCrs.value;
  if(state.payload?.crs)return normalizeCrs(state.payload.crs);
  if(state.vfm?.rasterInfo?.crs)return normalizeCrs(state.vfm.rasterInfo.crs);
  return "AUTO";
}
function payloadFile(payload){
  return new File([JSON.stringify(featurePayloadToGeoJSON(payload))],"vfm_bridge.geojson",{type:"application/geo+json"});
}
async function transformPayload(payload,target){
  if(target==="KEEP")return payload;
  const src=declaredSourceCrs()==="AUTO"?normalizeCrs(payload.crs):declaredSourceCrs();
  if(src===target){payload.crs=target;return payload;}
  if(src==="AUTO"||src==="UNKNOWN")throw new Error("Không thể reprojection vì CRS nguồn chưa xác định. Hãy chọn CRS nguồn thủ công.");
  setStatus(`Đang biến đổi tọa độ ${src} → ${target} bằng GDAL/PROJ…`,"busy");
  const bytes=await vectorToGeoJSON(payloadFile(payload),{sourceCrs:src,targetCrs:target,onStatus:t=>setStatus(t,"busy")});
  const obj=JSON.parse(td.decode(bytes));
  return geoJSONToFeaturePayload(obj,primaryName(),target);
}
async function loadVectorPayload(target="KEEP"){
  if(state.payload)return transformPayload(state.payload,target);
  const src=declaredSourceCrs();
  const bytes=await vectorToGeoJSON(state.fileList||state.files,{sourceCrs:src,targetCrs:target,onStatus:t=>setStatus(t,"busy")});
  const obj=JSON.parse(td.decode(bytes));
  const crs=target!=="KEEP"?target:(src==="AUTO"?"UNKNOWN":src);
  return geoJSONToFeaturePayload(obj,primaryName(),crs);
}
async function discoverUnknownType(){
  if(state.sourceKind!=="unknown")return;
  if(state.format.engine!=="gdal"){state.sourceKind="vector";return;}
  setStatus("Đang đọc metadata dataset bằng GDAL/WASM…","busy");
  const x=await inspectGdal(state.fileList||state.files,t=>setStatus(t,"busy"));
  state.sourceKind=x.type;state.sourceIsRaster=x.type==="raster";
  try{x.Gdal.close(x.dataset);}catch{}
}

async function convertVector(target){
  const targetProjection=target.crsLocked||targetCrs.value;
  if(target.id==="vfm"){
    const p=policyPayload(await loadVectorPayload(targetProjection));
    const out=await buildFeatureVFM(p,{compression:"auto"});
    await saveBytes(out,baseName(primaryName())+".vfm");
    return `VFM · ${formatBytes(out.length)} · ${p.featureCount.toLocaleString()} feature`;
  }
  if(target.id==="kml"||target.id==="kmz"){
    const p=policyPayload(await loadVectorPayload("EPSG:4326")),kml=featurePayloadToKML(p);
    if(target.id==="kml"){await saveText(kml,baseName(primaryName())+".kml");return "KML 2.2 · WGS84";}
    const kmz=await kmlToKMZ(kml);await saveBytes(kmz,baseName(primaryName())+".kmz","application/vnd.google-earth.kmz");return `KMZ · ${formatBytes(kmz.length)}`;
  }
  if(target.id==="geojson"){
    const p=policyPayload(await loadVectorPayload("EPSG:4326")),txt=JSON.stringify(featurePayloadToGeoJSON(p));
    await saveText(txt,baseName(primaryName())+".geojson","application/geo+json");return "GeoJSON · EPSG:4326";
  }
  if(target.id==="json"){
    const p=policyPayload(await loadVectorPayload(targetProjection)),txt=featurePayloadToJSON(p);
    await saveText(txt,baseName(primaryName())+".json","application/json");return `GIS JSON · ${p.crs}`;
  }
  if(target.id==="cbor"){
    const p=policyPayload(await loadVectorPayload(targetProjection)),bytes=encodeGeoCBOR(p);
    await saveBytes(bytes,baseName(primaryName())+".cbor","application/cbor");return `GeoCBOR · ${formatBytes(bytes.length)}`;
  }

  const p=policyPayload(await loadVectorPayload(targetProjection));
  const src=normalizeCrs(p.crs||targetProjection||"UNKNOWN");
  if(src==="UNKNOWN"&&targetProjection!=="KEEP")throw new Error("Không xác định được CRS cho bridge vector.");
  const outputs=await geoJSONToVector(payloadFile(p),{driver:target.driver,sourceCrs:src==="UNKNOWN"?"AUTO":src,targetCrs:"KEEP",creation:target.creation||[],onStatus:t=>setStatus(t,"busy")});
  const base=baseName(primaryName());
  if(target.zipOutput||outputs.length>1){
    const z=await zipFiles(outputs);
    await saveBytes(z,base+"."+outputExt(target.id),"application/zip");
    return `${target.name} · ${outputs.length} file trong ZIP · ${formatBytes(z.length)}`;
  }
  const one=outputs[0],ext=outputExt(target.id);
  await saveBytes(one.bytes,base+"."+ext);
  return `${target.name} · ${formatBytes(one.bytes.length)}`;
}

async function rasterSourceFiles(){
  if(state.format.id==="vfm"&&state.vfm?.rasterAsset){
    return new File([state.vfm.rasterAsset],"vfm_raster.tif",{type:"image/tiff"});
  }
  return state.fileList||state.files;
}
async function convertRaster(target){
  const tc=targetCrs.value;
  const source=await rasterSourceFiles();
  if(target.id==="vfm"){
    const r=await rasterToGTiff(source,{sourceCrs:declaredSourceCrs(),targetCrs:tc,onStatus:t=>setStatus(t,"busy")});
    const info=r.info||{};
    const crs=tc!=="KEEP"?tc:(normalizeCrs(info.projectionWkt||state.vfm?.rasterInfo?.crs)||"UNKNOWN");
    const v=await buildRasterVFM(r.bytes,{crs,sourceFile:primaryName(),width:info.width,height:info.height,bandCount:info.bandCount});
    await saveBytes(v,baseName(primaryName())+".vfm");return `VFM Raster · ${formatBytes(v.length)}`;
  }
  if(target.id==="tif"){
    if(state.format.id==="vfm"&&tc==="KEEP"){
      await saveBytes(state.vfm.rasterAsset,baseName(primaryName())+".tif","image/tiff");return `GeoTIFF · ${formatBytes(state.vfm.rasterAsset.length)}`;
    }
    const r=await rasterConvert(source,{driver:"GTiff",sourceCrs:declaredSourceCrs(),targetCrs:tc,onStatus:t=>setStatus(t,"busy")});
    await saveBytes(r.bytes,baseName(primaryName())+".tif","image/tiff");return `GeoTIFF · ${formatBytes(r.bytes.length)}`;
  }
  if(target.id==="gpkg"){
    const r=await rasterConvert(source,{driver:"GPKG",sourceCrs:declaredSourceCrs(),targetCrs:tc,onStatus:t=>setStatus(t,"busy")});
    await saveBytes(r.bytes,baseName(primaryName())+".gpkg");return `GeoPackage Raster · ${formatBytes(r.bytes.length)}`;
  }
  throw new Error("Đường chuyển raster này chưa được định nghĩa an toàn.");
}


function responseFileName(response,fallback){
  const cd=response.headers.get("Content-Disposition")||"";
  const m=cd.match(/filename="?([^";]+)"?/i);
  return m?.[1]||fallback;
}
async function saveResponseStream(response,fileName){
  if(!response.body)throw new Error("Backend không trả stream dữ liệu.");
  if(outputMode()==="signed")return saveBytes(new Uint8Array(await response.arrayBuffer()),fileName);
  if("showSaveFilePicker" in window){
    const ext="."+fileName.split(".").pop().toLowerCase();
    const handle=await window.showSaveFilePicker({
      suggestedName:fileName,
      types:[{description:"GIS output",accept:{"application/octet-stream":[ext]}}]
    });
    const writable=await handle.createWritable();
    await response.body.pipeTo(writable);
    return;
  }
  const blob=await response.blob();
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function backendRequest(files,sourceId,targetId,sourceProjection,targetProjection,model="vector"){
  const form=new FormData();for(const file of files)form.append("file",file,file.name);
  const response=await fetch(RUNTIME_CONFIG.backendEndpoint+"/v1/convert",{method:"POST",headers:{
    "X-XulyVFM-Source":sourceId,"X-XulyVFM-Target":targetId,
    "X-XulyVFM-Source-CRS":sourceProjection,"X-XulyVFM-Target-CRS":targetProjection,"X-XulyVFM-Model":model
  },body:form});
  if(!response.ok)throw new Error((await response.text())||"HTTP "+response.status);
  return response;
}
async function convertViaBackend(target){
  setStatus("Đang chuyển đổi bằng native GDAL…","busy");
  const nativeTargets=new Set(["vfm","json","cbor","kml","kmz","geojson"]);
  const tc=target.crsLocked||targetCrs.value;
  const raster=state.sourceIsRaster;
  if(raster){
    if(outputMode()==="cvnss")throw new Error("CVNSS4.0 không áp dụng cho raster.");
    const files=state.format.id==="vfm"?[await rasterSourceFiles()]:state.files;
    const response=await backendRequest(files,state.format.id==="vfm"?"tif":state.format.id,target.id==="vfm"?"tif":target.id,declaredSourceCrs(),tc,"raster");
    if(target.id==="vfm"){
      const bytes=new Uint8Array(await response.arrayBuffer());
      const out=await buildRasterVFM(bytes,{crs:tc==="KEEP"?declaredSourceCrs():tc,sourceFile:primaryName()});
      await saveBytes(out,baseName(primaryName())+".vfm");
    }else await saveResponseStream(response,responseFileName(response,baseName(primaryName())+"."+outputExt(target.id)));
    return target.name+" · native GDAL";
  }
  // Direct GDAL preserves multi-layer models when no attribute transformation is requested.
  if(!state.payload&&!nativeTargets.has(target.id)&&outputMode()!=="cvnss"){
    const response=await backendRequest(state.files,state.format.id,target.id,declaredSourceCrs(),tc);
    await saveResponseStream(response,responseFileName(response,baseName(primaryName())+"."+outputExt(target.id)));
    return target.name+" · native GDAL";
  }
  let payload=state.payload;
  if(!payload){
    // RFC 7946 bridge is always WGS84; never label projected coordinates as GeoJSON.
    const response=await backendRequest(state.files,state.format.id,"geojson",declaredSourceCrs(),"EPSG:4326");
    payload=geoJSONToFeaturePayload(JSON.parse(await response.text()),primaryName(),"EPSG:4326");
  }
  if(nativeTargets.has(target.id)){
    const previous=state.payload,oldCrs=sourceCrs.value;
    try{state.payload=payload;sourceCrs.value=normalizeCrs(payload.crs);return await convertVector(target);}
    finally{state.payload=previous;sourceCrs.value=oldCrs;}
  }
  const transformed=policyPayload(payload);
  const response=await backendRequest([payloadFile(transformed)],"geojson",target.id,normalizeCrs(payload.crs),tc);
  await saveResponseStream(response,responseFileName(response,baseName(primaryName())+"."+outputExt(target.id)));
  return target.name+" · native GDAL";
}

async function runConvert(){
  if(!state.format)return;
  const target=FORMAT_MAP.get(targetFormat.value);if(!target)return;
  const locked=[...document.querySelectorAll("#jobPanel input,#jobPanel select,#fileInput,#folderInput,#folderBtn,#createKey,#loadKey,#clearKey")];
  const oldDisabled=locked.map(e=>e.disabled);locked.forEach(e=>e.disabled=true);
  convertBtn.disabled=true;const old=convertBtn.textContent;convertBtn.textContent="Đang xử lý…";
  try{
    if(outputMode()==="signed"&&(!signingIdentity||!$("#ownerName").value.trim()))throw new Error("Nhập tên người ký và tạo hoặc nạp khóa trước khi chuyển đổi.");
    if(outputMode()==="cvnss"&&state.sourceIsRaster)throw new Error("CVNSS4.0 áp dụng cho thuộc tính vector; raster hãy chọn chế độ 1 hoặc 3.");
    const plan=chooseExecution({
      files:state.files,
      sourceId:state.format.id,
      targetId:target.id,
      backendAvailable:backendAvailable(),
      backendMaxBytes:RUNTIME_CONFIG.backendMaxBytes
    });

    if(plan.tier==="blocked"){
      await showModal({title:"File vượt ngưỡng xử lý không lưu",text:plan.reason,extra:"xulyVFM không tự động đưa file lên R2. Chế độ lưu tạm cloud chỉ được bật khi người dùng đồng ý rõ ràng."});
      return;
    }

    if(plan.tier==="backend"){
      if(state.format.id==="gpkg"&&state.sourceKind==="unknown")await discoverUnknownType();
      const cap=compatibility(state.format,target,{sourceIsRaster:state.sourceIsRaster,targetCrs:targetCrs.value});
      if(!cap.ok){await showModal({title:"Không thể chuyển đổi an toàn",text:cap.reason,extra:"Ứng dụng chặn thao tác thay vì tạo file sai mô hình dữ liệu."});return;}
      if(cap.level==="warning"){
        const yes=await showModal({title:"Có thể mất một phần thông tin",text:cap.reason,extra:"Backend dùng native GDAL nhưng khác biệt mô hình dữ liệu vẫn tồn tại. Style, topology, domain, attachment hoặc schema đặc thù có thể không round-trip.",allowContinue:true,continueLabel:"Vẫn chuyển đổi"});
        if(!yes)return;
      }
      const approved=await showModal({title:"Xử lý trên máy chủ",text:"Tệp sẽ được gửi tới "+RUNTIME_CONFIG.backendEndpoint+" để GDAL xử lý. Máy chủ dùng file tạm và xóa sau tác vụ.",allowContinue:true,continueLabel:"Đồng ý gửi tệp"});
      if(!approved)return;
      const t0=performance.now();
      const msg=await convertViaBackend(target);
      setStatus(`Hoàn tất: ${msg} · ${((performance.now()-t0)/1000).toFixed(2)} s`,"good");
      return;
    }

    await discoverUnknownType();
    const cap=compatibility(state.format,target,{sourceIsRaster:state.sourceIsRaster,targetCrs:targetCrs.value});
    if(!cap.ok){await showModal({title:"Không thể chuyển đổi an toàn",text:cap.reason,extra:"Ứng dụng chặn thao tác thay vì tạo file sai mô hình dữ liệu."});return;}
    if(cap.level==="warning"){
      const yes=await showModal({title:"Có thể mất một phần thông tin",text:cap.reason,extra:"Nếu tiếp tục, geometry/attribute được chuyển theo khả năng của driver; style, topology, domain, attachment hoặc schema đặc thù có thể không round-trip.",allowContinue:true,continueLabel:"Vẫn chuyển đổi"});
      if(!yes)return;
    }
    const t0=performance.now();
    if(outputMode()==="cvnss"&&state.sourceIsRaster)throw new Error("Raster không có bảng thuộc tính vector để chuyển CVNSS4.0.");
    const msg=state.sourceIsRaster?await convertRaster(target):await convertVector(target);
    setStatus(`Hoàn tất: ${msg} · ${plan.tier==="native"?"Browser native":"GDAL/WASM"} · ${((performance.now()-t0)/1000).toFixed(2)} s`,"good");
  }catch(err){
    console.error(err);setStatus("Chuyển đổi thất bại: "+err.message,"badtext");
    await showModal({title:"Chuyển đổi thất bại",text:err.message,extra:"Kiểm tra đủ sidecar, CRS nguồn, loại geometry và giới hạn driver trình duyệt/backend."});
  }finally{locked.forEach((e,i)=>e.disabled=oldDisabled[i]);convertBtn.disabled=false;convertBtn.textContent=old;}
}

fillCrs();renderCategories();renderFormats();renderTable();

input.addEventListener("change",()=>selectFiles(input.files));
folderInput.addEventListener("change",()=>selectFiles(folderInput.files));
$("#folderBtn").addEventListener("click",()=>folderInput.click());
for(const ev of ["dragenter","dragover"])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag")});
for(const ev of ["dragleave","drop"])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag")});
drop.addEventListener("drop",e=>selectFiles(e.dataTransfer.files));
targetFormat.addEventListener("change",()=>{
  syncCrsLocks();
  const t=FORMAT_MAP.get(targetFormat.value);
  if(t?.engine==="gdal")warmGdal();
});
sourceCrs.addEventListener("change",updateJobHint);
targetCrs.addEventListener("change",updateJobHint);
convertBtn.addEventListener("click",runConvert);
$("#formatSearch").addEventListener("input",renderFormats);
$("#categoryTabs").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(!b)return;category=b.dataset.cat;renderCategories();renderFormats();});
$("#formatGrid").addEventListener("click",e=>{
  const card=e.target.closest("[data-format]");if(!card)return;
  const f=FORMAT_MAP.get(card.dataset.format);if(!f)return;
  if(f.engine==="blocked"){showModal({title:f.name+" chưa chạy được trong browser",text:f.note,extra:"Định dạng vẫn xuất hiện trong ma trận để người dùng biết giới hạn thực, không bị hiểu nhầm là đã hỗ trợ."});return;}
  if(!f.write){showModal({title:f.name+" chỉ đọc",text:f.note});return;}
  state.preferredTarget=f.id;
  if(state.format){targetFormat.value=f.id;syncCrsLocks();jobPanel.scrollIntoView({behavior:"smooth",block:"center"});}
  else input.click();
});
$("#modalClose").addEventListener("click",()=>closeModal(false));
$("#modalCancel").addEventListener("click",()=>closeModal(false));
$("#modalContinue").addEventListener("click",()=>closeModal(true));
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal(false);});

$("#outputMode").addEventListener("change",syncOutputMode);syncOutputMode();
$("#createKey").addEventListener("click",async()=>{
  const button=$("#createKey");button.disabled=true;
  try{
    const identity=await createIdentity();
    const bytes=await exportIdentity(identity,$("#keyPassword").value);
    await rawSaveBytes(bytes,"owner-signing-key.vfmkey","application/json");
    signingIdentity=identity;$("#keyStatus").textContent="Khóa đã nạp · SHA-256: "+await fingerprint(identity.publicJwk)+" · Hãy giữ file khóa và mật khẩu; không thể khôi phục nếu mất.";
  }catch(e){$("#keyStatus").textContent=e.message;}finally{$("#keyPassword").value="";button.disabled=false;}
});
$("#loadKey").addEventListener("click",()=>$("#keyInput").click());
$("#keyInput").addEventListener("change",async e=>{
  signingIdentity=null;
  try{const f=e.target.files[0];if(!f)return;if(f.size>16384)throw new Error("File khóa quá lớn.");signingIdentity=await importIdentity(new Uint8Array(await f.arrayBuffer()),$("#keyPassword").value);$("#keyStatus").textContent="Đã nạp khóa · SHA-256: "+await fingerprint(signingIdentity.publicJwk);}
  catch{$("#keyStatus").textContent="Không nạp được khóa: sai mật khẩu hoặc file khóa không hợp lệ.";}
  finally{$("#keyPassword").value="";e.target.value="";}
});
$("#clearKey").addEventListener("click",()=>{signingIdentity=null;$("#keyPassword").value="";$("#keyStatus").textContent="Đã gỡ khóa khỏi phiên.";});
$("#trustedFingerprint").addEventListener("input",()=>{verifiedPackage=null;$("#extractVerified").disabled=true;$("#verifyStatus").textContent="Chọn lại gói để xác minh với dấu vân tay mới.";});
$("#verifyInput").addEventListener("change",async e=>{
  verifiedPackage=null;$("#extractVerified").disabled=true;
  try{const f=e.target.files[0];if(!f)return;if(f.size>125_000_000)throw new Error("Gói quá lớn.");const v=await verifyOutput(new Uint8Array(await f.arrayBuffer()),$("#trustedFingerprint").value);verifiedPackage=v;$("#verifyStatus").textContent=(v.trusted?"Chữ ký hợp lệ; khớp khóa tin cậy.":"Chữ ký hợp lệ; CHƯA xác minh danh tính người ký.")+" Tên khai báo: "+v.manifest.owner+" · File: "+v.manifest.fileName+" · Khóa: "+v.fingerprint;$("#extractVerified").disabled=false;}
  catch(err){$("#verifyStatus").textContent="Không xác minh được: "+err.message;}finally{e.target.value="";}
});
$("#extractVerified").addEventListener("click",async()=>{try{if(verifiedPackage)await rawSaveBytes(verifiedPackage.data,verifiedPackage.manifest.fileName,"application/octet-stream");}catch(e){$("#verifyStatus").textContent=e.message;}});
