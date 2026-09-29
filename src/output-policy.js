// Output transformations are explicit and never mutate the imported dataset.
export const OUTPUT_MODES = ['normal', 'cvnss', 'signed'];
const LITERAL_FIELDS = /^(id|fid|uuid|guid|url|uri|href|styleurl|email|phone|telephone|code|ma|ma_.*)$/i;
function mapText(value, key, convert) {
  if (typeof value === 'string') {
    if (!value.trim() || LITERAL_FIELDS.test(key) || /^(?:https?:|mailto:|tel:|urn:|#)/i.test(value)) return value;
    const result = convert(value);
    if (typeof result !== 'string' || !result.trim()) throw new Error('CVNSS4.0 không chuyển được trường: '+key);
    return result;
  }
  if (Array.isArray(value)) return value.map(v => mapText(v, key, convert));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,mapText(v,k,convert)]));
  return value;
}
export function applyOutputPolicy(payload, mode, selectedFields = null) {
  if (!OUTPUT_MODES.includes(mode)) throw new Error('Chế độ đầu ra không hợp lệ.');
  const out = structuredClone(payload);
  const converter = globalThis.CVNSSConverter;
  if (mode === 'cvnss' && !converter?.fromCqn) throw new Error('Chưa nạp bộ chuyển CVNSS4.0.');
  for (const f of out.features || []) {
    delete f.cv4;
    if (mode === 'cvnss') {
      f.properties = Object.fromEntries(Object.entries(f.properties || {}).map(([k,v]) => [k,
        selectedFields === null || selectedFields.includes(k) ? mapText(v,k,s=>converter.fromCqn(s).cvss) : v
      ]));
    }
  }
  out.textEncoding = mode === 'cvnss' ? 'CVNSS4.0-selected-fields' : 'Unicode';
  return out;
}
