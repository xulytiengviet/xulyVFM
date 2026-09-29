import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  VECTOR_CONTAINER: DurableObjectNamespace<VectorContainer>;
  RASTER_CONTAINER: DurableObjectNamespace<RasterContainer>;
  ALLOWED_ORIGIN: string;
  MAX_STREAM_BYTES: string;
  BACKEND_TOKEN: string;
}

class BaseGdalContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "35s";
  enableInternet = false;
}
export class VectorContainer extends BaseGdalContainer {}
export class RasterContainer extends BaseGdalContainer {}

const VECTOR_POOL = 3;
const RASTER_POOL = 2;
const METHODS = "GET,POST,OPTIONS";
const HEADERS = "Authorization,Content-Type,X-XulyVFM-Source,X-XulyVFM-Target,X-XulyVFM-Source-CRS,X-XulyVFM-Target-CRS,X-XulyVFM-Model";

function cors(env: Env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": METHODS,
    "Access-Control-Allow-Headers": HEADERS,
    "Access-Control-Max-Age": "3600",
    "Access-Control-Expose-Headers": "Content-Disposition,X-XulyVFM-Manifest,X-Request-ID",
    "Vary": "Origin"
  };
}
function json(body: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) }
  });
}
function chooseModel(source: string, target: string, requested: string) {
  if (requested === "raster" || requested === "vector") return requested;
  if (source === "tif" || target === "tif") return "raster";
  return "vector";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin && origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403, env);
    // Fail closed. This token is a backend credential, never a Cloudflare API token.
    if (!env.BACKEND_TOKEN || env.BACKEND_TOKEN.length < 32) return json({ error: "backend_auth_not_configured" }, 503, env);
    if (request.headers.get("Authorization") !== "Bearer " + env.BACKEND_TOKEN) return json({ error: "unauthorized" }, 401, env);
    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const instance = await getRandom(env.VECTOR_CONTAINER, VECTOR_POOL);
        const response = await instance.fetch(new Request(new URL("/health", request.url)));
        const health = await response.json() as { ok?: boolean; gdal?: boolean };
        return json({ service: "xulyVFM", ok: response.ok && health.ok === true, gdal: health.gdal === true, maxBytes: Number(env.MAX_STREAM_BYTES || 90_000_000), storage: "temporary-container" }, response.ok ? 200 : 503, env);
      } catch { return json({ service: "xulyVFM", ok: false, gdal: false }, 503, env); }
    }
    if (url.pathname !== "/v1/convert" || request.method !== "POST") {
      return json({ error: "not_found" }, 404, env);
    }
    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return json({ error: "origin_not_allowed" }, 403, env);
    }

    const max = Number(env.MAX_STREAM_BYTES || 90_000_000);
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length && length > max) {
      return json({
        error: "payload_too_large",
        maxBytes: max,
        message: "File vượt ngưỡng stream không lưu. R2 temporary mode không được bật mặc định."
      }, 413, env);
    }

    const source = (request.headers.get("X-XulyVFM-Source") || "").toLowerCase();
    const target = (request.headers.get("X-XulyVFM-Target") || "").toLowerCase();
    const requestedModel = (request.headers.get("X-XulyVFM-Model") || "").toLowerCase();
    if (!/^[a-z0-9_-]{1,24}$/i.test(source) || !/^[a-z0-9_-]{1,24}$/i.test(target)) {
      return json({ error: "bad_format_id" }, 400, env);
    }

    const reqId = crypto.randomUUID();
    const headers = new Headers(request.headers);
    headers.set("X-Request-ID", reqId);
    headers.delete("Cookie");
    headers.delete("Authorization");

    const forwarded = new Request(request.url, {
      method: "POST",
      headers,
      body: request.body,
      redirect: "manual"
    });

    const model = chooseModel(source, target, requestedModel);
    const instance = model === "raster"
      ? await getRandom(env.RASTER_CONTAINER, RASTER_POOL)
      : await getRandom(env.VECTOR_CONTAINER, VECTOR_POOL);

    let response: Response;
    try { response = await instance.fetch(forwarded); }
    catch { return json({ error: "gdal_backend_unavailable", requestId: reqId }, 503, env); }
    const outHeaders = new Headers(response.headers);
    Object.entries(cors(env)).forEach(([k,v]) => outHeaders.set(k,v));
    outHeaders.set("X-Request-ID", reqId);
    outHeaders.set("X-XulyVFM-Execution", "cloudflare-container-"+model);
    outHeaders.set("Cache-Control", "no-store, private");
    return new Response(response.body, { status: response.status, headers: outHeaders });
  }
} satisfies ExportedHandler<Env>;
