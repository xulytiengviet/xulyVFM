const MiB=1024*1024;

export const EXECUTION_POLICY=Object.freeze({
  wasmInputMax:32*MiB,
  wasmExpandedMax:192*MiB,
  backendDefaultMax:90_000_000
});

const NATIVE=new Set(["vfm","kml","kmz","geojson","json","cbor"]);
const HEAVY=new Set(["gdb","gpkg","tif","dgn"]);
const MULTI=new Set(["shp","tab","mif","gdb"]);

export function estimateExpandedBytes(files,formatId){
  const total=[...files].reduce((n,f)=>n+(f.size||0),0);
  let factor=3;
  if(formatId==="tif")factor=6;
  else if(formatId==="gdb"||formatId==="gpkg")factor=5;
  else if(MULTI.has(formatId))factor=4;
  return Math.max(total,total*factor);
}

export function chooseExecution({
  files=[],
  sourceId,
  targetId,
  backendAvailable=false,
  backendMaxBytes=EXECUTION_POLICY.backendDefaultMax
}){
  const total=[...files].reduce((n,f)=>n+(f.size||0),0);
  if(NATIVE.has(sourceId)&&NATIVE.has(targetId)){
    return {tier:"native",reason:"Cả nguồn và đích có codec native trong xulyVFM.",total};
  }

  const expanded=estimateExpandedBytes(files,sourceId);
  const forceBackend=HEAVY.has(sourceId)||HEAVY.has(targetId)||MULTI.has(sourceId)||MULTI.has(targetId);
  const wasmSafe=total<=EXECUTION_POLICY.wasmInputMax&&expanded<=EXECUTION_POLICY.wasmExpandedMax&&!forceBackend;

  if(wasmSafe){
    return {tier:"wasm",reason:"Dataset nằm trong ngưỡng bộ nhớ bảo thủ của GDAL/WASM tối giản.",total,expanded};
  }
  if(backendAvailable&&total<=backendMaxBytes){
    return {tier:"backend",reason:"Dataset nặng/multi-file; native GDAL Container được ưu tiên để giảm RAM browser và tăng độ ổn định.",total,expanded};
  }
  if(total>backendMaxBytes){
    return {tier:"blocked",reason:"File vượt ngưỡng backend stream không lưu. Không tự động dùng R2 vì chế độ mặc định không lưu file người dùng.",total,expanded};
  }
  return {tier:"wasm",reason:"Backend chưa cấu hình; dùng GDAL/WASM với cảnh báo bộ nhớ.",total,expanded,warning:true};
}
