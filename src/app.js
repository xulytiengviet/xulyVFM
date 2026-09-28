import { parseVFM, formatBytes, getTextRows, deriveCv4 } from "./vfm-core.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const input=$("#fileInput"), drop=$("#dropzone"), status=$("#status"), result=$("#result");
let current=null, allFeatures=[], allText=[];

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setStatus(msg,kind=""){status.textContent=msg;status.className="statusline "+kind;}
function geometryType(g){return g?.type||"—";}
function featureName(f){return f?.properties?.name||f?.properties?.ten_tinh||f?.properties?.ten||"";}

function renderChecks(v){
  $("#checks").innerHTML=v.report.checks.map(c=>`<div class="check ${c.ok?"ok":"bad"}"><span class="dot"></span><div><b>${esc(c.name)}</b><small>${c.ok?"OK":"Không đạt"}${c.detail?" · "+esc(c.detail):""}</small></div></div>`).join("");
  if(v.report.warnings.length) $("#checks").insertAdjacentHTML("beforeend",v.report.warnings.map(w=>`<div class="check"><span class="dot"></span><div><b>Cảnh báo</b><small>${esc(w)}</small></div></div>`).join(""));
}
function renderSections(v){
  $("#sectionsBody").innerHTML=v.directory.map(e=>`<tr><td class="mono"><b>${esc(e.type)}</b></td><td>${e.logicalId}</td><td class="mono">${esc(e.profile||"Core")}</td><td>${e.offset.toLocaleString()}</td><td>${formatBytes(e.storedLength)}</td><td>${formatBytes(e.rawLength)}</td><td class="mono">${e.crc32c.toString(16).padStart(8,"0")}</td></tr>`).join("");
}
function renderProfiles(v){$("#profiles").innerHTML=(v.profiles.length?v.profiles:["Core only"]).map(p=>`<span class="chip">${esc(p)}</span>`).join("");}

function renderFeatures(q=""){
  const needle=q.trim().toLowerCase();
  const rows=allFeatures.filter(f=>!needle||JSON.stringify(f).toLowerCase().includes(needle));
  const shown=rows.slice(0,500);
  $("#featureCount").textContent=`${rows.length.toLocaleString()} kết quả${rows.length>500?" · hiển thị 500":""}`;
  $("#featuresBody").innerHTML=shown.map(f=>`<tr><td class="mono">${esc(f.id||"")}</td><td>${esc(geometryType(f.geometry))}</td><td><b>${esc(featureName(f))}</b></td><td class="mono">${Object.keys(f.properties||{}).length}</td></tr>`).join("");
}
function renderText(q=""){
  const needle=q.trim().toLowerCase();
  const rows=allText.filter(r=>!needle||r.unicode.toLowerCase().includes(needle)||r.cv4.toLowerCase().includes(needle)||r.field.toLowerCase().includes(needle));
  const shown=rows.slice(0,1000);
  $("#textCount").textContent=`${rows.length.toLocaleString()} thuộc tính${rows.length>1000?" · hiển thị 1.000":""}`;
  $("#textBody").innerHTML=shown.map(r=>{
    const stored=!!r.cv4, code=r.cv4||deriveCv4(r.unicode);
    return `<tr><td class="mono">${esc(r.featureId)}</td><td class="mono">${esc(r.field)}</td><td>${esc(r.unicode)}</td><td class="mono">${esc(code)}</td><td>${stored?"VFM":"dẫn xuất khi đọc"}</td></tr>`;
  }).join("");
}
function collectPoints(g,out){
  if(!g)return;
  if(g.type==="GeometryCollection"){for(const x of g.geometries||[])collectPoints(x,out);return;}
  const walk=x=>{if(!Array.isArray(x))return;if(typeof x[0]==="number"&&typeof x[1]==="number"){out.push(x);return;}for(const y of x)walk(y);};
  walk(g.coordinates);
}
function drawPreview(){
  const canvas=$("#preview"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
  const points=[];for(const f of allFeatures.slice(0,2000))collectPoints(f.geometry,points);
  if(!points.length){ctx.fillStyle="#66758d";ctx.font="16px system-ui";ctx.fillText("Không có geometry trong profile đã giải mã.",24,42);return;}
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  const pad=28,w=canvas.width-pad*2,h=canvas.height-pad*2,sx=w/Math.max(1e-12,maxX-minX),sy=h/Math.max(1e-12,maxY-minY),s=Math.min(sx,sy);
  const tx=x=>pad+(x-minX)*s, ty=y=>canvas.height-pad-(y-minY)*s;
  ctx.strokeStyle="#165dcc";ctx.globalAlpha=.5;ctx.lineWidth=1;
  for(const f of allFeatures.slice(0,1500)){
    const pts=[];collectPoints(f.geometry,pts);if(!pts.length)continue;ctx.beginPath();ctx.moveTo(tx(pts[0][0]),ty(pts[0][1]));for(const p of pts.slice(1))ctx.lineTo(tx(p[0]),ty(p[1]));ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.fillStyle="#66758d";ctx.font="12px ui-monospace";ctx.fillText(`bbox: ${minX.toFixed(5)}, ${minY.toFixed(5)} → ${maxX.toFixed(5)}, ${maxY.toFixed(5)}`,18,canvas.height-10);
}

async function openFile(file){
  if(!file)return;
  setStatus("Đang đọc và kiểm tra "+file.name+"…");
  result.classList.add("hidden");
  try{
    const v=await parseVFM(await file.arrayBuffer());current=v;
    allFeatures=Array.isArray(v.featureCollection?.features)?v.featureCollection.features:[];
    allText=getTextRows(v);
    $("#cVersion").textContent=v.summary.version;$("#cSize").textContent=formatBytes(v.summary.size);
    $("#cSections").textContent=v.directory.length;$("#cFeatures").textContent=(v.featureCollection?.featureCount??allFeatures.length).toLocaleString();
    $("#cUUID").textContent=v.summary.uuid;
    renderChecks(v);renderProfiles(v);renderSections(v);renderFeatures();renderText();drawPreview();
    $("#raw").textContent=JSON.stringify({header:{...v.header,datasetUUID:v.summary.uuid,contentRootDigest:"[32 bytes]",directoryDigest:"[32 bytes]",manifestDigest:"[32 bytes]",buildId:"[16 bytes]"},meta:v.meta,profiles:v.profiles,featureCollection:v.featureCollection,report:v.report},null,2);
    result.classList.remove("hidden");
    setStatus(`${file.name} · ${v.report.ok?"toàn vẹn đạt":"có kiểm tra không đạt"} · ${allFeatures.length.toLocaleString()} feature`,v.report.ok?"good":"badtext");
  }catch(err){console.error(err);setStatus("Không giải mã được: "+err.message,"badtext");}
}
input.addEventListener("change",()=>openFile(input.files[0]));
for(const ev of ["dragenter","dragover"]){drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag")});}
for(const ev of ["dragleave","drop"]){drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag")});}
drop.addEventListener("drop",e=>openFile(e.dataTransfer.files[0]));
$("#featureSearch").addEventListener("input",e=>renderFeatures(e.target.value));
$("#textSearch").addEventListener("input",e=>renderText(e.target.value));
$("#tabs").addEventListener("click",e=>{
  const b=e.target.closest("[data-tab]");if(!b)return;
  $$(".tab").forEach(x=>x.classList.toggle("active",x===b));
  $$("[data-pane]").forEach(x=>x.classList.toggle("hidden",x.dataset.pane!==b.dataset.tab));
});
