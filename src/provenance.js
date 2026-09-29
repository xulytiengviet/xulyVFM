// Portable signed envelope: the signature binds exact output bytes and metadata.
const te = new TextEncoder(), td = new TextDecoder();
const MAX_BYTES = 90_000_000;
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
function b64(bytes) {
  let s=''; for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(s);
}
function un64(s) {
  if(typeof s!=='string'||s.length>Math.ceil(MAX_BYTES/3)*4+16||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw new Error('Base64 không hợp lệ hoặc quá lớn.');
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
async function digest(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function publicOnly(jwk) {
  if(jwk?.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string')throw new Error('Khóa công khai P-256 không hợp lệ.');
  return {kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
}
export async function fingerprint(jwk) {return digest(te.encode(canonical(publicOnly(jwk))));}
export async function createIdentity() {
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  return {privateKey:pair.privateKey,publicJwk:publicOnly(await crypto.subtle.exportKey('jwk',pair.publicKey))};
}
async function passwordKey(password,salt,usage) {
  const material=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usage);
}
export async function exportIdentity(identity,password) {
  if(password.length<12)throw new Error('Mật khẩu bảo vệ khóa cần ít nhất 12 ký tự.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await passwordKey(password,salt,['encrypt']);
  const privateBytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',identity.privateKey));
  try {
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:te.encode('xulyVFM.Key/1')},key,privateBytes);
    return te.encode(JSON.stringify({type:'xulyVFM.Key/1',kdf:'PBKDF2-SHA256',iterations:600000,salt:b64(salt),iv:b64(iv),encrypted:b64(new Uint8Array(encrypted))}));
  } finally {privateBytes.fill(0);}
}
export async function importIdentity(bytes,password) {
  if(bytes.byteLength>16384)throw new Error('File khóa quá lớn.');
  const o=JSON.parse(td.decode(bytes));
  if(o.type!=='xulyVFM.Key/1'||o.iterations!==600000||o.kdf!=='PBKDF2-SHA256')throw new Error('Định dạng khóa không hỗ trợ.');
  const salt=un64(o.salt),iv=un64(o.iv);
  if(salt.length!==16||iv.length!==12)throw new Error('Thông số khóa không hợp lệ.');
  const key=await passwordKey(password,salt,['decrypt']);
  const raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:te.encode('xulyVFM.Key/1')},key,un64(o.encrypted)));
  try {
    const privateKey=await crypto.subtle.importKey('pkcs8',raw,{name:'ECDSA',namedCurve:'P-256'},true,['sign']);
    const publicJwk=publicOnly(await crypto.subtle.exportKey('jwk',privateKey));
    return {privateKey,publicJwk};
  } finally {raw.fill(0);}
}
export async function signOutput(bytes,{fileName,mime='application/octet-stream',owner,identity}) {
  if(!(bytes instanceof Uint8Array)||bytes.length>MAX_BYTES)throw new Error('Gói ký tối đa 90 MB dữ liệu.');
  if(!owner?.trim()||!identity?.privateKey)throw new Error('Nhập tên người ký và nạp khóa ký.');
  const manifest={type:'xulyVFM.Signed/1',algorithm:'ECDSA-P256-SHA256',fileName,mime,owner:owner.trim(),createdAt:new Date().toISOString(),byteLength:bytes.length,sha256:await digest(bytes),publicKey:publicOnly(identity.publicJwk),keyFingerprint:await fingerprint(identity.publicJwk)};
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,te.encode(canonical(manifest)));
  return te.encode(JSON.stringify({manifest,signature:b64(new Uint8Array(signature)),data:b64(bytes)}));
}
export async function verifyOutput(bytes,expectedFingerprint='') {
  if(bytes.byteLength>125_000_000)throw new Error('Gói ký quá lớn.');
  const o=JSON.parse(td.decode(bytes)),m=o.manifest;
  if(m?.type!=='xulyVFM.Signed/1'||m.algorithm!=='ECDSA-P256-SHA256')throw new Error('Không phải gói ký VFM được hỗ trợ.');
  if(typeof m.fileName!=='string'||!m.fileName||/[\\/\x00-\x1f]/.test(m.fileName)||typeof m.owner!=='string')throw new Error('Metadata gói ký không hợp lệ.');
  const data=un64(o.data);
  if(data.length!==m.byteLength||await digest(data)!==m.sha256)throw new Error('Nội dung đã thay đổi: SHA-256 không khớp.');
  const fp=await fingerprint(m.publicKey);
  if(fp!==m.keyFingerprint)throw new Error('Dấu vân tay khóa không khớp.');
  const pub=await crypto.subtle.importKey('jwk',publicOnly(m.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,un64(o.signature),te.encode(canonical(m))))throw new Error('Chữ ký không hợp lệ.');
  const expected=expectedFingerprint.trim().toLowerCase();
  if(expected && (!/^[a-f0-9]{64}$/.test(expected)||expected!==fp))throw new Error('Khóa người ký không khớp khóa tin cậy đã nhập.');
  return {data,manifest:m,trusted:!!expected,fingerprint:fp};
}
