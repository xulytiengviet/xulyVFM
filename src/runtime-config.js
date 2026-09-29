let endpoint='';
try{const value=globalThis.XULYVFM_BACKEND_ENDPOINT||'';if(value)endpoint=normalizeEndpoint(value);}catch{}
let accessToken='',connected=false;
export const RUNTIME_CONFIG=Object.freeze({
  get backendEndpoint(){return endpoint;},
  backendMaxBytes:90_000_000
});
export function normalizeEndpoint(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('Nhập URL gốc HTTPS của backend, không kèm token, đường dẫn hoặc tham số.');
  return url.origin;
}
export function backendAvailable(){return connected;}
export function backendHeaders(){return accessToken?{Authorization:'Bearer '+accessToken}:{};}
export function disconnectBackend(){connected=false;accessToken='';}
export async function connectBackend(url,token,fetcher=fetch){
  disconnectBackend();endpoint=normalizeEndpoint(url);
  const candidate=String(token||'').trim();
  if(!candidate)throw new Error('Cần mã truy cập xulyVFM backend. Không dùng Cloudflare API token tại đây.');
  const response=await fetcher(endpoint+'/health',{headers:{Authorization:'Bearer '+candidate},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(response.status===401?'Mã truy cập không hợp lệ.':'Backend chưa sẵn sàng (HTTP '+response.status+').');
  const info=await response.json();
  if(info.service!=='xulyVFM'||info.ok!==true||info.gdal!==true)throw new Error('Endpoint chưa xác nhận GDAL sẵn sàng.');
  accessToken=candidate;connected=true;return info;
}
