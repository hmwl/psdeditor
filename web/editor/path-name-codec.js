







let enc = null;
function gbkTable(){
  if (enc) return enc;
  enc = new Map();
  let dec;
  try { dec = new TextDecoder('gbk'); } catch { return enc; }
  const pair = new Uint8Array(2);
  for (let a = 0x81; a <= 0xfe; a++) for (let b = 0x40; b <= 0xfe; b++) {
    if (b === 0x7f) continue;
    pair[0] = a; pair[1] = b;
    const s = dec.decode(pair);
    if (s.length === 1 && s !== '�' && !enc.has(s)) enc.set(s, [a, b]);
  }
  return enc;
}

export function encodePathName(name){
  const str = String(name || '');
  if (/^[\x00-\xff]*$/.test(str)) return str.slice(0, 255);
  const T = gbkTable(); if (!T.size) return null;
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out += ch; continue; }
    const p = T.get(ch); if (!p) return null;
    out += String.fromCharCode(p[0], p[1]);
  }
  return out.length <= 255 ? out : null;
}

export function decodePathName(raw){
  const s = String(raw || '');
  if (!/[\x80-\xff]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, ch => ch.charCodeAt(0) & 255);
    const t = new TextDecoder('gbk', { fatal: true }).decode(bytes);
    if (/[⺀-鿿豈-﫿＀-￯]/.test(t)) return t;
  } catch {}
  return s;
}
