# xulyVFM Hybrid Conversion Architecture

**Goal:** fast conversion, deterministic output, explicit CRS, no persistent user-file storage by default.

## 1. Three execution tiers

### Tier A — Native browser
Use for formats already implemented without GDAL:
- VFM Feature / VFM Raster
- KML / KMZ
- GeoJSON / GIS JSON
- xulyVFM GeoCBOR

Properties:
- no upload
- no backend
- no GDAL download
- immediate conversion
- browser File API / CompressionStream / crypto.subtle

### Tier B — Minimal GDAL WebAssembly
Use only when the input is small enough and the selected driver exists in the xulyVFM browser build.

Recommended vector build:
- ESRI Shapefile
- MapInfo File
- DXF
- DGN
- GML
- GPX
- GPKG
- SQLite
- KML
- GeoJSON
- CSV
- OpenFileGDB only if memory tests pass

Recommended raster build:
- GTiff
- GPKG
- VRT/MEM required by processing
- PNG/JPEG only when needed for auxiliary output

Do not ship the full upstream gdal3.js driver set for xulyVFM production.

### Tier C — Cloudflare native backend
Use for:
- larger datasets
- FileGDB directory datasets
- large GeoTIFF / GPKG
- conversions with many sidecars
- conversions requiring native GDAL performance
- operations predicted to exceed browser memory

Architecture:

```
Browser
  |
  | POST multipart/form-data (stream)
  v
Cloudflare Worker
  - auth/rate/origin checks
  - request-size gate
  - no file persistence
  |
  v
Cloudflare Container
  - Go HTTP server
  - native GDAL/PROJ
  - per-request /tmp/<random>
  - strict driver/option whitelist
  - validate input
  - convert
  - re-open + validate output
  - stream result
  - defer RemoveAll(tempDir)
  |
  v
Browser download
```

Do not use Durable Object storage, KV, D1, or R2 for the default conversion path.

## 2. Privacy contract

Default backend mode means **no persistent storage**:
1. request body is streamed to a Cloudflare Container;
2. temporary bytes exist only on the container's ephemeral filesystem for the lifetime of the conversion;
3. no user filename, raw content, geometry, attribute values, hashes, or output bytes are written to D1/KV/DO storage;
4. temporary directory is removed on success, failure, cancellation, or timeout;
5. container has public Internet disabled;
6. logs contain request ID, format IDs, byte counts, duration, exit code — never file content.

"Zero bytes ever touch disk" is not claimed. Native GDAL frequently needs seekable files and sidecars. The guarantee is **no persistent retention**.

## 3. Very large files

Workers request-body limits depend on the Cloudflare account plan. Therefore the default no-persistent-storage service must reject files above the configured account-safe threshold.

Optional future mode: **Temporary R2 staging**.
- must be explicit opt-in;
- browser uploads directly with a short-lived presigned URL;
- processing container reads and deletes source/output immediately;
- lifecycle rule is only a safety net, not the primary deletion mechanism;
- UI must say that temporary cloud storage is being used.

Do not describe this optional path as "no storage".

## 4. Output quality gates

Every conversion follows:

```
detect -> inspect -> CRS preflight -> convert -> reopen -> validate -> compare -> deliver
```

### Vector quality
- input opens with the intended driver, optionally restricted with `-if`;
- layer count and feature count recorded before conversion;
- source CRS must be explicit when reprojection is requested;
- output is reopened by GDAL;
- output driver and CRS are verified;
- geometry type distribution is compared;
- invalid geometries are reported, not silently modified;
- `-makevalid` is opt-in;
- field-name truncation/type coercion warnings are emitted for Shapefile/CSV/GPX;
- multi-file outputs are zipped as one atomic download.

### Raster quality
- width/height/band count validated before processing;
- CRS/geotransform checked;
- output reopened with `gdalinfo -json`;
- width/height/bands checked after pure-format conversion;
- reprojection reports changed extent/resolution;
- nodata, datatype, color interpretation and compression are recorded;
- vector<->raster is never performed without explicit operation parameters.

## 5. CRS rules

- WGS84: EPSG:4326
- VN-2000 geographic: EPSG:4756
- VN-2000 / UTM 48N: EPSG:3405
- VN-2000 / UTM 49N: EPSG:3406

KML/KMZ/GPX/RFC 7946 GeoJSON output is forced to WGS84.

Provincial/local VN-2000 3-degree zones must use an explicit EPSG definition or an exact PROJ pipeline. Never infer a transformation from a province name.

## 6. Browser/backend routing policy

Initial conservative thresholds:

- Native browser: always for native formats.
- Minimal WASM: use when total selected input <= 32 MiB and estimated expanded memory <= 192 MiB.
- Backend stream: use when above the WASM threshold but below the configured Worker request-body ceiling.
- Reject/ask explicit large-file opt-in when above the backend ceiling.

The 32/192 MiB thresholds are policy defaults, not mathematical constants. Replace them with telemetry from real devices. Never use `navigator.deviceMemory` as the sole safety signal.

## 7. Cloudflare sizing

Recommended first deployment:
- Container instance: `standard-2` (1 vCPU, 6 GiB RAM, 12 GB ephemeral disk)
- `max_instances`: 3
- region constraint: APAC
- `sleepAfter`: 2m
- public Internet from container: disabled

For heavy raster:
- move to `standard-3` (2 vCPU, 8 GiB, 16 GB disk) when benchmarks justify it.

Workers are the control plane, not the GDAL compute plane.

## 8. Rust / Go decision

### Go — backend orchestration
Use Go for the Cloudflare Container HTTP service:
- simple streaming I/O;
- low orchestration overhead;
- small operational surface;
- easy cancellation via request context;
- GDAL remains native C/C++ CLI/library, so conversion performance is dominated by GDAL rather than Go vs Rust.

### Rust — browser-native utilities
Use Rust/WASM for xulyVFM-specific hot paths only:
- VFM header/directory/hash validation;
- CBOR codec;
- ZIP/CRC;
- geometry statistics;
- lightweight GeoJSON transforms;
- deterministic validation.

Do **not** port GDAL to Go-WASM. Go's WASM runtime adds weight and offers no benefit for GDAL itself.

Do **not** rewrite GDAL in Rust. For the browser GDAL build, keep GDAL C/C++ compiled by Emscripten and reduce the enabled driver set at CMake time.

## 9. Minimal GDAL/WASM build

Use GDAL's supported driver-selection flags:

```bash
cmake .. \
  -UGDAL_ENABLE_DRIVER_* -UOGR_ENABLE_DRIVER_* \
  -DGDAL_BUILD_OPTIONAL_DRIVERS=OFF \
  -DOGR_BUILD_OPTIONAL_DRIVERS=OFF \
  -DOGR_ENABLE_DRIVER_DXF=ON \
  -DOGR_ENABLE_DRIVER_DGN=ON \
  -DOGR_ENABLE_DRIVER_GML=ON \
  -DOGR_ENABLE_DRIVER_GPX=ON \
  -DOGR_ENABLE_DRIVER_GPKG=ON \
  -DOGR_ENABLE_DRIVER_SQLITE=ON \
  -DOGR_ENABLE_DRIVER_OPENFILEGDB=ON
```

Shapefile, MapInfo, KML and GeoJSON are core/non-disableable in modern GDAL builds. Raster core includes GTiff/VRT/MEM; add only optional raster drivers actually required.

Security:
- disable Curl if browser build does not need remote virtual files;
- compile only the required drivers;
- never expose arbitrary GDAL CLI parameters to users.
