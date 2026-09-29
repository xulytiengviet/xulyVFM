import "../assets/cvnss-converter.js";
import { buildFeatureVFM } from "../src/vfm-writer.js";
import { parseVFM, PROFILE_CVNSS4_FEATURE, PROFILE_RASTER } from "../src/vfm-core.js";
import { buildRasterVFM } from "../src/vfm-raster.js";
import { encodeGeoCBOR, decodeGeoCBOR } from "../src/geocbor.js";
import { compatibility, FORMAT_MAP } from "../src/format-registry.js";
import { featurePayloadToKML, kmlToKMZ, kmzToKML } from "../src/geo-exchange.js";

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


const bigText="Đường giao thông và dữ liệu địa lý Việt Nam ".repeat(4000);
const bigPayload={
  schema:1,profile:PROFILE_CVNSS4_FEATURE,crs:"OGC:CRS84",
  source:{format:"smoke-large",fileName:"large.kml"},
  featureCount:50,
  features:Array.from({length:50},(_,i)=>({
    id:"vfm:test:big:"+i,
    geometry:{type:"LineString",coordinates:Array.from({length:40},(_,j)=>[105+i*0.001+j*0.00001,10+j*0.00001])},
    properties:{name:"Đối tượng "+i,description:bigText},
    cv4:{name:c.fromCqn("Đối tượng "+i).cvss}
  }))
};
const bigBytes=await buildFeatureVFM(bigPayload);
if(bigBytes.vfmStats?.compressionId!==2) throw new Error("Large FEAT did not use GZIP");
const bigV=await parseVFM(bigBytes);
if(!bigV.report.ok) throw new Error("Compressed VFM integrity failed: "+JSON.stringify(bigV.report));
if(bigV.featureCollection?.features?.length!==50) throw new Error("Compressed FEAT decode mismatch");
console.log(JSON.stringify({
  compressed:true,
  rawFeatureBytes:bigBytes.vfmStats.rawFeatureBytes,
  storedFeatureBytes:bigBytes.vfmStats.storedFeatureBytes,
  ratio:bigBytes.vfmStats.ratio,
  vfmBytes:bigBytes.length
},null,2));


const kml=featurePayloadToKML(payload);
if(!kml.includes("<name>Cầu Mỹ Thuận</name>")) throw new Error("VFM payload -> KML failed");
const kmz=await kmlToKMZ(kml);
const extracted=await kmzToKML(kmz);
if(!extracted.kml.includes("<name>Cầu Mỹ Thuận</name>")) throw new Error("KML -> KMZ -> KML failed");
console.log(JSON.stringify({exchange:true,kmlBytes:new TextEncoder().encode(kml).length,kmzBytes:kmz.length,entry:extracted.entryName},null,2));


const cborBytes=encodeGeoCBOR(payload);
const cborPayload=decodeGeoCBOR(cborBytes);
if(cborPayload.features?.[0]?.geometry?.coordinates?.[0]!==105.905) throw new Error("GeoCBOR float round-trip failed");

const fakeTiff=Uint8Array.from([0x49,0x49,0x2a,0x00,1,2,3,4,5,6,7,8]);
const rasterVfm=await buildRasterVFM(fakeTiff,{crs:"EPSG:4326",width:1,height:1,bandCount:1});
const parsedRaster=await parseVFM(rasterVfm);
if(!parsedRaster.report.ok) throw new Error("Raster VFM integrity failed");
if(parsedRaster.profiles[0]!==PROFILE_RASTER) throw new Error("Raster profile mismatch");
if(parsedRaster.rasterAsset?.length!==fakeTiff.length) throw new Error("Raster asset round-trip failed");

const noRasterVector=compatibility(FORMAT_MAP.get("tif"),FORMAT_MAP.get("shp"),{sourceIsRaster:true,targetCrs:"EPSG:4326"});
if(noRasterVector.ok) throw new Error("Raster->vector safety gate failed");
const noMdb=compatibility(FORMAT_MAP.get("mdb"),FORMAT_MAP.get("vfm"),{sourceIsRaster:false,targetCrs:"EPSG:4326"});
if(noMdb.ok) throw new Error("MDB browser safety gate failed");
const noVnGeojson=compatibility(FORMAT_MAP.get("vfm"),FORMAT_MAP.get("geojson"),{sourceIsRaster:false,targetCrs:"EPSG:4756"});
if(noVnGeojson.ok) throw new Error("GeoJSON CRS lock failed");

console.log(JSON.stringify({
  totalGIS:true,
  geocborBytes:cborBytes.length,
  rasterVfmBytes:rasterVfm.length,
  safetyGates:true
},null,2));
