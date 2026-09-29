#!/usr/bin/env bash
set -euo pipefail

: "${GDAL_SRC:?Set GDAL_SRC to a GDAL source checkout}"
BUILD_DIR="${BUILD_DIR:-$PWD/build-gdal-wasm}"

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

emcmake cmake "$GDAL_SRC"   -UGDAL_ENABLE_DRIVER_*   -UOGR_ENABLE_DRIVER_*   -DGDAL_BUILD_OPTIONAL_DRIVERS=OFF   -DOGR_BUILD_OPTIONAL_DRIVERS=OFF   -DGDAL_USE_CURL=OFF   -DOGR_ENABLE_DRIVER_DXF=ON   -DOGR_ENABLE_DRIVER_DGN=ON   -DOGR_ENABLE_DRIVER_GML=ON   -DOGR_ENABLE_DRIVER_GPX=ON   -DOGR_ENABLE_DRIVER_GPKG=ON   -DOGR_ENABLE_DRIVER_SQLITE=ON   -DOGR_ENABLE_DRIVER_OPENFILEGDB=ON   -DCMAKE_BUILD_TYPE=MinSizeRel

cmake --build . --parallel

echo "Minimal GDAL core configured. Wrap/export only xulyVFM-required apps/functions with Emscripten."
