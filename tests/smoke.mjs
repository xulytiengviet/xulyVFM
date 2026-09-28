import "../assets/cvnss-converter.js";
import { buildFeatureVFM } from "../src/vfm-writer.js";
import { parseVFM, PROFILE_CVNSS4_FEATURE } from "../src/vfm-core.js";

const c=globalThis.CVNSSConverter;
if(!c) throw new Error("CVNSSConverter not loaded");
const audit=c.audit();
if(audit.silentReverseOverwrite!==0) throw new Error("CVNSS audit failed");

const name="Cầu Mỹ Thuận";
const payload={
  schema:1,profile:PROFILE_CVNSS4_FEATURE,crs:"OGC:CRS84",
  source:{format:"smoke",fileName:"sample"},
  featureCount:1,
  features:[{
    id:"vfm:test:1",
    geometry:{type:"Point",coordinates:[105.905,10.274]},
    properties:{name},
    cv4:{name:c.fromCqn(name).cvss}
  }]
};
const bytes=await buildFeatureVFM(payload);
const v=await parseVFM(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
if(!v.report.ok) throw new Error("VFM integrity failed: "+JSON.stringify(v.report));
if(v.profiles[0]!==PROFILE_CVNSS4_FEATURE) throw new Error("Profile mismatch");
if(v.featureCollection?.features?.[0]?.properties?.name!==name) throw new Error("Feature decode mismatch");
console.log(JSON.stringify({ok:true,size:bytes.length,version:v.summary.version,profile:v.profiles[0],cv4:v.featureCollection.features[0].cv4.name},null,2));
