# Deploy xulyVFM native conversion backend on Cloudflare

This backend is optional. The GitHub Pages frontend continues to work without it.

## Requirements

- Cloudflare Workers Paid / Containers access
- Docker or another Docker-compatible engine for a local Dockerfile build
- Node.js supported by Wrangler
- Wrangler authentication to the intended Cloudflare account

## Deploy

```bash
cd cloudflare
npm install
npx wrangler login
npm run types
npm run deploy
```

Wrangler builds `../backend-go/Dockerfile` for linux/amd64 and uploads the image to Cloudflare's managed container registry.

## Dashboard checks

In dash.cloudflare.com verify:

1. **Workers & Pages → xulyvfm-convert**
   - deployment is healthy;
   - both Durable Object container classes exist;
   - Vector and Raster container configurations are present.

2. **Observability**
   - keep logs metadata-only;
   - never log request bodies, GDAL metadata dumps, GIS attributes or coordinates.

3. **Custom domain / route**
   - attach a dedicated API host, for example a subdomain you control;
   - HTTPS only.

4. **Security**
   - CORS origin is exactly `https://xulytiengviet.github.io` unless a custom frontend domain is added;
   - Container public Internet remains disabled;
   - no R2/KV/D1 binding is required for the default conversion path.

## Enable the frontend backend route

After deployment, set the Cloudflare Worker HTTPS endpoint in:

```js
// src/runtime-config.js
backendEndpoint: "https://YOUR-CONVERSION-HOST"
```

The frontend execution router then uses:
- native browser for native lightweight formats;
- minimal GDAL/WASM for suitable small conversions;
- Cloudflare Container for heavy/multi-file conversions within the stream limit.

## Request-size policy

Default `MAX_STREAM_BYTES=90,000,000` intentionally stays below the 100 MB Cloudflare request-body limit that applies to Free/Pro zone plans.

If the account's request-body limit is higher, raise the value only after load testing. The container also applies its own safety limit.

Files over this threshold are rejected in no-persistent-storage mode.

## Large-file mode

Do not silently add R2.

If a separate Temporary R2 Mode is introduced:
- require explicit user consent;
- use direct presigned browser upload;
- process and explicitly delete objects immediately;
- add a short lifecycle rule only as a cleanup backstop;
- label the mode "temporary cloud storage", not "no storage".
