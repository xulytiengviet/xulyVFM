import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  GDAL_CONTAINER: DurableObjectNamespace<GdalContainer>;
  ALLOWED_ORIGIN: string;
  MAX_STREAM_BYTES: string;
}

export class GdalContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "2m";
  enableInternet = false;
}

const POOL_SIZE = 3;
const METHODS = "POST,OPTIONS";
const HEADERS = "Content-Type,X-XulyVFM-Source,X-XulyVFM-Target,X-XulyVFM-Source-CRS,X-XulyVFM-Target-CRS";

function cors(env: Env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": METHODS,
    "Access-Control-Allow-Headers": HEADERS,
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin"
  };
}

function json(body: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin && origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(env) });
    }

    if (url.pathname === "/health") return json({ ok: true }, 200, env);
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
        message: "File vượt ngưỡng stream không lưu. Chế độ R2 tạm không được bật mặc định."
      }, 413, env);
    }

    const source = request.headers.get("X-XulyVFM-Source") || "";
    const target = request.headers.get("X-XulyVFM-Target") || "";
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

    const instance = await getRandom(env.GDAL_CONTAINER, POOL_SIZE);
    const response = await instance.fetch(forwarded);
    const outHeaders = new Headers(response.headers);
    Object.entries(cors(env)).forEach(([k,v]) => outHeaders.set(k,v));
    outHeaders.set("X-Request-ID", reqId);
    outHeaders.set("Cache-Control", "no-store, private");
    return new Response(response.body, { status: response.status, headers: outHeaders });
  }
} satisfies ExportedHandler<Env>;
