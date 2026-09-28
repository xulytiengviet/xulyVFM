const te = new TextEncoder();
const td = new TextDecoder();

function readLen(bytes, state, ai) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ai < 24) return ai;
  if (ai === 24) return bytes[state.i++];
  if (ai === 25) { const v=dv.getUint16(state.i,false); state.i+=2; return v; }
  if (ai === 26) { const v=dv.getUint32(state.i,false); state.i+=4; return v; }
  if (ai === 27) {
    const v=dv.getBigUint64(state.i,false); state.i+=8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR integer vượt Number.MAX_SAFE_INTEGER");
    return Number(v);
  }
  throw new Error("CBOR indefinite-length không được hỗ trợ trong deterministic VFM");
}

export function decodeCBOR(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const s = { i: 0 };
  function item() {
    if (s.i >= bytes.length) throw new Error("CBOR bị cắt");
    const b = bytes[s.i++], major=b>>5, ai=b&31;
    const n = readLen(bytes,s,ai);
    if (major===0) return n;
    if (major===1) return -1-n;
    if (major===2) { const v=bytes.slice(s.i,s.i+n); s.i+=n; return v; }
    if (major===3) { const v=td.decode(bytes.slice(s.i,s.i+n)); s.i+=n; return v; }
    if (major===4) return Array.from({length:n},()=>item());
    if (major===5) {
      const m = new Map();
      for(let j=0;j<n;j++) m.set(item(), item());
      return m;
    }
    if (major===7 && ai===20) return false;
    if (major===7 && ai===21) return true;
    if (major===7 && ai===22) return null;
    throw new Error("CBOR major type chưa hỗ trợ: "+major);
  }
  const out=item();
  if(s.i!==bytes.length) throw new Error("CBOR còn dữ liệu thừa");
  return out;
}

function head(major,n){
  if(n<24) return Uint8Array.of((major<<5)|n);
  if(n<=0xff) return Uint8Array.of((major<<5)|24,n);
  if(n<=0xffff){const a=new Uint8Array(3);a[0]=(major<<5)|25;new DataView(a.buffer).setUint16(1,n,false);return a;}
  if(n<=0xffffffff){const a=new Uint8Array(5);a[0]=(major<<5)|26;new DataView(a.buffer).setUint32(1,n,false);return a;}
  const a=new Uint8Array(9);a[0]=(major<<5)|27;new DataView(a.buffer).setBigUint64(1,BigInt(n),false);return a;
}
function cat(parts){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let k=0;for(const p of parts){o.set(p,k);k+=p.length;}return o;}
export const cbor = {
  uint(n){return head(0,n);},
  bytes(v){v=v instanceof Uint8Array?v:new Uint8Array(v);return cat([head(2,v.length),v]);},
  text(v){const b=te.encode(v);return cat([head(3,b.length),b]);},
  array(items){return cat([head(4,items.length),...items]);},
  mapInt(entries){
    const sorted=[...entries].sort((a,b)=>a[0]-b[0]);
    return cat([head(5,sorted.length),...sorted.flatMap(([k,v])=>[head(0,k),v])]);
  }
};
