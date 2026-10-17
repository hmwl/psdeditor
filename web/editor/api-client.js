










import {
  buildIncrementalRequest, applyIncrementalResponse,
} from '../../core/psd-parse.js';

const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

export function fragmentToJSON(f) {
  return { layerName: f.layerName, bounds: f.bounds, kind: f.kind, psb: !!f.psb,
           blocks: f.blocks.map(b => ({ key: b.key, data: b64(b.data) })) };
}


function incrementalRequestToJSON(req) {
  return {
    doc: req.doc,
    fragments: req.fragments.map(f => ({
      id: f.id, kind: f.kind, layerIndex: f.layerIndex, offset: f.offset, length: f.length,
      checksum: f.checksum, layerName: f.layerName, bounds: f.bounds, meta: f.meta,
      ...(f.blocks
        ? { blocks: f.blocks.map(b => ({ key: b.key, occurrence: b.occurrence, offset: b.offset, length: b.length, data: b64(b.data) })) }
        : { data: b64(f.data) }),
    })),
    ops: req.ops,
  };
}

function incrementalResponseFromJSON(res) {
  return {
    sideEffects: res.sideEffects || [],
    fragments: (res.fragments || []).map(f => ({
      ...f,
      ...(f.blocks ? { blocks: f.blocks.map(b => ({ ...b, data: unb64(b.data) })) } : { data: unb64(f.data) }),
    })),
  };
}

export function createApiClient(base = 'api') {
  let session = null;      
  let pending = null;

  


  let preflight = (() => { const p = globalThis.__psd_editorPreflight; globalThis.__psd_editorPreflight = null; return p || null; })();
  async function takePreflight() {
    if (!preflight) return null;
    let v = null;
    try { v = await preflight; } catch { v = null; }
    if (!v || v.error) { preflight = null; return null; }
    return v;
  }

  async function openSession() {
    if (pending) return pending;
    pending = (async () => {
      const pre = await takePreflight();
      if (pre && pre.session) {
        session = pre.session;
        pre.session = null;                 
        pending = null;
        return session;
      }
      const r = await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error(await errorOf(r, '无法建立会话'));
      session = await r.json();
      pending = null;
      return session;
    })().catch(e => { pending = null; throw e; });
    return pending;
  }
  async function errorOf(r, fallback) {
    try { const j = await r.json(); return j.error || fallback; } catch { return `${fallback}（HTTP ${r.status}）`; }
  }
  async function call(path, init = {}, retry = true) {
    if (!session) await openSession();
    const headers = { ...(init.headers || {}), Authorization: 'Bearer ' + session.token };
    const r = await fetch(base + path, { ...init, headers });
    if (r.status === 401 && retry) { session = null; return call(path, init, false); }
    return r;
  }
  async function json(path, body) {
    const r = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await errorOf(r, '请求失败'));
    return r.json();
  }

  
  function engineKeyBytes() {
    const k = session.engineKey.replace(/-/g, '+').replace(/_/g, '/');
    return unb64(k.padEnd(Math.ceil(k.length / 4) * 4, '='));
  }

  return {
    get session() { return session; },
    openSession,
    call,
    
    async resolveAll(fragments) {
      if (!fragments.length) return [];
      const j = await json('/so/resolve', { items: fragments.map(fragmentToJSON) });
      return j.items;
    },
    
    async writeback(fragment, edit) {
      const j = await json('/so/writeback', { fragment: fragmentToJSON(fragment), edit });
      return { mode: j.mode, blocks: j.blocks.map(b => ({ key: b.key, data: unb64(b.data) })) };
    },
    










    async incrementalEdit(psdBytes, ops) {
      const req = buildIncrementalRequest(psdBytes, ops);
      const payload = incrementalRequestToJSON(req);
      const upBytes = JSON.stringify(payload).length;
      const r = await call('/doc/edit/incremental', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const e = new Error(j.error || `增量编辑失败（HTTP ${r.status}）`);
        if (j.need) e.need = j.need;          
        if (j.opIndex !== undefined) e.opIndex = j.opIndex;
        throw e;
      }
      const res = await r.json();
      const text = JSON.stringify(res);
      const { buffer } = applyIncrementalResponse(psdBytes, incrementalResponseFromJSON(res));
      return {
        bytes: buffer, ops: res.ops || [], warnings: res.warnings || [],
        transfer: { up: upBytes, down: text.length, docBytes: req.doc.bytes },
      };
    },
    async profiles() {
      const r = await call('/profiles');
      if (!r.ok) throw new Error(await errorOf(r, '无法获取 ICC 列表'));
      return r.json();
    },
    
    async render(psdBytes, spec) {
      const fd = new FormData();
      fd.append('psd', new File([psdBytes], 'doc.psd', { type: 'image/vnd.adobe.photoshop' }));
      fd.append('spec', JSON.stringify(spec));
      const r = await call('/render', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await errorOf(r, '服务端渲染失败'));
      return r.blob();
    },
    
    async engineBundle() {
      if (!session) await openSession();
      const pre = await takePreflight();
      
      if (pre && pre.engine && pre.sid === session.sid) {
        const bytes = pre.engine;
        pre.engine = null;
        preflight = null;
        return { bytes, key: engineKeyBytes(), sid: session.sid };
      }
      const r = await call('/engine');
      if (!r.ok) throw new Error(await errorOf(r, '无法获取引擎'));
      return { bytes: new Uint8Array(await r.arrayBuffer()), key: engineKeyBytes(), sid: session.sid };
    }
  };
}
