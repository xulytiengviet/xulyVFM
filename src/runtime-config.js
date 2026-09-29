export const RUNTIME_CONFIG=Object.freeze({
  backendEndpoint:(globalThis.XULYVFM_BACKEND_ENDPOINT||"").replace(/\/$/,""),
  backendMaxBytes:90_000_000
});

export function backendAvailable(){
  return /^https:\/\//i.test(RUNTIME_CONFIG.backendEndpoint);
}
