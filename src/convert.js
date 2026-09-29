import { kmlToFeaturePayload, buildFeatureVFM } from "./vfm-writer.js";
import { parseVFM, formatBytes } from "./vfm-core.js";

const $=s=>document.querySelector(s);
let built=null, sourceName="";

function outName(){
  return sourceName.replace(/\.kml$/i,"")+".vfm";
}

async function saveVFM(bytes,fileName){
  if("showSaveFilePicker" in window){
    const handle=await window.showSaveFilePicker({
      suggestedName:fileName,
      types:[{description:"VFM spatial dataset",accept:{"application/octet-stream":[".vfm"]}}]
    });
    const writable=await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return "direct";
  }
  const blob=new Blob([bytes],{type:"application/octet-stream"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=fileName;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return "blob";
}

$("#kmlInput").addEventListener("change",async e=>{
  const f=e.target.files[0];if(!f)return;
  sourceName=f.name;built=null;
  $("#download").disabled=true;$("#verify").disabled=true;
  $("#kmlStatus").textContent="Đang đọc và chuyển đổi "+f.name+"…";
  await new Promise(requestAnimationFrame);
  try{
    const t0=performance.now();
    const xml=await f.text();
    const payload=kmlToFeaturePayload(xml,f.name);
    const preview={
      profile:payload.profile,
      source:payload.source,
      featureCount:payload.featureCount,
      firstFeature:payload.features[0]||null
    };
    const featureCount=payload.featureCount;
    const t1=performance.now();
    built=await buildFeatureVFM(payload,{compression:"auto"});
    const t2=performance.now();
    const stats=built.vfmStats||{};
    const audit=globalThis.CVNSSConverter?.audit?.();

    $("#nFeat").textContent=featureCount.toLocaleString();
    $("#nBytes").textContent=formatBytes(built.length);
    $("#nAudit").textContent=audit?.silentReverseOverwrite===0?"PASS":"CHECK";
    $("#nCompress").textContent=stats.compression==="gzip"?"GZIP":"NONE";
    const saved=(stats.rawFeatureBytes||0)-(stats.storedFeatureBytes||0);
    $("#nSaved").textContent=stats.rawFeatureBytes?Math.max(0,Math.round(saved/stats.rawFeatureBytes*100))+"%":"0%";
    $("#nTime").textContent=((t2-t0)/1000).toFixed(2)+" s";
    $("#convertRaw").textContent=JSON.stringify({
      ...preview,
      build:{
        parseMs:Math.round(t1-t0),
        packMs:Math.round(t2-t1),
        rawFeatureBytes:stats.rawFeatureBytes,
        storedFeatureBytes:stats.storedFeatureBytes,
        compression:stats.compression,
        compressionRatio:stats.ratio
      },
      cvnssAudit:audit
    },null,2);

    $("#convertResult").classList.remove("hidden");
    $("#download").disabled=false;$("#verify").disabled=false;
    $("#kmlStatus").textContent="Đã tạo VFM tối ưu trong bộ nhớ · "+formatBytes(built.length)+".";
  }catch(err){
    console.error(err);$("#kmlStatus").textContent="Lỗi: "+err.message;
  }
});

$("#download").addEventListener("click",async()=>{
  if(!built)return;
  const btn=$("#download"),old=btn.textContent;
  btn.disabled=true;btn.textContent="Đang ghi file…";
  try{
    const t0=performance.now();
    const mode=await saveVFM(built,outName());
    const sec=(performance.now()-t0)/1000;
    $("#kmlStatus").textContent=(mode==="direct"?"Đã ghi trực tiếp":"Đã gửi file tới trình duyệt")+" · "+formatBytes(built.length)+" · "+sec.toFixed(2)+" s.";
  }catch(err){
    if(err?.name!=="AbortError"){
      console.error(err);$("#kmlStatus").textContent="Không lưu được file: "+err.message;
    }
  }finally{
    btn.disabled=false;btn.textContent=old;
  }
});

$("#verify").addEventListener("click",async()=>{
  if(!built)return;
  const btn=$("#verify"),old=btn.textContent;btn.disabled=true;btn.textContent="Đang kiểm tra…";
  try{
    const v=await parseVFM(built);
    $("#kmlStatus").textContent=v.report.ok?"VFM vừa tạo: toàn vẹn đạt.":"VFM vừa tạo: có kiểm tra không đạt.";
  }catch(err){
    $("#kmlStatus").textContent="Kiểm tra thất bại: "+err.message;
  }finally{
    btn.disabled=false;btn.textContent=old;
  }
});
