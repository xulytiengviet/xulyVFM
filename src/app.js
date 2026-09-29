import { parseVFM, formatBytes, deriveCv4 } from "./vfm-core.js";
import { kmlToFeaturePayload, buildFeatureVFM } from "./vfm-writer.js";
import { featurePayloadToKML, kmlToKMZ, kmzToKML, saveBytes, saveText } from "./geo-exchange.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const input=$("#fileInput"),drop=$("#dropzone"),status=$("#status"),result=$("#result"),convertPanel=$("#convertPanel");
let state={file:null,type:null,payload:null,vfm:null,kml:null};
let allFeatures=[],allText=[];

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setStatus(msg,kind=""){status.textContent=msg;status.className="statusbar "+kind;}
function baseName(name){return name.replace(/\.(vfm|kml|kmz)$/i,"");}
function featureName(f){return f?.properties?.name||f?.properties?.ten_tinh||f?.properties?.ten||"";}
function geometryType(g){return g?.type||"—";}
function detectType(file,bytes){
  const n=file.name.toLowerCase();
  if(n.endsWith(".vfm"))return "vfm";
  if(n.endsWith(".kml"))return "kml";
  if(n.endsWith(".kmz"))return "kmz";
  if(bytes?.length>=8 && bytes[0]===0x56&&bytes[1]===0x46&&bytes[2]===0x4d&&bytes[3]===0x00)return "vfm";
  if(bytes?.length>=4 && bytes[0]===0x50&&bytes[1]===0x4b)return "kmz";
  return "kml";
}
function textRows(payload){
  const rows=[];
  for(const f of payload?.features||[]){
    const props=f.properties||{},cv=f.cv4||{};
    for(const [field,value] of Object.entries(props)){
      if(typeof value==="string")rows.push({featureId:f.id||"",field,unicode:value,cv4:typeof cv[field]==="string"?cv[field]:""});
    }
  }
  return rows;
}
function renderChecks(){
  if(state.type==="vfm"){
    const v=state.vfm;
    $("#checks").innerHTML=v.report.checks.map(c=>`<div class="check ${c.ok?"ok":"bad"}"><span class="dot"></span><div><b>${esc(c.name)}</b><small>${c.ok?"OK":"Không đạt"}${c.detail?" · "+esc(c.detail):""}</small></div></div>`).join("");
    if(v.report.warnings.length)$("#checks").insertAdjacentHTML("beforeend",v.report.warnings.map(w=>`<div class="check"><span class="dot"></span><div><b>Cảnh báo</b><small>${esc(w)}</small></div></div>`).join(""));
  }else{
    const label=state.type==="kmz"?"KMZ / ZIP + KML":"KML 2.2";
    $("#checks").innerHTML=`<div class="check ok"><span class="dot"></span><div><b>${label}</b><small>Đã đọc thành công trên trình duyệt</small></div></div><div class="check ok"><span class="dot"></span><div><b>Feature extraction</b><small>${allFeatures.length.toLocaleString()} đối tượng</small></div></div><div class="check ok"><span class="dot"></span><div><b>CVNSS4.0</b><small>Khóa text dẫn xuất sẵn sàng khi đóng gói VFM</small></div></div>`;
  }
}
function renderProfiles(){
  const p=state.type==="vfm"?(state.vfm?.profiles||[]):["KML 2.2","org.xulytiengviet.vfm.feature-cvnss4/1"];
  $("#profiles").innerHTML=p.map(x=>`<span class="chip">${esc(x)}</span>`).join("");
}
function renderSections(){
  const body=$("#sectionsBody");
  if(state.type!=="vfm"){body.innerHTML="";return;}
  body.innerHTML=state.vfm.directory.map(e=>`<tr><td class="mono"><b>${esc(e.type)}</b></td><td>${e.logicalId}</td><td class="mono">${esc(e.profile||"Core")}</td><td>${e.offset.toLocaleString()}</td><td>${formatBytes(e.storedLength)}</td><td>${formatBytes(e.rawLength)}</td><td class="mono">${e.crc32c.toString(16).padStart(8,"0")}</td></tr>`).join("");
}
function renderFeatures(q=""){
  const needle=q.trim().toLowerCase();
  const rows=allFeatures.filter(f=>!needle||JSON.stringify(f.properties||{}).toLowerCase().includes(needle)||String(f.id||"").toLowerCase().includes(needle));
  $("#featureCount").textContent=`${rows.length.toLocaleString()} kết quả${rows.length>500?" · hiển thị 500":""}`;
  $("#featuresBody").innerHTML=rows.slice(0,500).map(f=>`<tr><td class="mono">${esc(f.id||"")}</td><td>${esc(geometryType(f.geometry))}</td><td><b>${esc(featureName(f))}</b></td><td class="mono">${Object.keys(f.properties||{}).length}</td></tr>`).join("");
}
function renderText(q=""){
  const needle=q.trim().toLowerCase();
  const rows=allText.filter(r=>!needle||r.unicode.toLowerCase().includes(needle)||r.cv4.toLowerCase().includes(needle)||r.field.toLowerCase().includes(needle));
  $("#textCount").textContent=`${rows.length.toLocaleString()} thuộc tính${rows.length>1000?" · hiển thị 1.000":""}`;
  $("#textBody").innerHTML=rows.slice(0,1000).map(r=>{
    const stored=!!r.cv4,code=r.cv4||deriveCv4(r.unicode);
    return `<tr><td class="mono">${esc(r.featureId)}</td><td class="mono">${esc(r.field)}</td><td>${esc(r.unicode)}</td><td class="mono">${esc(code)}</td><td>${stored?"VFM/KML parse":"dẫn xuất khi đọc"}</td></tr>`;
  }).join("");
}
function collectPoints(g,out){
  if(!g)return;if(g.type==="GeometryCollection"){for(const x of g.geometries||[])collectPoints(x,out);return;}
  const walk=x=>{if(!Array.isArray(x))return;if(typeof x[0]==="number"&&typeof x[1]==="number"){out.push(x);return;}for(const y of x)walk(y);};walk(g.coordinates);
}
function drawPreview(){
  const canvas=$("#preview"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
  const pts=[];for(const f of allFeatures.slice(0,2000))collectPoints(f.geometry,pts);
  if(!pts.length){ctx.fillStyle="#66758d";ctx.font="16px system-ui";ctx.fillText("Không có geometry để xem nhanh.",24,42);return;}
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  const pad=28,w=canvas.width-pad*2,h=canvas.height-pad*2,s=Math.min(w/Math.max(1e-12,maxX-minX),h/Math.max(1e-12,maxY-minY));
  const tx=x=>pad+(x-minX)*s,ty=y=>canvas.height-pad-(y-minY)*s;
  ctx.strokeStyle="#165dcc";ctx.globalAlpha=.5;ctx.lineWidth=1;
  for(const f of allFeatures.slice(0,1200)){const p=[];collectPoints(f.geometry,p);if(!p.length)continue;ctx.beginPath();ctx.moveTo(tx(p[0][0]),ty(p[0][1]));for(const x of p.slice(1))ctx.lineTo(tx(x[0]),ty(x[1]));ctx.stroke();}
  ctx.globalAlpha=1;ctx.fillStyle="#66758d";ctx.font="12px ui-monospace";ctx.fillText(`bbox: ${minX.toFixed(5)}, ${minY.toFixed(5)} → ${maxX.toFixed(5)}, ${maxY.toFixed(5)}`,18,canvas.height-10);
}
function setMetrics(extra=[]){
  const basics=[
    ["Định dạng",state.type?.toUpperCase()||"—"],
    ["Dung lượng",state.file?formatBytes(state.file.size):"—"],
    ["Đối tượng",allFeatures.length.toLocaleString()],
    ["Text fields",allText.length.toLocaleString()]
  ];
  $("#metrics").innerHTML=[...basics,...extra].slice(0,5).map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
}
function renderActions(){
  const a=$("#actions");
  if(state.type==="vfm"){
    a.innerHTML=`<button class="btn" data-output="kml">Xuất KML</button><button class="btn" data-output="kmz">Xuất KMZ</button>`;
  }else{
    a.innerHTML=`<button class="btn" data-output="vfm">Xuất VFM</button>`;
  }
}
function renderRaw(){
  const p=state.payload||{};
  const raw={
    input:{name:state.file?.name,type:state.type,size:state.file?.size},
    vfm:state.type==="vfm"?{version:state.vfm.summary.version,uuid:state.vfm.summary.uuid,profiles:state.vfm.profiles,integrity:state.vfm.report}:undefined,
    payload:{schema:p.schema,profile:p.profile,crs:p.crs,source:p.source,featureCount:p.featureCount,features:(p.features||[]).slice(0,5)}
  };
  $("#raw").textContent=JSON.stringify(raw,null,2)+(allFeatures.length>5?"\n\n… chỉ hiển thị 5 feature đầu để tránh khóa trình duyệt.":"");
}
function renderAll(){
  allFeatures=Array.isArray(state.payload?.features)?state.payload.features:[];
  allText=textRows(state.payload);
  $("#sourcePill").textContent=state.file.name+" · "+state.type.toUpperCase();
  $("#inspectTitle").textContent=state.file.name;
  $$(".vfm-only").forEach(x=>x.classList.toggle("hidden",state.type!=="vfm"));
  renderActions();setMetrics();renderChecks();renderProfiles();renderSections();renderFeatures();renderText();drawPreview();renderRaw();
  convertPanel.classList.remove("hidden");result.classList.remove("hidden");
}
async function openFile(file){
  if(!file)return;
  state={file,type:null,payload:null,vfm:null,kml:null};convertPanel.classList.add("hidden");result.classList.add("hidden");
  setStatus("Đang nhận diện và đọc "+file.name+"…");
  await new Promise(requestAnimationFrame);
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    state.type=detectType(file,bytes);
    if(state.type==="vfm"){
      state.vfm=await parseVFM(bytes);
      state.payload=state.vfm.featureCollection;
      if(!state.payload)throw new Error("VFM hợp lệ nhưng không có profile FEAT hỗ trợ chuyển sang KML/KMZ");
      setStatus(`${file.name} · VFM ${state.vfm.summary.version} · ${state.vfm.report.ok?"toàn vẹn đạt":"có kiểm tra không đạt"}`,state.vfm.report.ok?"good":"badtext");
    }else if(state.type==="kmz"){
      const x=await kmzToKML(bytes);state.kml=x.kml;state.payload=kmlToFeaturePayload(x.kml,file.name);
      setStatus(`${file.name} · KMZ → đọc ${x.entryName} · ${state.payload.featureCount.toLocaleString()} feature`,"good");
    }else{
      state.kml=new TextDecoder().decode(bytes);state.payload=kmlToFeaturePayload(state.kml,file.name);
      setStatus(`${file.name} · KML 2.2 · ${state.payload.featureCount.toLocaleString()} feature`,"good");
    }
    renderAll();
  }catch(err){console.error(err);setStatus("Không xử lý được: "+err.message,"badtext");}
}
async function convertTo(kind,button){
  const old=button.textContent;button.disabled=true;button.textContent="Đang tạo…";
  const t0=performance.now();
  try{
    const base=baseName(state.file.name);
    if(kind==="vfm"){
      const bytes=await buildFeatureVFM(state.payload,{compression:"auto"});
      const stats=bytes.vfmStats||{};await saveBytes(bytes,base+".vfm","application/octet-stream");
      const saved=stats.rawFeatureBytes?Math.round((1-stats.storedFeatureBytes/stats.rawFeatureBytes)*100):0;
      setMetrics([["Nén FEAT",stats.compression?.toUpperCase()||"NONE"],["Giảm",saved+"%"]]);
      setStatus(`Đã tạo ${base}.vfm · ${formatBytes(bytes.length)} · ${((performance.now()-t0)/1000).toFixed(2)} s`,"good");
    }else{
      const kml=featurePayloadToKML(state.payload);
      if(kind==="kml"){
        await saveText(kml,base+".kml");
        setStatus(`Đã xuất ${base}.kml · ${allFeatures.length.toLocaleString()} feature`,"good");
      }else{
        const kmz=kmlToKMZ(kml);await saveBytes(kmz,base+".kmz","application/vnd.google-earth.kmz");
        setStatus(`Đã xuất ${base}.kmz · ${formatBytes(kmz.length)}`,"good");
      }
    }
  }catch(err){if(err?.name!=="AbortError"){console.error(err);setStatus("Chuyển đổi thất bại: "+err.message,"badtext");}}
  finally{button.disabled=false;button.textContent=old;}
}

input.addEventListener("change",()=>openFile(input.files[0]));
for(const ev of ["dragenter","dragover"])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag")});
for(const ev of ["dragleave","drop"])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag")});
drop.addEventListener("drop",e=>openFile(e.dataTransfer.files[0]));
$("#actions").addEventListener("click",e=>{const b=e.target.closest("[data-output]");if(b)convertTo(b.dataset.output,b);});
$("#resetBtn").addEventListener("click",()=>{input.value="";state={file:null,type:null,payload:null,vfm:null,kml:null};convertPanel.classList.add("hidden");result.classList.add("hidden");setStatus("Sẵn sàng. Chọn một file để bắt đầu.");window.scrollTo({top:0,behavior:"smooth"});});
$("#featureSearch").addEventListener("input",e=>renderFeatures(e.target.value));
$("#textSearch").addEventListener("input",e=>renderText(e.target.value));
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b||b.classList.contains("hidden"))return;$$(".tab").forEach(x=>x.classList.toggle("active",x===b));$$("[data-pane]").forEach(x=>x.classList.toggle("hidden",x.dataset.pane!==b.dataset.tab));});
