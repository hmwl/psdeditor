



















import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';

export const CAP_BITS = { vis: 1, pos: 2, app: 4 };
export const LB_RESOURCE_ID = 4092;
const MAGIC = [0x46, 0x50, 0x6c, 0x62];   


export function serializeLbResource(obj) {
  const js = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(8 + js.length);
  out.set(MAGIC, 0); new DataView(out.buffer).setUint32(4, js.length); out.set(js, 8);
  return out;
}
export function parseLbResource(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 8 || MAGIC.some((m, i) => u8[i] !== m)) return null;
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4);
    return JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
  } catch { return null; }
}



export function compsFromDescriptor(desc) {
  const out = { list: [], lastApplied: null };
  if (!desc) return out;
  const list = Array.isArray(desc.list) ? desc.list : [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const bits = +c.capturedInfo || 0;
    out.list.push({ id: +c.compID || 0, name: String(c['Nm  '] ?? ''), comment: typeof c.comment === 'string' ? c.comment : '',
      cap: { vis: !!(bits & 1), pos: !!(bits & 2), app: !!(bits & 4), sel: false }, states: {}, sel: [] });
  }
  if (Number.isFinite(+desc.lastAppliedComp)) out.lastApplied = +desc.lastAppliedComp;
  return out;
}
export function compsToDescriptor(comps, lastApplied) {
  
  
  const d = { __name: '', __classID: 'CompList', __explicit: { list: true }, list: comps.map(c => {
    const o = { __name: '', __classID: 'Comp', __explicit: { __classID: true }, 'Nm  ': String(c.name || ''), compID: c.id | 0,
      capturedInfo: (c.cap.vis ? 1 : 0) | (c.cap.pos ? 2 : 0) | (c.cap.app ? 4 : 0), __long: { compID: true, capturedInfo: true } };
    if (c.comment) o.comment = String(c.comment);
    return o;
  }) };
  if (lastApplied != null && comps.some(c => c.id === lastApplied)) { d.lastAppliedComp = lastApplied | 0; d.__long = { lastAppliedComp: true }; }
  return d;
}


const pnt = (x, y) => ({ __name: '', __classID: 'Pnt ', Hrzn: +x || 0, Vrtc: +y || 0, __doub: { Hrzn: true, Vrtc: true } });

export function cmlsFromShmd(shmdBytes) {
  const m = parseAdditionalBlock('shmd', shmdBytes, { verify: false });
  const it = m && Array.isArray(m.items) ? m.items.find(x => x.key === 'cmls' && x.kind === 'desc') : null;
  const byComp = new Map();
  if (!it || !it.desc) return byComp;
  for (const s of it.desc.layerSettings || []) {
    const st = {};
    if (typeof s.enab === 'boolean') st.v = s.enab;
    if (s.Ofst && typeof s.Ofst === 'object') { st.dx = +(s.Ofst.Hrzn?.value ?? s.Ofst.Hrzn) || 0; st.dy = +(s.Ofst.Vrtc?.value ?? s.Ofst.Vrtc) || 0; }
    if (s.blendOptions && typeof s.blendOptions === 'object') {
      const mode = s.blendOptions['Md  '];
      const opacity = s.blendOptions.Opct;
      st.app = { ...(mode?.value ? { mode: mode.value } : {}), ...(opacity != null ? { opacity: +(opacity.value ?? opacity) } : {}) };
    }
    if (s.Lefx) st.app = { ...(st.app || {}), effects: s.Lefx };
    if (s.vectorMask?.Ofst) st.vectorOffset = {
      x: +(s.vectorMask.Ofst.Hrzn?.value ?? s.vectorMask.Ofst.Hrzn) || 0,
      y: +(s.vectorMask.Ofst.Vrtc?.value ?? s.vectorMask.Ofst.Vrtc) || 0,
    };
    for (const id of s.compList || []) byComp.set(+id, st);
  }
  return byComp;
}




export function buildCmlsDesc(layerId, entries) {
  if (!entries.length) return null;
  const groups = new Map();
  for (const e of entries) {
    const k = `${e.v === undefined ? '-' : e.v ? 1 : 0}|${e.dx == null ? '-' : Math.round(e.dx * 1000) / 1000}|${e.dy == null ? '-' : Math.round(e.dy * 1000) / 1000}`;
    if (!groups.has(k)) groups.set(k, { e, ids: [] });
    groups.get(k).ids.push(e.compId | 0);
  }
  const layerSettings = [...groups.values()].map(({ e, ids }) => {
    const s = { __name: '', __classID: 'null' };
    if (e.v !== undefined) s.enab = !!e.v;
    if (e.dx != null || e.dy != null) { s.Ofst = pnt(e.dx || 0, e.dy || 0); s.FXRefPoint = pnt(0, 0); }
    s.compList = ids; ids.__long = Object.fromEntries(ids.map((_, i) => [i, true]));   
    return s;
  });
  return { __name: '', __classID: 'null', LyrI: layerId >>> 0, layerSettings };
}

export function shmdWithCmls(shmdBytes, cmlsDesc) {
  let m = shmdBytes && shmdBytes.length ? parseAdditionalBlock('shmd', shmdBytes, { verify: false }) : { items: [] };
  if (!m || !Array.isArray(m.items)) m = { items: [] };           
  const items = m.items.filter(x => x.key !== 'cmls');
  if (cmlsDesc) {
    
    const body = { sig: '8BIM', key: 'cmls', copyOnSheet: false, reserved: new Uint8Array(3), kind: 'desc', descVersion: 16, desc: cmlsDesc, _tail: null };
    const probe = writeAdditionalBlock('shmd', { items: [body] });
    const len = new DataView(probe.buffer, probe.byteOffset).getUint32(4 + 16);
    if (len % 4) body._tail = new Uint8Array(4 - (len % 4));
    items.push(body);
  }
  if (!items.length) return null;
  return writeAdditionalBlock('shmd', { ...m, items, _tail: m._tail });
}




export function createCompOps(h) {
  const setLayerCompsMeta = {
    validate(state, op, i) {
      if (!Array.isArray(op.entries)) throw h.opFail(i, op, 'entries 必须是数组');
      for (const e of op.entries) h.needLayer(state, i, op, e.index);
      return { affected: op.entries.map(e => e.index), note: '写图层复合（shmd/cmls）' };
    },
    apply(ab, state, op) {
      let out = h.copyAB(ab);
      for (const e of op.entries) {
        const old = h.readLayerBlock(out, e.index, 'shmd');
        const nb = shmdWithCmls(old ? old.slice() : null, e.cmls || null);
        if (!old && !nb) continue;
        out = h.upsertLayerBlock(out, e.index, 'shmd', nb);
      }
      return { buffer: out, result: { changed: true } };
    },
    structural: true,
  };
  return { setLayerCompsMeta };
}
