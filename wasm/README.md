# xulyVFM minimal GDAL/WASM

Do not treat Rust or Go as a replacement compiler for GDAL.

GDAL is C/C++. The browser build should remain an **Emscripten GDAL build with a reduced driver set**. Rust/WASM can be used beside it for xulyVFM-native validation and binary codecs.

Recommended browser split:

## vector-gdal.wasm
Target operations:
- ogr2ogr
- ogrinfo
- coordinate transform

Driver set:
- core: Shapefile, MapInfo File, KML, GeoJSON
- optional: DXF, DGN, GML, GPX, GPKG, SQLite, OpenFileGDB

Dependencies:
- PROJ
- GEOS only if geometry operations are required
- SQLite for GPKG/SQLite
- Expat for GML/GPX
- iconv/zlib as required

## raster-gdal.wasm
Target operations:
- gdal_translate
- gdalwarp
- gdalinfo

Driver set:
- GTiff
- GPKG
- mandatory VRT/MEM/core drivers

Avoid unrelated scientific/satellite/database drivers in the browser build.

## Rust WASM companion

Good Rust/WASM candidates:
- VFM Core parser
- CRC32C/SHA-256 orchestration
- CBOR
- ZIP directory parsing
- geometry extent/count/statistics
- deterministic conversion preflight

This keeps the GDAL binary focused on the operations for which GDAL is authoritative.
