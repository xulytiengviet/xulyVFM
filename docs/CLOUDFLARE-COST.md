# Cloudflare capacity and cost model

Rates and included usage must be rechecked before production deployment. The values below are based on Cloudflare Containers pricing available during the 2026-09 architecture review.

## Proposed pools

| Pool | Instance | vCPU | RAM | Disk | max_instances | Use |
|---|---:|---:|---:|---:|---:|---|
| Vector | standard-2 | 1 | 6 GiB | 12 GB | 3 | SHP/DXF/DGN/GPKG/GDB/TAB/MIF/GML/GPX/SQLite |
| Raster | standard-3 | 2 | 8 GiB | 16 GB | 2 | GeoTIFF, reprojection/warp, raster GPKG |

Containers are constrained to APAC and use `sleepAfter=35s`.

## Published unit rates

- Memory: $0.0000025 / GiB-second
- CPU: $0.000020 / active vCPU-second
- Disk: $0.00000007 / GB-second

Workers Paid includes monthly Container usage before overage:
- 25 GiB-hours memory
- 375 vCPU-minutes
- 200 GB-hours disk

## Approximate compute cost after included usage

Assuming fully active CPU during conversion and one isolated job followed by the complete 35-second idle window:

### standard-2
- 15 s conversion: about $0.001092/job including 35 s memory+disk idle
- 30 s conversion: about $0.001630/job
- 60 s conversion: about $0.002705/job

### standard-3
- 15 s conversion: about $0.001656/job
- 30 s conversion: about $0.002573/job
- 60 s conversion: about $0.004406/job

These are capacity-planning approximations, not invoices. Consecutive jobs on an already-running instance amortize idle memory/disk cost. Actual active CPU can be less than wall time.

## Why not keep containers hot for minutes?

Memory and disk are billed while the instance is provisioned. For an interactive converter, 30–45 seconds is a reasonable first idle window:
- long enough to reuse an instance for repeated conversions;
- short enough to avoid paying several minutes of RAM/disk after a one-off job.

Cloudflare reports typical cold starts in roughly the 1–3 second range, depending on image size and startup work. Keep the image small and avoid language/runtime initialization beyond the Go server and installed GDAL shared libraries.

## No-R2 default

Default conversion cost intentionally excludes R2 because user files are not stored there.

If Temporary R2 Mode is added later:
- account for R2 Class A/B operations and storage;
- use direct presigned browser uploads;
- delete source and output explicitly after completion;
- keep a short lifecycle only as cleanup insurance;
- disclose the temporary-storage mode to the user before upload.
