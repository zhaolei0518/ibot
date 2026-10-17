import {
  ProxyError,
  apiBaseUrl,
  checkRequestOrigin,
  errorResponse,
  forwardRequestHeaders,
  forwardResponseHeaders,
  loadApiToken,
  upstreamUrl,
} from "../../../lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const refusal = checkRequestOrigin({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
  if (refusal) return errorResponse(403, "forbidden", refusal);

  const { path } = await context.params;
  let target: string;
  let token: string;
  try {
    target = upstreamUrl(apiBaseUrl(), path, new URL(request.url).search);
    token = await loadApiToken();
  } catch (error) {
    if (error instanceof ProxyError) {
      if (error.status >= 500) console.error(`[web proxy] ${error.message}`);
      return errorResponse(error.status, error.code, error.message);
    }
    throw error;
  }
  const connectorWrite = path[0] === "connectors" && request.method !== "GET" && request.method !== "HEAD";
  const suppliedId = request.headers.get("x-connector-request-id") ?? "";
  const connectorRequestId = /^[a-f0-9-]{36}$/.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const started = Date.now();
  const trace = (outcome: string) => {
    if (connectorWrite) console.info(JSON.stringify({ event: "connector_request", request_id: connectorRequestId, method: request.method, path: `/api/${path.map(encodeURIComponent).join("/")}`, outcome, duration_ms: Date.now() - started }));
  };
  trace("received");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: forwardRequestHeaders(request.headers, token),
      body: hasBody ? await request.arrayBuffer() : undefined,
      // Closing the browser tab aborts the request, which ends an SSE stream upstream too.
      signal: request.signal,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (error) {
    trace(request.signal.aborted ? "browser_aborted" : "upstream_failed");
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const reason = (error as Error & { cause?: { code?: string } }).cause?.code ?? (error as Error).message;
    console.error(`[web proxy] ${request.method} ${target} failed: ${reason}`);
    return errorResponse(502, "api_unreachable", `the control plane API at ${apiBaseUrl()} did not answer (${reason})`);
  }

  trace(`upstream_${upstream.status}`);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardResponseHeaders(upstream.headers),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
