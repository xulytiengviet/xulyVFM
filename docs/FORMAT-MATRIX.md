# Total GIS Converter — Format & Safety Matrix

Project: **xulyVFM**  
License: **MIT**  
Developer: **Long Ngo**

VFM is the central interchange container. Vector data is normalized to the VFM Feature + CVNSS4.0 logical model. Raster data uses a separate VFM Raster profile. Cross-model operations such as vector → raster and raster → vector are not treated as ordinary file conversion.

| Định dạng | Đuôi file | Loại | Ghi chú |
|---|---|---|---|
| VFM | .vfm | Vector / Raster | Trung tâm. Core 1.3, integrity CRC32C/SHA-256, Feature/CVNSS4.0 và Raster profile. |
| CAD / DXF | .dxf | CAD / Vector | GDAL/WASM. DXF không bảo toàn CRS metadata đáng tin cậy. |
| MicroStation DGN | .dgn | CAD / Vector | GDAL/WASM; DGN cổ điển và DGN v8 có khác biệt driver. |
| KML | .kml | Vector / Web | WGS84 bắt buộc khi xuất. |
| KMZ | .kmz | Vector / Web | ZIP/KML; native browser cho geometry + attributes. |
| ESRI Shapefile | .shp + .shx + .dbf (+ .prj/.cpg) | Vector | Multi-file. Xuất ZIP để giữ sidecar. |
| GeoJSON | .geojson | Vector / JSON | RFC 7946: WGS84. Không ghi VN-2000 vào GeoJSON chuẩn. |
| GIS JSON | .json | Vector / JSON | Nhận GeoJSON hoặc xulyVFM Feature JSON. |
| GPX | .gpx | GPS / Vector | WGS84; waypoint/track/route, không phù hợp polygon/schema phức tạp. |
| GML | .gml | Vector / XML | GML 2/3 Simple Features qua GDAL/WASM. |
| GeoPackage | .gpkg | Container | Vector hoặc raster; SQLite/OGC. |
| ESRI FileGDB | .gdb / .gdb.zip | Database / Vector | .gdb là thư mục. Browser ưu tiên .gdb.zip hoặc chọn thư mục. |
| ESRI Personal GDB | .mdb | Database / Vector | Không hỗ trợ browser vì driver PGeo cần ODBC. |
| MapInfo TAB | .tab + sidecar | Vector | Multi-file, xuất ZIP. |
| MapInfo MIF/MID | .mif / .mid | Vector | Cặp geometry/schema + attributes. |
| Arc/Info E00 | .e00 | Legacy Vector | Driver browser chỉ đọc; không writer E00 an toàn. |
| SQLite / SpatiaLite | .sqlite / .db | Database / Vector | GDAL/WASM. |
| GeoTIFF | .tif / .tiff | Raster | VFM Raster profile; không tự polygonize. |
| CSV | .csv | Table / Vector | Cần X/Y hoặc WKT để có geometry; output dùng WKT. |
| TXT phân cách | .txt | Table / Text | Chỉ xử lý như bảng phân cách. TXT tự do không được suy đoán là GIS. |
| GeoCBOR xulyVFM | .cbor | Vector / Binary | Profile riêng xulyVFM.GeoCBOR/1; không nhận CBOR tùy ý. |

## CRS rules

- **WGS 84**: EPSG:4326.
- **VN-2000 geographic**: EPSG:4756.
- **VN-2000 / UTM zone 48N**: EPSG:3405.
- **VN-2000 / UTM zone 49N**: EPSG:3406.
- KML, KMZ, GPX and RFC 7946 GeoJSON are forced to WGS84 on output.
- Local VN-2000 3-degree zones / provincial central meridians are not guessed. A specific EPSG definition or exact transformation parameters must be supplied in a future advanced CRS panel.

## Popup safety rules

Conversion is blocked when:

1. A required sidecar is missing (for example SHP/SHX/DBF).
2. The requested target driver is read-only (E00).
3. The browser engine lacks a required native dependency (MDB/PGeo requires ODBC).
4. A raster is sent to a vector target without an explicit polygonize/vectorize operation.
5. A vector is sent to GeoTIFF without rasterization parameters such as extent, resolution and burn field/value.
6. A format with fixed CRS semantics is requested with an incompatible target CRS.
7. Source CRS is unknown while reprojection is requested.

Warnings are shown, with explicit user continuation, when a conversion can run but may lose style, topology, field types, sidecars, domains, attachments or CRS metadata.
