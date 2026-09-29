export const CRS_OPTIONS=[
  {id:"KEEP",label:"Giữ CRS nguồn",kind:"keep"},
  {id:"EPSG:4326",label:"WGS 84 · EPSG:4326",kind:"geographic"},
  {id:"EPSG:4756",label:"VN-2000 địa lý · EPSG:4756",kind:"geographic"},
  {id:"EPSG:3405",label:"VN-2000 / UTM 48N · EPSG:3405",kind:"projected"},
  {id:"EPSG:3406",label:"VN-2000 / UTM 49N · EPSG:3406",kind:"projected"}
];

export const FORMATS=[
  {id:"vfm",name:"VFM",ext:".vfm",type:"Vector / Raster",group:"VFM",engine:"native",read:true,write:true,note:"Định dạng trung tâm. Core 1.3 + profile Feature/CVNSS4.0; Raster profile thử nghiệm."},
  {id:"dxf",name:"CAD / DXF",ext:".dxf",type:"CAD / Vector",group:"CAD",engine:"gdal",driver:"DXF",read:true,write:true,note:"DXF không lưu CRS đáng tin cậy; tọa độ có thể được biến đổi nhưng metadata CRS có thể mất."},
  {id:"dgn",name:"MicroStation DGN",ext:".dgn",type:"CAD / Vector",group:"CAD",engine:"gdal",driver:"DGN",read:true,write:true,note:"DGN qua GDAL/WASM. DGN v8 có giới hạn driver khác với DGN cổ điển."},
  {id:"kml",name:"KML",ext:".kml",type:"Vector / Web",group:"Web",engine:"native",driver:"KML",read:true,write:true,crsLocked:"EPSG:4326",note:"KML dùng kinh/vĩ độ WGS84. Không xuất tọa độ VN-2000 trực tiếp vào KML."},
  {id:"kmz",name:"KMZ",ext:".kmz",type:"Vector / Web",group:"Web",engine:"native",driver:"LIBKML",read:true,write:true,crsLocked:"EPSG:4326",note:"ZIP chứa KML và tài nguyên. Bản native hiện ưu tiên geometry + thuộc tính."},
  {id:"shp",name:"ESRI Shapefile",ext:".shp + sidecar",type:"Vector",group:"Vector",engine:"gdal",driver:"ESRI Shapefile",read:true,write:true,multi:true,zipOutput:true,note:"Cần .shp + .shx + .dbf; .prj/.cpg nên có. Xuất dưới dạng ZIP để giữ sidecar."},
  {id:"geojson",name:"GeoJSON",ext:".geojson",type:"Vector / JSON",group:"Web",engine:"native",driver:"GeoJSON",read:true,write:true,crsLocked:"EPSG:4326",note:"RFC 7946 dùng WGS84. VN-2000 nên dùng VFM/JSON/GPKG thay vì GeoJSON chuẩn."},
  {id:"json",name:"GIS JSON",ext:".json",type:"Vector / JSON",group:"Web",engine:"native",read:true,write:true,note:"Nhận GeoJSON hoặc xulyVFM Feature JSON. JSON không có geometry/schema GIS sẽ bị từ chối."},
  {id:"gpx",name:"GPX",ext:".gpx",type:"GPS / Vector",group:"GPS",engine:"gdal",driver:"GPX",read:true,write:true,crsLocked:"EPSG:4326",note:"GPX dùng WGS84; phù hợp waypoint/route/track, không bảo toàn mọi polygon/field."},
  {id:"gml",name:"GML",ext:".gml",type:"Vector / XML",group:"Vector",engine:"gdal",driver:"GML",read:true,write:true,note:"GML 2/3 Simple Features qua GDAL/WASM; schema ứng dụng phức tạp có thể không round-trip."},
  {id:"gpkg",name:"GeoPackage",ext:".gpkg",type:"Container / Vector/Raster",group:"Database",engine:"gdal",driver:"GPKG",read:true,write:true,note:"OGC GeoPackage trên SQLite. Total Converter ưu tiên lớp vector; raster cần pipeline raster riêng."},
  {id:"gdb",name:"ESRI FileGDB",ext:".gdb / .gdb.zip",type:"Database / Vector",group:"Database",engine:"gdal",driver:"OpenFileGDB",read:true,write:true,multi:true,zipOutput:true,note:".gdb là thư mục dataset. Trình duyệt dùng chọn thư mục hoặc .gdb.zip; xuất đóng gói ZIP."},
  {id:"mdb",name:"ESRI Personal GDB",ext:".mdb",type:"Database / Vector",group:"Database",engine:"blocked",read:false,write:false,note:"PGeo phụ thuộc ODBC. GDAL WebAssembly hiện không có ODBC nên không xử lý .mdb an toàn trong browser."},
  {id:"tab",name:"MapInfo TAB",ext:".tab + sidecar",type:"Vector",group:"Vector",engine:"gdal",driver:"MapInfo File",read:true,write:true,multi:true,zipOutput:true,note:"TAB thường đi với .dat/.map/.id. Xuất ZIP để giữ đủ bộ file."},
  {id:"mif",name:"MapInfo MIF/MID",ext:".mif / .mid",type:"Vector",group:"Vector",engine:"gdal",driver:"MapInfo File",read:true,write:true,multi:true,zipOutput:true,creation:["-lco","FORMAT=MIF"],note:"MIF chứa geometry/schema; MID chứa thuộc tính. Cần giữ cặp file khi có MID."},
  {id:"e00",name:"Arc/Info E00",ext:".e00",type:"Legacy Vector",group:"Legacy",engine:"gdal",driver:"AVCE00",read:true,write:false,note:"GDAL/WASM đọc AVCE00 nhưng không có writer E00 tương ứng; chỉ dùng làm nguồn."},
  {id:"sqlite",name:"SQLite / SpatiaLite",ext:".sqlite / .db",type:"Database / Vector",group:"Database",engine:"gdal",driver:"SQLite",read:true,write:true,note:"Spatial SQLite qua GDAL/WASM. SQLite không gian và SQLite thường cần được engine nhận dạng."},
  {id:"tif",name:"GeoTIFF",ext:".tif / .tiff",type:"Raster",group:"Raster",engine:"gdal",driver:"GTiff",read:true,write:true,raster:true,note:"Raster georeferenced. Không tự chuyển raster thành vector nếu chưa chọn phép vector hóa."},
  {id:"csv",name:"CSV",ext:".csv",type:"Bảng / Vector",group:"Table",engine:"gdal",driver:"CSV",read:true,write:true,note:"Để thành GIS cần X/Y hoặc WKT. Khi xuất, geometry được ghi WKT để tránh mất hình học."},
  {id:"txt",name:"TXT phân cách",ext:".txt",type:"Bảng / Text",group:"Table",engine:"gdal",driver:"CSV",read:true,write:true,note:"Chỉ xử lý như bảng phân cách/CSV. TXT tự do không có cấu trúc GIS sẽ bị cảnh báo."},
  {id:"cbor",name:"GeoCBOR · xulyVFM",ext:".cbor",type:"Vector / Binary",group:"Web",engine:"native",read:true,write:true,note:"Profile CBOR riêng của xulyVFM; CBOR tùy ý không có schema địa lý sẽ không được giả định là GIS."}
];

