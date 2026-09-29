import { PROFILE_CVNSS4_FEATURE } from "./vfm-core.js";

function cv4(s){
  if(!s||!globalThis.CVNSSConverter)return "";
  try{return globalThis.CVNSSConverter.fromCqn(String(s).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).cvss||"";}catch{return "";}
}
function stable32(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,"0");}
export function geoJSONToFeaturePayload(obj,fileName="dataset.geojson",crs="EPSG:4326"){
  let features=[];
  if(obj?.type==="FeatureCollection")features=obj.features||[];
  else if(obj?.type==="Feature")features=[obj];
  else if(obj?.type && obj?.coordinates)features=[{type:"Feature",geometry:obj,properties:{}}];
  else if(obj?.schema===1 && Array.isArray(obj.features))return obj;
  else throw new Error("JSON không phải GeoJSON hoặc xulyVFM Feature JSON");
  const out=features.map((f,i)=>{
    const props={...(f.properties||{})},codes={};
    for(const [k,v] of Object.entries(props))if(typeof v==="string"&&v.trim())codes[k]=cv4(v);
    return {id:String(f.id??("vfm:geojson:"+stable32(JSON.stringify([f.geometry,i])))),geometry:f.geometry||null,properties:props,cv4:codes};
  });
  return {schema:1,profile:PROFILE_CVNSS4_FEATURE,crs,source:{format:"GeoJSON",fileName},featureCount:out.length,features:out};
}
export function featurePayloadToGeoJSON(payload){
  return {type:"FeatureCollection",features:(payload?.features||[]).map(f=>({type:"Feature",id:f.id,geometry:f.geometry||null,properties:{...(f.properties||{})}}))};
}
export function featurePayloadToJSON(payload){return JSON.stringify(payload,null,2);}
export function parseGISJSON(text,fileName="dataset.json"){
  let o;try{o=JSON.parse(text);}catch{throw new Error("JSON không hợp lệ");}
  return geoJSONToFeaturePayload(o,fileName,o?.crs?.properties?.name||o?.crs||"EPSG:4326");
}
