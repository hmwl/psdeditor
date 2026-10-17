










export class Chunks {
  constructor(parts) { this.parts = parts; let n = 0; for (const p of parts) n += p.length; this.length = n; }
}
export const vconcat = parts => new Chunks(parts);
export function padChunks(x, align) { const r = x.length % align; return r ? new Chunks([x, new Uint8Array(align - r)]) : x; }
function each(x, fn) { if (x instanceof Chunks) { for (const p of x.parts) each(p, fn); } else fn(x); }
export function flatten(x) {
  if (!(x instanceof Chunks)) return x;
  const out = new Uint8Array(x.length);
  let o = 0; each(x, p => { out.set(p, o); o += p.length; });
  return out;
}
export default { Chunks, vconcat, padChunks, flatten };