export const FORMAT_MAP=new Map(FORMATS.map(f=>[f.id,f]));

const EXT_MAP=new Map([
  ["vfm","vfm"],["dxf","dxf"],["dgn","dgn"],["kml","kml"],["kmz","kmz"],
  ["shp","shp"],["shx","shp"],["dbf","shp"],["prj","shp"],["cpg","shp"],
  ["geojson","geojson"],["json","json"],["gpx","gpx"],["gml","gml"],["gpkg","gpkg"],
  ["mdb","mdb"],["tab","tab"],["dat","tab"],["map","tab"],["id","tab"],["mif","mif"],["mid","mif"],
  ["e00","e00"],["sqlite","sqlite"],["db","sqlite"],["tif","tif"],["tiff","tif"],
  ["csv","csv"],["txt","txt"],["cbor","cbor"],["zip","gdb"]
]);

export function extensionOf(name=""){
  const clean=name.toLowerCase().split("?")[0].split("#")[0];
  const i=clean.lastIndexOf(".");
  return i<0?"":clean.slice(i+1);
}
export function detectFormat(files){
  const a=[...files];
  const rel=a.map(f=>f.webkitRelativePath||f.name).join("\n").toLowerCase();
  if(rel.includes(".gdb/"))return FORMAT_MAP.get("gdb");
  const primary=a.find(f=>["vfm","kml","kmz","shp","geojson","json","gpx","gml","gpkg","mdb","tab","mif","e00","sqlite","db","tif","tiff","csv","txt","cbor","dxf","dgn"].includes(extensionOf(f.name)))||a[0];
  if(!primary)return null;
  const ext=extensionOf(primary.name);
  if(ext==="zip" && /\.gdb\.zip$/i.test(primary.name))return FORMAT_MAP.get("gdb");
  return FORMAT_MAP.get(EXT_MAP.get(ext)||"")||null;
}
export function isVectorFormat(f){return !!f && !f.raster && !["blocked"].includes(f.engine);}
export function crsById(id){return CRS_OPTIONS.find(x=>x.id===id)||CRS_OPTIONS[0];}

