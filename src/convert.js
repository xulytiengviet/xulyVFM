import { kmlToFeaturePayload, buildFeatureVFM } from "./vfm-writer.js";
import { parseVFM, formatBytes } from "./vfm-core.js";
const $=s=>document.querySelector(s);let payload=null,built=null,sourceName="";
$("#kmlInput").addEventListener("change",async e=>{
  const f=e.target.files[0];if(!f)return;sourceName=f.name;$("#kmlStatus").textContent="Đang đọc "+f.name+"…";
  try{
    payload=kmlToFeaturePayload(await f.text(),f.name);
    built=await buildFeatureVFM(payload);
    const audit=globalThis.CVNSSConverter?.audit?.();
    $("#nFeat").textContent=payload.featureCount.toLocaleString();$("#nBytes").textContent=formatBytes(built.length);$("#nAudit").textContent=audit?.silentReverseOverwrite===0?"PASS":"CHECK";
    $("#convertRaw").textContent=JSON.stringify({profile:payload.profile,source:payload.source,featureCount:payload.featureCount,firstFeature:payload.features[0]||null,cvnssAudit:audit},null,2);
    $("#convertResult").classList.remove("hidden");$("#download").disabled=false;$("#verify").disabled=false;$("#kmlStatus").textContent="Đã tạo VFM trong bộ nhớ.";
  }catch(err){console.error(err);$("#kmlStatus").textContent="Lỗi: "+err.message;}
});
$("#download").addEventListener("click",()=>{
  if(!built)return;const blob=new Blob([built],{type:"application/octet-stream"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=sourceName.replace(/\.kml$/i,"")+".vfm";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
$("#verify").addEventListener("click",async()=>{
  if(!built)return;try{const v=await parseVFM(built.buffer.slice(built.byteOffset,built.byteOffset+built.byteLength));$("#kmlStatus").textContent=v.report.ok?"VFM vừa tạo: toàn vẹn đạt.":"VFM vừa tạo: có kiểm tra không đạt.";}catch(err){$("#kmlStatus").textContent="Kiểm tra thất bại: "+err.message;}
});
