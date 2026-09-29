# xulyVFM — Total GIS Converter

**Long Ngo phát triển · MIT License**

xulyVFM là bộ chuyển đổi GIS chạy trên trình duyệt, lấy **VFM** làm định dạng trung tâm. Ứng dụng kết hợp engine native nhẹ cho VFM/KML/KMZ/GeoJSON/JSON/GeoCBOR với **engine GIS nâng cao tự nạp từ CDN khi cần** cho các định dạng GIS/CAD/database/raster nặng. Người dùng không phải tải hay cài tệp WASM thủ công.

Trang chạy: https://xulytiengviet.github.io/xulyVFM/

## Mục tiêu

```
CAD / GIS / GPS / Database / Raster
              ↓
        Canonical GIS model
        ├─ VFM Feature + CVNSS4.0
        └─ VFM Raster Profile
              ↓
       Định dạng đích + CRS
```

Không coi mọi thao tác là “đổi đuôi file”. Raster ↔ vector, CRS không xác định, driver read-only, dataset thiếu sidecar, hoặc định dạng proprietary cần dependency không có trong browser sẽ bị chặn hoặc hiện cảnh báo trước khi chạy.

## Định dạng

| Định dạng | Đuôi file | Loại | Engine |
|---|---|---|---|
| VFM | `.vfm` | Vector / Raster | Native |
| CAD / DXF | `.dxf` | CAD / Vector | GDAL/WASM |
| MicroStation DGN | `.dgn` | CAD / Vector | GDAL/WASM |
| KML / KMZ | `.kml/.kmz` | Vector / Web | Native |
| ESRI Shapefile | `.shp + .shx + .dbf` | Vector | GDAL/WASM |
| GeoJSON / JSON | `.geojson/.json` | Vector | Native |
| GPX | `.gpx` | GPS / Vector | GDAL/WASM |
| GML | `.gml` | Vector / XML | GDAL/WASM |
| GeoPackage | `.gpkg` | Vector / Raster container | GDAL/WASM |
| ESRI FileGDB | `.gdb/.gdb.zip` | Database | GDAL/WASM |
| Personal GDB | `.mdb` | Database | Browser blocked: ODBC |
| MapInfo | `.tab`, `.mif/.mid` | Vector | GDAL/WASM |
| Arc/Info E00 | `.e00` | Legacy vector | Read only |
| SQLite / SpatiaLite | `.sqlite/.db` | Database | GDAL/WASM |
| GeoTIFF | `.tif/.tiff` | Raster | GDAL/WASM + VFM Raster |
| CSV / TXT | `.csv/.txt` | Table / Vector | GDAL/WASM |
| GeoCBOR xulyVFM | `.cbor` | Vector / Binary | Native |

Chi tiết và quy tắc mất dữ liệu: [docs/FORMAT-MATRIX.md](docs/FORMAT-MATRIX.md).

## CRS

Ứng dụng không suy đoán VN-2000 theo tên tỉnh.

- WGS 84: **EPSG:4326**
- VN-2000 geographic: **EPSG:4756**
- VN-2000 / UTM zone 48N: **EPSG:3405**
- VN-2000 / UTM zone 49N: **EPSG:3406**

KML, KMZ, GPX và GeoJSON RFC 7946 bị khóa đầu ra ở WGS84. Các hệ VN-2000 3°/kinh tuyến trục địa phương cần EPSG hoặc tham số biến đổi cụ thể và sẽ được bổ sung trong Advanced CRS.

## Kiến trúc

```
index.html
src/
  total-app.js          Total GIS workflow + UI
  format-registry.js    registry + compatibility/safety matrix
  gdal-engine.js        lazy GDAL/PROJ WASM adapter
  light-formats.js      GeoJSON/JSON bridge
  geocbor.js            xulyVFM.GeoCBOR/1
  vfm-core.js           VFM reader/verifier
  vfm-writer.js         VFM Feature writer
  vfm-raster.js         VFM Raster writer
  geo-exchange.js       KML/KMZ + ZIP helpers
assets/
  cvnss-converter.js    CVNSS4.0 5.0 audit-safe
profiles/
  cvnss4-feature-v1.md
docs/
  FORMAT-MATRIX.md
```

## VFM text

Unicode là giá trị authoritative. CVNSS4.0 là khóa dẫn xuất phục vụ index/search và không được dùng làm stable entity identity.

## VFM Raster

Raster không bị ép sang Feature. VFM Raster profile dùng:

```
META
PROF
RINF   metadata raster/CRS
RAST   raster asset
HASH
```

Raster → vector và vector → raster yêu cầu phép toán có tham số (polygonize/rasterize) nên không chạy ngầm.

## Browser GIS engine

Các định dạng nặng dùng **gdal3.js 2.8.1** theo đúng chế độ Script (CDN): ứng dụng tự gọi `initGdalJs({ path, useWorker:false })` khi người dùng chọn một định dạng cần engine nâng cao. Không có nút “Download WASM”, không yêu cầu cài đặt và native formats không kích hoạt engine này. `preconnect`, idle warm-up và Service Worker giúp giảm thời gian chờ và tái sử dụng cache ở những lần sau.

Xem [docs/ENGINE-LOADING.md](docs/ENGINE-LOADING.md). Mã nguồn xulyVFM được cấp phép MIT; dependency bên thứ ba giữ giấy phép riêng, xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm test
```

CI kiểm tra VFM Feature, VFM Raster, GZIP FEAT, KML/KMZ round-trip, GeoCBOR và safety matrix.

## License

MIT © 2026 Long Ngo.