export function compatibility(source,target,{sourceIsRaster=false,targetCrs="KEEP"}={}){
  if(!source||!target)return {ok:false,level:"error",reason:"Chưa xác định định dạng nguồn hoặc đích."};
  if(source.engine==="blocked"||!source.read)return {ok:false,level:"error",reason:source.note};
  if(!target.write)return {ok:false,level:"error",reason:target.id==="e00"?"E00 trong engine trình duyệt chỉ có driver đọc; không có writer an toàn.":target.note};
  if(target.engine==="blocked")return {ok:false,level:"error",reason:target.note};
  if(target.crsLocked && targetCrs!=="KEEP" && targetCrs!==target.crsLocked){
    return {ok:false,level:"error",reason:`${target.name} yêu cầu ${target.crsLocked}. Không ghi tọa độ ${targetCrs} vào định dạng này vì sẽ sai ngữ nghĩa CRS.`};
  }
  const targetRaster=!!target.raster;
  if(sourceIsRaster && !targetRaster && target.id!=="vfm" && target.id!=="gpkg"){
    return {ok:false,level:"error",reason:"Nguồn là raster nhưng đích là vector. Cần một phép vector hóa/polygonize có tham số; Total GIS Converter không tự suy đoán phép toán này."};
  }
  if(!sourceIsRaster && targetRaster && source.id!=="vfm"){
    return {ok:false,level:"error",reason:"Nguồn là vector nhưng đích là raster. Cần rasterization (độ phân giải, extent, thuộc tính burn); không thể bảo toàn dữ liệu bằng chuyển định dạng thuần túy."};
  }
  const warns=[];
  if(target.id==="dxf")warns.push("DXF không bảo toàn CRS metadata; chỉ tọa độ sau biến đổi được ghi.");
  if(target.id==="shp")warns.push("Shapefile có giới hạn DBF/kiểu trường và là định dạng nhiều file; kết quả được đóng ZIP.");
  if(target.id==="csv"||target.id==="txt")warns.push("Bảng text không có mô hình geometry đầy đủ; geometry sẽ ưu tiên WKT.");
  if(target.id==="gpx")warns.push("GPX chỉ phù hợp điểm/track/route; polygon và schema thuộc tính phức tạp có thể mất.");
  if(target.id==="mif"||target.id==="tab")warns.push("MapInfo là định dạng nhiều file; kết quả được đóng ZIP.");
  return {ok:true,level:warns.length?"warning":"ok",reason:warns.join(" ")};
}
