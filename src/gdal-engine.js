const CDN="https://cdn.jsdelivr.net/npm/gdal3.js@2.8.1/dist/package";
const SCRIPT=CDN+"/gdal3.js";
const SRI="sha384-yW4c2Jx7lsREjJg58+ZI5U6gAso2bRAPw3LdzPWm7z8+rMJ24R7AS+EFyXDPxgYM";

let promise=null;
let ready=false;
let lastError=null;

function loadScript(){
  if(globalThis.initGdalJs)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=SCRIPT;
    s.integrity=SRI;
    s.crossOrigin="anonymous";
    s.async=true;
    s.dataset.xulyvfmGdal="1";
    s.onload=resolve;
    s.onerror=()=>reject(new Error("Không tải được engine GIS nâng cao từ CDN."));
    document.head.appendChild(s);
  });
}

export function isGdalReady(){return ready;}
export function gdalState(){return {ready,loading:!!promise&&!ready,error:lastError};}

/**
 * Official gdal3.js CDN mode.
 * Docs require useWorker:false for Script (CDN).
 * The browser fetches/caches JS + .wasm + .data automatically.
 * Users never need to download/install a WASM file manually.
 */
export async function getGdal(onStatus=()=>{}){
  if(promise)return promise;
  promise=(async()=>{
    try{
      onStatus("Đang chuẩn bị engine GIS nâng cao…");
      await loadScript();
      const g=await globalThis.initGdalJs({
        path:CDN,
        useWorker:false,
        errorHandler:(message)=>console.warn("[GDAL]",message)
      });
      ready=true;
      lastError=null;
      onStatus("Engine GIS nâng cao đã sẵn sàng.");
      return g;
    }catch(err){
      lastError=err;
      promise=null;
      ready=false;
      throw new Error("Không thể khởi động engine GIS nâng cao. Kiểm tra kết nối mạng rồi thử lại. Không cần tải WASM thủ công. "+(err?.message||""));
    }
  })();
  return promise;
}

/**
 * Fire-and-forget warm-up used only after the user has selected a GDAL-backed
 * source/target. requestIdleCallback keeps native VFM/KML/KMZ workflows instant.
 */
export function warmGdal(onStatus=()=>{}){
  if(ready||promise)return promise||Promise.resolve();
  const start=()=>getGdal(onStatus).catch(err=>console.warn("[xulyVFM] Advanced engine warm-up:",err.message));
  if(typeof requestIdleCallback==="function"){
    return new Promise(resolve=>requestIdleCallback(()=>resolve(start()),{timeout:900}));
  }
  return new Promise(resolve=>setTimeout(()=>resolve(start()),120));
}

export async function openGdal(files,onStatus){
  const Gdal=await getGdal(onStatus);
  const opened=await Gdal.open(files);
  if(!opened?.datasets?.length){
    const msg=(opened?.errors||[]).map(x=>x.message||x).join("; ");
    throw new Error("Engine GIS không mở được dữ liệu"+(msg?": "+msg:""));
  }
  return {Gdal,opened,dataset:opened.datasets[0]};
}

export async function vectorToGeoJSON(files,{sourceCrs="AUTO",targetCrs="KEEP",onStatus=()=>{}}={}){
  const {Gdal,dataset}=await openGdal(files,onStatus);
  if(dataset.type!=="vector")throw new Error("Dataset không phải vector.");
  const opts=["-f","GeoJSON"];
  if(sourceCrs!=="AUTO"&&sourceCrs!=="KEEP")opts.push("-s_srs",sourceCrs);
  if(targetCrs!=="KEEP")opts.push("-t_srs",targetCrs);
  const p=await Gdal.ogr2ogr(dataset,opts,"xulyvfm_bridge");
  const bytes=await Gdal.getFileBytes(p);
  try{Gdal.close(dataset);}catch{}
  return bytes;
}

export async function geoJSONToVector(file,{driver,sourceCrs="EPSG:4326",targetCrs="KEEP",creation=[],onStatus=()=>{}}={}){
  const {Gdal,dataset}=await openGdal(file,onStatus);
  const opts=["-f",driver];
  if(sourceCrs&&sourceCrs!=="AUTO"&&sourceCrs!=="KEEP")opts.push("-s_srs",sourceCrs);
  if(targetCrs&&targetCrs!=="KEEP")opts.push("-t_srs",targetCrs);
  opts.push(...creation);
  if(driver==="CSV")opts.push("-lco","GEOMETRY=AS_WKT");
  const p=await Gdal.ogr2ogr(dataset,opts,"converted");
  const paths=p?.all?.length?p.all.map(x=>x.local):[p.local||p];
  const outputs=[];
  for(const path of paths){
    try{
      const marker="converted.gdb/",i=path.indexOf(marker);
      const name=i>=0?path.slice(i):path.split("/").pop();
      outputs.push({name,bytes:await Gdal.getFileBytes(path)});
    }catch{}
  }
  try{Gdal.close(dataset);}catch{}
  if(!outputs.length)throw new Error("Engine GIS không tạo file đầu ra.");
  return outputs;
}

export async function inspectGdal(files,onStatus=()=>{}){
  const {Gdal,dataset,opened}=await openGdal(files,onStatus);
  const info=dataset.info||await Gdal.getInfo(dataset);
  return {Gdal,dataset,opened,info,type:dataset.type};
}

export async function rasterToGTiff(files,{targetCrs="KEEP",onStatus=()=>{}}={}){
  const {Gdal,dataset}=await openGdal(files,onStatus);
  if(dataset.type!=="raster")throw new Error("Dataset không phải raster.");
  let p;
  if(targetCrs!=="KEEP")p=await Gdal.gdalwarp(dataset,["-of","GTiff","-t_srs",targetCrs],"xulyvfm_raster");
  else p=await Gdal.gdal_translate(dataset,["-of","GTiff"],"xulyvfm_raster");
  const bytes=await Gdal.getFileBytes(p);
  const info=dataset.info||await Gdal.getInfo(dataset);
  try{Gdal.close(dataset);}catch{}
  return {bytes,info};
}

export async function rasterConvert(files,{driver="GTiff",targetCrs="KEEP",onStatus=()=>{}}={}){
  const {Gdal,dataset}=await openGdal(files,onStatus);
  if(dataset.type!=="raster")throw new Error("Dataset không phải raster.");
  let p;
  if(targetCrs!=="KEEP")p=await Gdal.gdalwarp(dataset,["-of",driver,"-t_srs",targetCrs],"converted_raster");
  else p=await Gdal.gdal_translate(dataset,["-of",driver],"converted_raster");
  const bytes=await Gdal.getFileBytes(p);
  const info=dataset.info||await Gdal.getInfo(dataset);
  try{Gdal.close(dataset);}catch{}
  return {bytes,info};
}
