# Engine loading — no manual WASM download

xulyVFM follows the **Script (CDN)** mode documented by gdal3.js.

The user never downloads or installs a `.wasm` file manually.

## Runtime flow

```
VFM/KML/KMZ/GeoJSON/JSON/GeoCBOR
        ↓
Native browser engine
        ↓
No GDAL load

SHP/DXF/DGN/GPKG/GDB/TAB/GeoTIFF/...
        ↓
User selects a GDAL-backed source or target
        ↓
requestIdleCallback warm-up
        ↓
gdal3.js CDN loader
        ↓
initGdalJs({
  path: "https://cdn.jsdelivr.net/npm/gdal3.js@2.8.1/dist/package",
  useWorker: false
})
        ↓
Browser automatically fetches JS + data + WASM
        ↓
Service Worker / HTTP cache reuse on later runs
```

The CDN script mode in the official gdal3.js documentation explicitly uses `useWorker:false`. The application therefore does not expose a worker toggle or a “Download WASM” button.

## Performance choices

- `preconnect` + `dns-prefetch` only warm the CDN connection; they do **not** fetch the WASM payload.
- Native formats never initialize GDAL.
- A GDAL-backed format triggers an idle warm-up while the user chooses target format and CRS.
- A service worker caches only the pinned gdal3.js 2.8.1 package resources after first use.
- The version and SRI of the loader are pinned to the values published in the gdal3.js documentation.

## Offline note

Native formats remain usable without GDAL. GDAL-backed formats need network access on the first use unless the engine resources already exist in browser cache. Cache storage can be evicted by the browser, so this is an optimization, not a permanent offline guarantee.
