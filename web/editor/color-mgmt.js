











import { parseIcc, sRGBProfile, displayP3Profile, macRgbProfile, romRgbProfile, wideRgb1998Profile, grayProfile, labProfile, loadGenericCmykProfile, profileInfo, INTENT_NAMES, xyzToLab } from '../../core/icc.js';
import { buildTransform, compileTransform, makeCodec, setModeCodec, gamutChecker, setFloatPreview, getFloatPreview } from '../../core/color-convert.js';
import { convertDocument, readEmbeddedProfile, setEmbeddedProfile, normalizeHighDepthLayers, readDuotoneData, duotoneToRgb, readIndexedPalette, setIndexedPalette, trapDocument, MODE_KEY, MODE_LABEL, DEFAULT_CURVE } from '../../core/doc-mode.js';
import { parseLut, applyLutRGBA, sampleToLut, writeCube, write3dl, writeCsp, writeIccLink, lutEvaluator, LUT_EXTS } from '../../core/lut.js';
import { parsePsdDocument } from '../../core/psd-document.js';
import { decodeCompositeImage } from '../../core/psd-image.js';
import { getModeCodec } from '../../core/color-convert.js';
import { choiceDialog, confirmDialog, alertDialog } from './dialog.js';
import { identifyProfile, profileIdentity } from './icc-identity.js';


const LS_KEY = 'psd_editor:color-settings';
const DEFAULTS = {
  rgb: 'srgb', cmyk: 'psd_editor-cmyk', gray: 'dotgain20',
  policyRgb: 'preserve', policyCmyk: 'preserve', policyGray: 'preserve',
  askMismatchOpen: false, askMissing: false,
  intent: 0, bpc: true, dither: true,
  proofTarget: 'cmyk', proofCustom: { profile: 'psd_editor-cmyk', preserve: false, intent: 1, bpc: true, paper: false, ink: false },
  gamutColor: [128, 128, 128],
};
function loadSettings() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return { ...DEFAULTS, ...(j || {}), proofCustom: { ...DEFAULTS.proofCustom, ...((j && j.proofCustom) || {}) } }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(S) { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} }



const BUILTIN = [
  { id: 'srgb', space: 'RGB', name: 'sRGB IEC61966-2.1', get: async () => sRGBProfile() },
  { id: 'p3', space: 'RGB', name: 'Display P3', get: async () => displayP3Profile() },
  { id: 'w98', space: 'RGB', name: '宽色域 RGB（1998 原色，Gamma 2.2）', get: async () => wideRgb1998Profile() },
  { id: 'romm', space: 'RGB', name: 'ROMM RGB（ProPhoto 原色）', get: async () => romRgbProfile() },
  { id: 'mac', space: 'RGB', name: '旧版 Macintosh RGB (Gamma 1.8)', get: async () => macRgbProfile() },
  { id: 'psd_editor-cmyk', space: 'CMYK', name: '通用 CMYK（PSD Editor 铜版纸，300%）', get: () => loadGenericCmykProfile() },
  ...[10, 15, 20, 25, 30].map(d => ({ id: 'dotgain' + d, space: 'GRAY', name: `Dot Gain ${d}%`, get: async () => grayProfile({ dotGain: d }) })),
  { id: 'gamma18', space: 'GRAY', name: 'Gray Gamma 1.8', get: async () => grayProfile({ gamma: 1.8 }) },
  { id: 'gamma22', space: 'GRAY', name: 'Gray Gamma 2.2', get: async () => grayProfile({ gamma: 2.2 }) },
];
const IDB = { db: null };
function idb() {
  if (IDB.db) return IDB.db;
  IDB.db = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('psd_editor-color', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('icc')) d.createObjectStore('icc', { keyPath: 'id' }); if (!d.objectStoreNames.contains('luts')) d.createObjectStore('luts', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return IDB.db;
}
async function idbAll(store) { try { const d = await idb(); return await new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); } catch { return []; } }
async function idbPut(store, v) { try { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(v); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {} }

const spaceOf = P => P.colorSpace === 'RGB ' ? 'RGB' : P.colorSpace === 'CMYK' ? 'CMYK' : P.colorSpace === 'GRAY' ? 'GRAY' : P.colorSpace.trim();





function cmDialog(title, fields, opts = {}) {
  const stub = typeof window !== 'undefined' && window.__fpDialog;
  if (stub) return Promise.resolve(stub({ form: true, title, fields, ...opts }));
  return new Promise(resolve => {
    const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    const d = mk('dialog', { className: 'fp-dlg fp-form' });
    d.style.width = opts.width || 'min(460px, 92vw)';
    const vals = Object.fromEntries(fields.filter(f => f.key).map(f => [f.key, f.value]));
    const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
    form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }));
    if (opts.msg) form.append(mk('div', { className: 'fp-dlg-msg', textContent: opts.msg }));
    const body = mk('div', { style: 'display:flex;flex-direction:column;gap:7px;max-height:64vh;overflow:auto' });
    const rows = [], els = {};
    const sync = () => { for (const [f, row] of rows) if (f.showIf) row.hidden = !f.showIf(vals); };
    const changed = () => { sync(); if (opts.onChange) try { opts.onChange({ ...vals }, api); } catch {} };
    const api = {
      set(k, v) { vals[k] = v; const el = els[k]; if (el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } sync(); },
      setOptions(k, options, v) { const el = els[k]; if (!el) return; el.innerHTML = ''; for (const [ov, lab] of options) el.append(mk('option', { value: ov, textContent: lab })); if (v != null) { el.value = v; vals[k] = v; } },
      vals, body, mk,
    };
    for (const f of fields) {
      const row = mk('label', { className: 'fp-form-row', style: 'display:flex;align-items:center;gap:8px;font-size:12px' });
      if (f.type === 'heading') { row.append(mk('div', { textContent: f.label, style: 'font-weight:600;margin-top:4px;border-bottom:1px solid var(--ps-line,#444);flex:1;padding-bottom:2px' })); }
      else if (f.type === 'note') row.append(mk('div', { className: 'anote plain', textContent: f.label, style: 'flex:1;opacity:.75;white-space:pre-wrap' }));
      else if (f.type === 'custom') { f.render(row, vals, api); }
      else if (f.type === 'button') {
        row.append(mk('span', { style: 'width:120px;flex:none' }));
        const b = mk('button', { type: 'button', textContent: f.label }); b.onclick = () => f.onClick(vals, api); row.append(b);
      } else {
        row.append(mk('span', { textContent: f.label, style: 'width:120px;flex:none;opacity:.85' }));
        let el;
        if (f.type === 'select') {
          el = mk('select', { style: 'flex:1;min-width:0' });
          for (const [v, lab] of f.options) el.append(mk('option', { value: v, textContent: lab }));
          el.value = f.value; el.onchange = () => { vals[f.key] = el.value; changed(); };
        } else if (f.type === 'check') { el = mk('input', { type: 'checkbox', checked: !!f.value }); el.onchange = () => { vals[f.key] = el.checked; changed(); }; }
        else if (f.type === 'color') { el = mk('input', { type: 'color', value: f.value || '#000000' }); el.oninput = () => { vals[f.key] = el.value; changed(); }; }
        else if (f.type === 'text') { el = mk('input', { type: 'text', value: f.value ?? '', style: 'flex:1' }); el.oninput = () => { vals[f.key] = el.value; changed(); }; }
        else {
          el = mk('input', { type: 'number', value: f.value, min: f.min ?? '', max: f.max ?? '', step: f.step ?? 1, style: 'width:90px' });
          el.onchange = () => { let v = +el.value; if (!Number.isFinite(v)) v = f.value; if (f.min != null) v = Math.max(f.min, v); if (f.max != null) v = Math.min(f.max, v); el.value = v; vals[f.key] = v; changed(); };
        }
        els[f.key] = el; row.append(el);
        if (f.unit) row.append(mk('span', { textContent: f.unit, style: 'opacity:.7' }));
      }
      body.append(row); rows.push([f, row]);
    }
    form.append(body);
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: opts.cancelText || '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: opts.okText || '确定' });
    btns.append(cancel, ok); form.append(btns); d.append(form);
    document.body.appendChild(d);
    let done = false;
    const finish = v => { if (done) return; done = true; try { d.close(); } catch {} d.remove(); if (opts.onClose) try { opts.onClose(v); } catch {} resolve(v); };
    ok.onclick = () => finish({ ...vals });
    cancel.onclick = () => finish(null);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    sync();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
  });
}
function pickFile(accept) {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
    inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return res(null); res({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
    inp.click();
  });
}
function download(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}


export function installColorMgmt(host) {
  const S = loadSettings();
  const lib = new Map(BUILTIN.map(b => [b.id, { ...b }]));
  const cacheP = new Map();
  let userLoaded = false;
  async function loadUser() {
    if (userLoaded) return; userLoaded = true;
    for (const r of await idbAll('icc')) {
      try { const P = parseIcc(r.bytes); lib.set(r.id, { id: r.id, space: spaceOf(P), name: P.name + '（已导入）', get: async () => P, user: true }); } catch {}
    }
  }
  async function getProfile(id) {
    if (!id) return null;
    if (cacheP.has(id)) return cacheP.get(id);
    await loadUser();
    const e = lib.get(id); if (!e) return null;
    const P = await identifyProfile(await e.get()); cacheP.set(id, P); return P;
  }
  async function importIcc() {
    const f = await pickFile('.icc,.icm'); if (!f) return null;
    let P; try { P = parseIcc(f.bytes); } catch (e) { host.err('这个文件不是可用的 ICC 配置文件：' + e.message); return null; }
    await identifyProfile(P);
    const id = 'user:' + profileIdentity(P);
    await idbPut('icc', { id, name: P.name, bytes: f.bytes });
    lib.set(id, { id, space: spaceOf(P), name: P.name + '（已导入）', get: async () => P, user: true });
    cacheP.set(id, P);
    host.status(`已载入配置文件「${P.name}」（${spaceOf(P)}，${P.kind === 'matrix' ? '矩阵/TRC' : P.kind === 'lut' ? '查找表' : P.kind}，v${P.version}）`);
    return id;
  }
  const optionsFor = space => [...lib.values()].filter(e => e.space === space).map(e => [e.id, e.name]);

  
  const st = { profile: null, profileId: null, source: 'none', mode: 3, depth: 8, proofOn: false, gamut: false, gamutFn: null, displayFn: null, displayKey: '', duotone: null };
  const workingFor = mode => mode === 4 ? S.cmyk : (mode === 1 || mode === 8) ? S.gray : (mode === 9 || mode === 0 || mode === 7) ? null : S.rgb;

  
  async function prepareDocument(buf, o = {}) {
    let out = buf;
    if (!o.resync) try { out = normalizeHighDepthLayers(buf); } catch {}
    const u8 = out instanceof ArrayBuffer
      ? new Uint8Array(out)
      : new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    st.mode = dv.getUint16(24); st.depth = dv.getUint16(22);
    let emb = null; try { emb = readEmbeddedProfile(out); } catch {}
    let P = null, source = 'working';
    const policy = st.mode === 4 ? S.policyCmyk : (st.mode === 1 || st.mode === 8) ? S.policyGray : S.policyRgb;
    if (emb && policy !== 'off') { try { P = await identifyProfile(parseIcc(emb)); source = 'embedded'; } catch { P = null; } }
    if (!P && workingFor(st.mode)) { P = await getProfile(workingFor(st.mode)); source = emb && policy === 'off' ? 'off' : 'working'; }
    if (P && ((st.mode === 4 && P.colorSpace !== 'CMYK') || (st.mode === 3 && P.colorSpace !== 'RGB ') || ((st.mode === 1 || st.mode === 8) && P.colorSpace !== 'GRAY'))) { P = await getProfile(workingFor(st.mode)); source = 'working'; }
    
    if (!o.resync && source === 'embedded' && policy === 'convert' && P && st.mode !== 9) {
      const W = await getProfile(workingFor(st.mode));
      if (W && profileIdentity(W) !== profileIdentity(P) && W.colorSpace === P.colorSpace) {
        try { out = convertDocument(out, { mode: MODE_KEY[st.mode] }, { srcProfile: P, dstProfile: W, intent: S.intent, bpc: S.bpc }).buffer; host.status(`已按色彩管理方案把「${P.name}」转换为工作空间「${W.name}」`); P = W; }
        catch (e) { console.warn('打开时转换到工作空间失败', e); }
      }
    }
    st.profile = P; st.source = source;
    
    setModeCodec(4, null); setModeCodec(9, null); setModeCodec(8, null);
    try {
      if (st.mode === 4 && P) setModeCodec(4, makeCodec(P, { intent: S.intent, bpc: S.bpc }));
      if (st.mode === 9) setModeCodec(9, makeCodec(labProfile(), { intent: 1 }));
      if (st.mode === 8) {
        const doc = parsePsdDocument(u8);
        const duo = readDuotoneData((doc.colorModeData && doc.colorModeData._raw) || new Uint8Array(0));
        st.duotone = duo;
        if (duo) { const fn = duotoneToRgb(duo.inks), o = [0, 0, 0]; setModeCodec(8, { toRgb8(pl, i, out3) { fn((pl[0] ? pl[0][i] : 0) / 255, o); out3[0] = Math.round(o[0] * 255); out3[1] = Math.round(o[1] * 255); out3[2] = Math.round(o[2] * 255); return out3; }, fromRgb8(r, g, b, out1) { out1[0] = Math.round(0.299 * r + 0.587 * g + 0.114 * b); return out1; } }); }
      }
    } catch (e) { console.warn('色彩管理：编解码器建立失败', e); }
    st.displayKey = ''; st.gamutFn = null;
    if (!o.resync && source === 'embedded' && S.askMismatchOpen && P && policy !== 'convert') {
      const w = await getProfile(workingFor(st.mode));
      const key = profileIdentity(P) + '|' + (host.docName() || '');
      if (w && profileIdentity(w) !== profileIdentity(P) && st.askedKey !== key) { st.askedKey = key; setTimeout(() => mismatchPrompt(P, w), 50); }   
    }
    return out;
  }
  async function mismatchPrompt(P, w) {
    const r = await choiceDialog(`文档有嵌入的颜色配置文件「${P.name}」，与当前的工作空间「${w.name}」不匹配。\n要怎么处理？`, { title: '嵌入的配置文件不匹配', okText: '使用嵌入的配置文件', extraText: '转换为工作空间', cancelText: '扔掉嵌入的配置文件' });
    if (r === 'extra') await convertToProfile(w, S.intent, S.bpc, '转换为工作空间');
    else if (r === 'cancel') await assignProfile(null, '扔掉嵌入的配置文件');
  }

  
  function displayKey() { return [st.mode, profileIdentity(st.profile), S.intent, S.bpc, S.rgb, S.cmyk, S.gray, st.proofOn && S.proofTarget, st.proofOn && S.proofTarget === 'custom' && JSON.stringify(S.proofCustom), st.gamut, S.gamutColor.join(), S.gamutOpacity || 100].join('|'); }
  
  const canvasSpace = () => (st.mode === 3 && st.profile && st.profile.colorSpace === 'RGB ') ? st.profile : sRGBProfile();
  let pending = null;
  async function rebuildDisplay() {
    const src = await identifyProfile(canvasSpace()), disp = await identifyProfile(sRGBProfile());
    const key = displayKey(); if (key === st.displayKey) return;
    const identitySrc = profileIdentity(src) === profileIdentity(disp);
    let fn = null;
    if (st.proofOn) {
      const t = S.proofTarget;
      if (t === 'monitor') fn = null;                                       
      else if (t === 'srgb') fn = identitySrc ? null : compileTransform(buildTransform(src, disp, { intent: S.intent, bpc: S.bpc }));
      else if (t === 'macRgb') { const P = macRgbProfile(); const xf = buildTransform(P, disp, { intent: 1 }); fn = compileTransform(xf); }   
      else {
        const custom = t === 'custom' ? S.proofCustom : null;
        const P = custom ? await getProfile(custom.profile) : await getProfile(S.cmyk);
        if (P) {
          const intent = custom ? custom.intent : 1, bpc = custom ? custom.bpc : true;
          const preserve = custom && custom.preserve;
          if(preserve&&(src.nChannels!==P.nChannels||src.colorSpace!==P.colorSpace))throw new Error('当前画布不能保留原始 CMYK 数值校样，请关闭「保留颜色数」。');
          const x1 = preserve ? null : buildTransform(src, P, { intent, bpc });
          const x2 = buildTransform(P, disp, { intent: custom && custom.paper ? 3 : 1, bpc: !(custom && (custom.paper || custom.ink)) });
          const plate = { cyan: [0], magenta: [1], yellow: [2], black: [3], cmy: [0, 1, 2] }[t];
          const n = P.nChannels || 3, tmp = new Float64Array(n);
          fn = compileTransform({ nIn: 3, nOut: 3, eval(i, o) {
            if (x1) x1.eval(i, tmp); else for (let k = 0; k < n; k++) tmp[k] = i[Math.min(k, 2)];
            if (plate && P.colorSpace === 'CMYK') for (let k = 0; k < 4; k++) if (!plate.includes(k)) tmp[k] = 0;
            return x2.eval(tmp, o);
          } });
        }
      }
    } else if (!identitySrc) fn = compileTransform(buildTransform(src, disp, { intent: S.intent, bpc: S.bpc }));
    let gamut = null;
    if (st.gamut) { const C = await getProfile(st.proofOn && S.proofTarget === 'custom' ? S.proofCustom.profile : S.cmyk); if (C) gamut = gamutChecker(src, C); }
    if (src !== canvasSpace() || key !== displayKey()) return; 
    st.displayError = ''; st.displayFn = fn; st.gamutFn = gamut; st.displayKey = key;
    host.rerender();
  }
  function needsDisplay() {
    const want = st.proofOn || st.gamut || (st.mode === 3 && st.profile && profileIdentity(st.profile) !== profileIdentity(sRGBProfile()));
    if (want && displayKey() !== st.displayKey && !pending) pending = rebuildDisplay().catch(e => { st.proofOn=false; st.gamut=false; st.displayFn=null; st.gamutFn=null; st.displayKey=''; st.displayError=e.message||String(e); host.setProofOn(false); host.err('颜色显示失败：'+st.displayError); host.rerender(); }).finally(() => { pending = null; if(displayKey() !== st.displayKey) host.rerender(); });
    return !!want;
  }
  
  function applyDisplay(ctx) {
    if (!needsDisplay()) return false;
    if (displayKey() !== st.displayKey) return true;           
    const fn = st.displayFn, gm = st.gamutFn; if (!fn && !gm) return true;
    const cv = ctx.canvas; if (!cv.width || !cv.height) return true;
    const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
    const cache = new Map(), i3 = new Float64Array(3), o3 = new Float64Array(3), gc = S.gamutColor;
    for (let p = 0; p < d.length; p += 4) {
      if (!d[p + 3]) continue;
      const key = d[p] | (d[p + 1] << 8) | (d[p + 2] << 16);
      let v = cache.get(key);
      if (v === undefined) {
        i3[0] = d[p] / 255; i3[1] = d[p + 1] / 255; i3[2] = d[p + 2] / 255;
        if (gm && gm(i3[0], i3[1], i3[2]) > 5) {
          const k = (S.gamutOpacity || 100) / 100;   
          v = k >= 1 ? (gc[0] | (gc[1] << 8) | (gc[2] << 16))
            : (Math.round(gc[0] * k + d[p] * (1 - k)) | (Math.round(gc[1] * k + d[p + 1] * (1 - k)) << 8) | (Math.round(gc[2] * k + d[p + 2] * (1 - k)) << 16));
        }
        else if (fn) { fn.apply(i3, o3); v = Math.round(Math.max(0, Math.min(1, o3[0])) * 255) | (Math.round(Math.max(0, Math.min(1, o3[1])) * 255) << 8) | (Math.round(Math.max(0, Math.min(1, o3[2])) * 255) << 16); }
        else v = key;
        if (cache.size < 1 << 18) cache.set(key, v);
      }
      d[p] = v & 255; d[p + 1] = (v >> 8) & 255; d[p + 2] = (v >> 16) & 255;
    }
    ctx.putImageData(im, 0, 0);
    return true;
  }

  
  let infoXf = null, infoKey = '';
  function cmykReadout(rgb) {
    const C = st.mode === 4 ? st.profile : cacheP.get(S.cmyk);
    if (!C) { getProfile(S.cmyk); return null; }
    const src = canvasSpace(), key = profileIdentity(src) + '|' + profileIdentity(C) + '|' + S.intent + S.bpc;
    if (key !== infoKey) { infoXf = buildTransform(src, C, { intent: S.intent, bpc: S.bpc }); infoKey = key; }
    const o = new Float64Array(4); infoXf.eval([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], o);
    return [0, 1, 2, 3].map(k => Math.round(o[k] * 100));
  }
  const cmykNote = () => { const C = st.mode === 4 ? st.profile : cacheP.get(S.cmyk); return C ? `${st.mode === 4 ? 'CMYK 估算' : 'CMYK'}：${C.name}` : ''; };

  
  const doc = () => host.getDoc();
  

  async function currentBuffer() {
    const d = doc();
    if (d && d.layers.length === 1 && d.layers[0].synthetic) return host.getBuffer().slice(0);
    return await host.buildFull();
  }
  async function commit(buf, label) { await host.commit(buf, label); }

  async function assignProfile(P, label = '指定配置文件') {
    const buf = await currentBuffer();
    const out = setEmbeddedProfile(buf, P ? P.bytes : null);
    await commit(out, label);
    host.status(P ? `已指定配置文件「${P.name}」（像素数值不变，显示随之改变）` : '已不对此文档进行色彩管理（扔掉嵌入的配置文件）');
  }
  async function convertToProfile(P, intent, bpc, label = '转换为配置文件') {
    const d = doc(); if (!d) return;
    const key = MODE_KEY[d.mode];
    const dstKey = P.colorSpace === 'CMYK' ? 'cmyk' : P.colorSpace === 'GRAY' ? 'gray' : P.colorSpace === 'Lab ' ? 'lab' : 'rgb';
    const buf = await currentBuffer();
    host.busy(true);
    try {
      const r = convertDocument(buf, { mode: dstKey, depth: d.depth }, { srcProfile: st.profile, dstProfile: P, intent, bpc });
      await commit(r.buffer, label);
      host.status(`已转换为「${P.name}」（${INTENT_NAMES[intent]}${bpc ? '，黑场补偿' : ''}）${r.notes.length ? '；' + r.notes.join('；') : ''}${key !== dstKey ? `；模式 ${MODE_LABEL[key]} → ${MODE_LABEL[dstKey]}` : ''}`);
    } finally { host.busy(false); }
  }

  async function colorSettingsDialog() {
    await loadUser();
    const intents = INTENT_NAMES.map((n, i) => [String(i), n]);
    const pol = [['off', '关'], ['preserve', '保留嵌入的配置文件'], ['convert', '转换为工作中的空间']];
    const v = await cmDialog('颜色设置', [
      { type: 'heading', label: '工作空间' },
      { key: 'rgb', label: 'RGB：', type: 'select', options: optionsFor('RGB'), value: S.rgb },
      { key: 'cmyk', label: 'CMYK：', type: 'select', options: optionsFor('CMYK'), value: S.cmyk },
      { key: 'gray', label: '灰色：', type: 'select', options: optionsFor('GRAY'), value: S.gray },
      { type: 'button', label: '载入 ICC 配置文件…', onClick: async (vals, api) => { const id = await importIcc(); if (!id) return; const e = lib.get(id); const k = e.space === 'CMYK' ? 'cmyk' : e.space === 'GRAY' ? 'gray' : 'rgb'; api.setOptions(k, optionsFor(e.space), id); } },
      { type: 'heading', label: '色彩管理方案' },
      { key: 'policyRgb', label: 'RGB：', type: 'select', options: pol, value: S.policyRgb },
      { key: 'policyCmyk', label: 'CMYK：', type: 'select', options: pol, value: S.policyCmyk },
      { key: 'policyGray', label: '灰色：', type: 'select', options: pol, value: S.policyGray },
      { key: 'askMismatchOpen', label: '配置文件不匹配：', type: 'check', value: S.askMismatchOpen, unit: '打开时询问' },
      { key: 'askMissing', label: '缺少配置文件：', type: 'check', value: S.askMissing, unit: '打开时询问' },
      { type: 'heading', label: '转换选项' },
      { type: 'note', label: '引擎：PSD Editor 内置 ICC 引擎（v2/v4 矩阵·TRC / lut8 / lut16 / lutAtoB / lutBtoA）' },
      { key: 'intent', label: '意图：', type: 'select', options: intents, value: String(S.intent) },
      { key: 'bpc', label: '', type: 'check', value: S.bpc, unit: '使用黑场补偿' },
      { key: 'dither', label: '', type: 'check', value: S.dither, unit: '使用仿色（8 位/通道图像）' },
      { type: 'note', label: '设置保存在本机浏览器里。通用 CMYK 是按公开印刷模型现场算出来的配置文件，不是任何厂商的数据；要精确分色请载入你印厂给的 ICC。' },
    ], { width: 'min(520px, 94vw)' });
    if (!v) return;
    Object.assign(S, { rgb: v.rgb, cmyk: v.cmyk, gray: v.gray, policyRgb: v.policyRgb, policyCmyk: v.policyCmyk, policyGray: v.policyGray, askMismatchOpen: !!v.askMismatchOpen, askMissing: !!v.askMissing, intent: +v.intent, bpc: !!v.bpc, dither: !!v.dither });
    saveSettings(S);
    
    if (st.source !== 'embedded' && doc()) { const P = await getProfile(workingFor(st.mode)); if (P) st.profile = P; }
    if (st.mode === 4 && st.profile) { setModeCodec(4,makeCodec(st.profile,{intent:S.intent,bpc:S.bpc})); await host.reparse(); }
    st.displayKey = ''; host.rerender(); host.syncInfo();
    host.status('颜色设置已保存');
  }

  async function assignProfileDialog() {
    const d = doc(); if (!d) return;
    await loadUser();
    const space = d.mode === 4 ? 'CMYK' : (d.mode === 1 || d.mode === 8) ? 'GRAY' : 'RGB';
    const opts = optionsFor(space);
    const v = await cmDialog('指定配置文件', [
      { type: 'note', label: '指定配置文件只改「这些数值是什么颜色」的解释，像素数值不变，所以画面看起来会变。' },
      { key: 'how', label: '指定配置文件：', type: 'select', options: [['none', '不对此文档应用色彩管理'], ['working', `工作中的 ${space}：${(lib.get(workingFor(d.mode)) || {}).name || ''}`], ['profile', '配置文件：']], value: st.source === 'embedded' ? 'profile' : 'working' },
      { key: 'id', label: '', type: 'select', options: opts, value: (opts.find(o => st.profile && lib.get(o[0]) && lib.get(o[0]).name.startsWith(st.profile.name)) || opts[0] || [''])[0], showIf: v => v.how === 'profile' },
      { type: 'button', label: '载入配置文件…', onClick: async (vals, api) => { const id = await importIcc(); if (id) { api.setOptions('id', optionsFor(space), id); api.set('how', 'profile'); } } },
    ]);
    if (!v) return;
    const P = v.how === 'none' ? null : await getProfile(v.how === 'working' ? workingFor(d.mode) : v.id);
    await assignProfile(P);
  }

  async function convertProfileDialog() {
    const d = doc(); if (!d) return;
    await loadUser();
    const all = [...lib.values()].filter(e => ['RGB', 'CMYK', 'GRAY'].includes(e.space)).map(e => [e.id, `${e.space} · ${e.name}`]);
    all.push(['lab', 'Lab 颜色']);
    const v = await cmDialog('转换为配置文件', [
      { type: 'note', label: `源空间　配置文件：${st.profile ? st.profile.name : (d.mode === 9 ? 'Lab' : '（无）')}` },
      { key: 'id', label: '目标空间：', type: 'select', options: all, value: workingFor(d.mode) || S.rgb },
      { type: 'button', label: '载入配置文件…', onClick: async (vals, api) => { const id = await importIcc(); if (id) { const a = [...lib.values()].filter(e => ['RGB', 'CMYK', 'GRAY'].includes(e.space)).map(e => [e.id, `${e.space} · ${e.name}`]); a.push(['lab', 'Lab 颜色']); api.setOptions('id', a, id); } } },
      { type: 'heading', label: '转换选项' },
      { type: 'note', label: '引擎：PSD Editor 内置 ICC 引擎' },
      { key: 'intent', label: '意图：', type: 'select', options: INTENT_NAMES.map((n, i) => [String(i), n]), value: String(S.intent) },
      { key: 'bpc', label: '', type: 'check', value: S.bpc, unit: '使用黑场补偿' },
      { key: 'dither', label: '', type: 'check', value: S.dither, unit: '使用仿色' },
      { key: 'flatten', label: '', type: 'check', value: false, unit: '拼合图像以保留外观（未实现：各图层分别转换）', showIf: () => false },
    ]);
    if (!v) return;
    const P = v.id === 'lab' ? labProfile() : await getProfile(v.id);
    if (!P) return;
    await convertToProfile(P, +v.intent, !!v.bpc);
  }

  
  function setProofTarget(t) { S.proofTarget = t; saveSettings(S); st.proofOn = true; host.setProofOn(true); st.displayKey = ''; host.rerender(); host.status(`校样设置：${PROOF_LABEL[t] || t}（校样颜色已打开，⌘Y 切换）`); }
  const PROOF_LABEL = { cmyk: '工作中的 CMYK', cyan: '工作中的青版', magenta: '工作中的洋红版', yellow: '工作中的黄版', black: '工作中的黑版', cmy: '工作中的 CMY 版', macRgb: '旧版 Macintosh RGB (Gamma 1.8)', srgb: 'Internet 标准 RGB (sRGB)', monitor: '显示器 RGB', custom: '自定' };
  async function proofCustomDialog() {
    await loadUser();
    const c = S.proofCustom;
    const all = [...lib.values()].map(e => [e.id, `${e.space} · ${e.name}`]);
    const v = await cmDialog('自定校样条件', [
      { key: 'profile', label: '要模拟的设备：', type: 'select', options: all, value: c.profile },
      { type: 'button', label: '载入配置文件…', onClick: async (vals, api) => { const id = await importIcc(); if (id) api.setOptions('profile', [...lib.values()].map(e => [e.id, `${e.space} · ${e.name}`]), id); } },
      { key: 'preserve', label: '', type: 'check', value: c.preserve && st.mode === 3, unit: '保留 RGB 颜色数', showIf: v => st.mode===3 && lib.get(v.profile)?.space==='RGB' },
      { key: 'intent', label: '渲染方法：', type: 'select', options: INTENT_NAMES.map((n, i) => [String(i), n]), value: String(c.intent) },
      { key: 'bpc', label: '', type: 'check', value: c.bpc, unit: '黑场补偿' },
      { type: 'heading', label: '显示选项（屏幕）' },
      { key: 'paper', label: '', type: 'check', value: c.paper, unit: '模拟纸张颜色' },
      { key: 'ink', label: '', type: 'check', value: c.ink, unit: '模拟黑色油墨' },
    ]);
    if (!v) return;
    S.proofCustom = { profile: v.profile, preserve: !!v.preserve && st.mode===3 && lib.get(v.profile)?.space==='RGB', intent: +v.intent, bpc: !!v.bpc, paper: !!v.paper, ink: !!v.ink || !!v.paper };
    setProofTarget('custom');
  }
  function toggleProof() { st.proofOn = !st.proofOn; host.setProofOn(st.proofOn); st.displayKey = ''; host.rerender(); host.status(st.proofOn ? `校样颜色：${PROOF_LABEL[S.proofTarget]}` : '校样颜色：关'); }
  function toggleGamut() { st.gamut = !st.gamut; st.displayKey = ''; host.rerender(); host.status(st.gamut ? `色域警告：灰色标出「${(lib.get(S.cmyk) || {}).name}」印不出来的颜色` : '色域警告：关'); }

  async function preview32Dialog() {
    const cur = getFloatPreview();
    const v = await cmDialog('32 位预览选项', [
      { key: 'method', label: '方法：', type: 'select', options: [['exposureGamma', '曝光度和灰度系数'], ['highlightCompression', '高光压缩']], value: cur.method },
      { key: 'exposure', label: '曝光度：', type: 'number', value: cur.exposure, min: -20, max: 20, step: 0.1, showIf: v => v.method === 'exposureGamma' },
      { key: 'gamma', label: '灰度系数：', type: 'number', value: cur.gamma, min: 0.1, max: 9.99, step: 0.01, showIf: v => v.method === 'exposureGamma' },
      { type: 'note', label: '只影响 32 位/通道文档在屏幕上的显示，不改像素。' },
    ]);
    if (!v) return;
    setFloatPreview({ method: v.method, exposure: +v.exposure, gamma: +v.gamma });
    try { localStorage.setItem('psd_editor:preview32', JSON.stringify(getFloatPreview())); } catch {}
    if (doc() && doc().depth === 32) await host.reparse();
  }
  try { const j = JSON.parse(localStorage.getItem('psd_editor:preview32') || 'null'); if (j) setFloatPreview(j); } catch {}

  
  async function flattenOk(target) {
    const d = doc(); if (!d || d.layers.length <= 1) return true;
    return await confirmDialog(`${MODE_LABEL[target]}模式不支持图层。要拼合图层吗？`, { title: '拼合图层？', okText: '拼合' });
  }
  async function modeDialogFor(target) {
    const d = doc();
    if (target === 'bitmap') {
      const pats = await patternList();
      const v = await cmDialog('位图', [
        { type: 'heading', label: '分辨率' },
        { key: 'res', label: '输入：', type: 'number', value: Math.round(host.resolution()), unit: '像素/英寸', min: 1, max: 10000 },
        { type: 'note', label: '输出分辨率与输入相同（不重新取样）。' },
        { type: 'heading', label: '方法' },
        { key: 'method', label: '使用：', type: 'select', options: [['threshold', '50% 阈值'], ['pattern', '图案仿色'], ['diffusion', '扩散仿色'], ['halftone', '半调网屏'], ['custom', '自定图案']], value: 'diffusion' },
        { key: 'frequency', label: '频率：', type: 'number', value: 53, min: 1, max: 999, unit: '线/英寸', showIf: v => v.method === 'halftone' },
        { key: 'angle', label: '角度：', type: 'number', value: 45, min: -180, max: 180, unit: '度', showIf: v => v.method === 'halftone' },
        { key: 'shape', label: '形状：', type: 'select', options: [['round', '圆形'], ['ellipse', '椭圆'], ['line', '直线'], ['square', '方形'], ['cross', '十字'], ['diamond', '菱形']], value: 'round', showIf: v => v.method === 'halftone' },
        { key: 'pattern', label: '自定图案：', type: 'select', options: pats.length ? pats.map((p, i) => [String(i), p.name]) : [['', '（没有可用的图案）']], value: pats.length ? '0' : '', showIf: v => v.method === 'custom' },
      ]);
      if (!v) return null;
      const pat = v.method === 'custom' ? pats[+v.pattern] : null;
      if (v.method === 'custom' && !pat) { host.err('没有可用的图案：先用「编辑 › 定义图案」或导入 .pat'); return null; }
      return { bitmap: { method: v.method, frequency: +v.frequency, angle: +v.angle, shape: v.shape, pattern: pat && patternGray(pat) }, resolution: +v.res };
    }
    if (target === 'indexed') {
      const v = await cmDialog('索引颜色', [
        { key: 'palette', label: '调板：', type: 'select', options: [['exact', '实际'], ['web', 'Web'], ['uniform', '平均'], ['perceptual', '局部（可感知）'], ['selective', '局部（可选择）'], ['adaptive', '局部（随样性）'], ['gray', '灰度'], ['bw', '黑白'], ['custom', '自定…']], value: 'selective' },
        { key: 'colors', label: '颜色：', type: 'number', value: 256, min: 2, max: 256 },
        { key: 'forced', label: '强制：', type: 'select', options: [['none', '无'], ['bw', '黑白'], ['primaries', '三原色'], ['web', 'Web']], value: 'bw' },
        { key: 'custom', label: '自定调板：', type: 'text', value: '#000000 #ffffff', showIf: v => v.palette === 'custom' },
        { type: 'heading', label: '选项' },
        { key: 'dither', label: '仿色：', type: 'select', options: [['none', '无'], ['diffusion', '扩散'], ['pattern', '图案'], ['noise', '杂色']], value: 'diffusion' },
        { key: 'amount', label: '数量：', type: 'number', value: 75, min: 0, max: 100, unit: '%', showIf: v => v.dither !== 'none' },
      ]);
      if (!v) return null;
      const custom = v.palette === 'custom' ? String(v.custom).match(/#?[0-9a-f]{6}/ig)?.map(h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }) : null;
      return { indexed: { palette: v.palette, colors: +v.colors, forced: v.forced, dither: v.dither, amount: +v.amount, custom } };
    }
    if (target === 'duotone') {
      const inkRow = (i, name, hex, on) => [
        { key: 'on' + i, label: `油墨 ${i + 1}：`, type: 'check', value: on, showIf: v => i < +v.type },
        { key: 'name' + i, label: '　名称：', type: 'text', value: name, showIf: v => i < +v.type },
        { key: 'color' + i, label: '　颜色：', type: 'color', value: hex, showIf: v => i < +v.type },
        { key: 'curve' + i, label: '　曲线（13 点）：', type: 'text', value: '0 5 10 20 30 40 50 60 70 80 90 95 100', showIf: v => i < +v.type },
      ];
      const v = await cmDialog('双色调选项', [
        { key: 'type', label: '类型：', type: 'select', options: [['1', '单色调'], ['2', '双色调'], ['3', '三色调'], ['4', '四色调']], value: '2' },
        ...inkRow(0, 'Black', '#000000', true), ...inkRow(1, 'Warm Red', '#c04020', true), ...inkRow(2, 'Yellow', '#e0c000', true), ...inkRow(3, 'Cyan', '#0090d0', true),
        { type: 'note', label: '曲线：依次是 0/5/10/20/30/40/50/60/70/80/90/95/100% 处的油墨百分比，留空或写 - 表示该点不设。' },
      ]);
      if (!v) return null;
      const inks = [];
      for (let i = 0; i < +v.type; i++) {
        const hex = v['color' + i] || '#000000', n = parseInt(hex.slice(1), 16);
        const pts = String(v['curve' + i] || '').split(/[\s,]+/).map(s => s === '-' || s === '' ? -1 : Math.max(0, Math.min(100, +s)) * 10);
        const curve = pts.length === 13 ? pts : DEFAULT_CURVE;
        inks.push({ name: v['name' + i] || `Ink ${i + 1}`, rgb: [n >> 16, (n >> 8) & 255, n & 255], curve });
      }
      return { duotone: { inks } };
    }
    return {};
  }
  async function patternList() {
    
    try { const m = await import('./preset-store.js'); const l = await m.listPresets('patterns'); if (l && l.length) return l.filter(p => p.rgba && p.width); } catch {}
    return ((doc() && doc().patterns) || []).filter(p => (p.rgba || p.data) && p.width).map(p => ({ name: p.name || p.id, width: p.width, height: p.height, rgba: p.rgba || p.data }));
  }
  const patternGray = p => { const g = new Uint8Array(p.width * p.height); for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * p.rgba[i * 4] + 0.587 * p.rgba[i * 4 + 1] + 0.114 * p.rgba[i * 4 + 2]); return { width: p.width, height: p.height, gray: g }; };

  const MODE_ORDER = ['bitmap', 'gray', 'duotone', 'indexed', 'rgb', 'cmyk', 'lab', 'multichannel'];
  function modeAllowed(target) {
    const d = doc(); if (!d) return false;
    const cur = MODE_KEY[d.mode];
    if (cur === target) return false;
    if (target === 'bitmap') return cur === 'gray' || cur === 'duotone';
    if (target === 'duotone') return cur === 'gray' || cur === 'bitmap';
    if (target === 'indexed') return (cur === 'rgb' || cur === 'gray' || cur === 'duotone') && d.depth !== 32;
    if (target === 'multichannel') return cur !== 'bitmap' && cur !== 'indexed' && d.depth !== 32;
    if (d.depth === 32 && target !== 'rgb' && target !== 'gray') return false;
    return true;
  }
  const modeWhy = target => { const d = doc(); if (!d) return '先打开一个文档'; const cur = MODE_KEY[d.mode];
    if (cur === target) return '已经是这个模式';
    if (target === 'bitmap') return '只有灰度图像才能转换成位图（PS 同）：先转成灰度';
    if (target === 'duotone') return '只有灰度图像才能转换成双色调（PS 同）：先转成灰度';
    if (d.depth === 32) return '32 位/通道只支持 RGB 与灰度：先转成 16 或 8 位';
    return '当前模式不能直接转换到这里'; };
  async function convertMode(target) {
    const d = doc(); if (!d) return;
    const cur = MODE_KEY[d.mode];
    if ((target === 'indexed' || target === 'multichannel' || target === 'bitmap') && !await flattenOk(target)) return;
    const extra = await modeDialogFor(target); if (!extra) return;
    const srcP = st.profile;
    let dstP = null;
    if (target === 'cmyk') dstP = await getProfile(S.cmyk);
    else if (target === 'rgb' || target === 'indexed') dstP = cur === 'rgb' ? srcP : await getProfile(S.rgb);
    else if (target === 'gray' || target === 'duotone' || target === 'bitmap') dstP = cur === 'gray' ? srcP : await getProfile(S.gray);
    const buf = await currentBuffer();
    host.busy(true);
    try {
      const r = convertDocument(buf, { mode: target, depth: d.depth === 32 && target !== 'rgb' && target !== 'gray' ? 16 : d.depth }, { srcProfile: srcP, dstProfile: dstP, intent: S.intent, bpc: S.bpc, ...extra });
      await commit(r.buffer, `${MODE_LABEL[target]}`);
      host.status(`已转换为${MODE_LABEL[target]}${dstP ? `（${dstP.name}）` : ''}${r.notes.length ? '：' + r.notes.join('；') : ''}`);
    } catch (e) { host.err('模式转换没能完成：' + (e && e.message || e)); console.error(e); }
    finally { host.busy(false); }
  }
  async function convertDepth(depth) {
    const d = doc(); if (!d || d.depth === depth) return;
    let hdr = null;
    if (d.depth === 32) {
      const v = await cmDialog('HDR 色调', [
        { key: 'method', label: '方法：', type: 'select', options: [['exposureGamma', '曝光度和灰度系数'], ['highlightCompression', '高光压缩'], ['equalize', '色调均化直方图']], value: 'exposureGamma' },
        { key: 'exposure', label: '曝光度：', type: 'number', value: 0, min: -20, max: 20, step: 0.1, showIf: v => v.method === 'exposureGamma' },
        { key: 'gamma', label: '灰度系数：', type: 'number', value: 1, min: 0.1, max: 9.99, step: 0.01, showIf: v => v.method === 'exposureGamma' },
        { type: 'note', label: '「局部适应」要做边缘保持的局部色调映射，还没做。' },
      ]);
      if (!v) return;
      hdr = { method: v.method, exposure: +v.exposure, gamma: +v.gamma };
    }
    const buf = await currentBuffer();
    host.busy(true);
    try {
      const r = convertDocument(buf, { mode: MODE_KEY[d.mode], depth }, { srcProfile: st.profile, hdr });
      await commit(r.buffer, `${depth} 位/通道`);
      host.status(`已转换为 ${depth} 位/通道`);
    } catch (e) { host.err('位深转换没能完成：' + (e && e.message || e)); }
    finally { host.busy(false); }
  }
  const depthAllowed = depth => { const d = doc(); if (!d || d.depth === depth) return false; const k = MODE_KEY[d.mode];
    if (k === 'bitmap' || k === 'indexed') return false;
    if (depth === 32) return k === 'rgb' || k === 'gray';
    return true; };

  
  async function colorTableDialog() {
    const buf = await currentBuffer();
    const pal = readIndexedPalette(buf); if (!pal) { host.err('只有索引颜色模式的文档才有颜色表'); return; }
    let colors = pal.colors.map(c => c.slice());
    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    const v = await cmDialog('颜色表', [
      { key: 'preset', label: '颜色表：', type: 'select', options: [['custom', '自定'], ['blackbody', '黑体'], ['gray', '灰度'], ['spectrum', '色谱'], ['web', 'Web']], value: 'custom' },
      { type: 'custom', render(row, vals, api) {
        const grid = api.mk('div', { style: 'display:grid;grid-template-columns:repeat(16,18px);gap:2px' });
        const paint = () => { grid.innerHTML = ''; colors.forEach((c, i) => { const inp = api.mk('input', { type: 'color', value: hex(c), title: `#${i}`, style: 'width:18px;height:18px;padding:0;border:0' }); inp.oninput = () => { const n = parseInt(inp.value.slice(1), 16); colors[i] = [n >> 16, (n >> 8) & 255, n & 255]; api.set('preset', 'custom'); }; grid.append(inp); }); };
        api.repaint = paint; paint(); row.append(grid);
      } },
      { type: 'button', label: '载入 .act…', onClick: async (vals, api) => { const f = await pickFile('.act'); if (!f) return; const n = f.bytes.length >= 770 ? ((f.bytes[768] << 8) | f.bytes[769]) || 256 : 256; colors = []; for (let i = 0; i < Math.min(n, 256); i++) colors.push([f.bytes[i * 3], f.bytes[i * 3 + 1], f.bytes[i * 3 + 2]]); api.repaint(); } },
      { type: 'button', label: '存储 .act…', onClick: () => { const b = new Uint8Array(772); colors.forEach((c, i) => b.set(c, i * 3)); b[768] = colors.length >> 8; b[769] = colors.length & 255; b[770] = 0xff; b[771] = 0xff; download(b, '颜色表.act'); } },
    ], { width: 'min(420px, 94vw)', onChange: (vals, api) => {
      const N = colors.length, t = vals.preset; if (t === 'custom') return;
      const f = { blackbody: i => { const x = i / (N - 1); return [Math.min(255, x * 3 * 255), Math.max(0, Math.min(255, (x * 3 - 1) * 255)), Math.max(0, Math.min(255, (x * 3 - 2) * 255))]; },
        gray: i => { const g = i / (N - 1) * 255; return [g, g, g]; },
        spectrum: i => { const h = i / N * 6, k = n => (n + h) % 6; return [5, 3, 1].map(n => 255 * (1 - Math.max(0, Math.min(k(n), 4 - k(n), 1)))); },
        web: i => { const j = Math.min(215, i); return [Math.floor(j / 36) * 51, Math.floor(j / 6) % 6 * 51, j % 6 * 51]; } }[t];
      colors = colors.map((_, i) => f(i).map(Math.round)); api.repaint();
    } });
    if (!v) return;
    await commit(setIndexedPalette(buf, colors), '颜色表');
    host.status(`颜色表已更新（${colors.length} 色）`);
  }

  
  async function trapDialog() {
    const d = doc(); if (!d) return;
    const v = await cmDialog('陷印', [
      { key: 'width', label: '宽度：', type: 'number', value: 1, min: 1, max: 10, unit: '像素' },
      { type: 'note', label: 'PS 的规则：所有颜色在黑色下扩展；较浅的颜色在较深的颜色下扩展；黄色在青、洋红、黑下扩展；纯青与纯洋红彼此等量扩展。作用于当前图层与合成图。' },
    ]);
    if (!v) return;
    const buf = await currentBuffer();
    host.busy(true);
    try { await commit(trapDocument(buf, host.selLayer(), +v.width), '陷印'); host.status(`已陷印 ${v.width} 像素`); }
    catch (e) { host.err('陷印没能完成：' + (e && e.message || e)); }
    finally { host.busy(false); }
  }

  
  const lutLib = new Map();       
  async function loadLutLib() { for (const r of await idbAll('luts')) lutLib.set(r.id, r); }
  async function importLut(kind) {
    const acc = kind === '3DLUT' ? '.cube,.3dl,.look,.csp' : '.icc,.icm';
    const f = await pickFile(acc); if (!f) return null;
    let L; try { L = parseLut(f.bytes, f.name); } catch (e) { host.err(`「${f.name}」读不了：${e.message}`); return null; }
    if (kind !== '3DLUT') { const P = L.profile; if (!P || (kind === 'deviceLinkProfile' && P.deviceClass !== 'link') || (kind === 'abstractProfile' && P.deviceClass !== 'abst')) { host.err(`「${f.name}」不是${kind === 'deviceLinkProfile' ? '设备链接' : '摘要'}配置文件（它的类别是 ${P && P.deviceClass}）`); return null; } }
    const id = kind + ':' + f.name;
    const rec = { id, name: f.name, bytes: f.bytes, kind }; lutLib.set(id, rec); await idbPut('luts', rec);
    return id;
  }
  async function colorLookupDialog(asLayer) {
    await loadLutLib();
    const list = k => [['', '载入…'], ...[...lutLib.values()].filter(r => r.kind === k).map(r => [r.id, r.name])];
    const v = await cmDialog('颜色查找', [
      { key: 'type', label: '类型：', type: 'select', options: [['3DLUT', '3DLUT 文件'], ['abstractProfile', '摘要'], ['deviceLinkProfile', '设备链接']], value: '3DLUT' },
      { key: 'lut3', label: '3DLUT 文件：', type: 'select', options: list('3DLUT'), value: (list('3DLUT')[1] || [''])[0], showIf: v => v.type === '3DLUT' },
      { key: 'abst', label: '摘要：', type: 'select', options: list('abstractProfile'), value: (list('abstractProfile')[1] || [''])[0], showIf: v => v.type === 'abstractProfile' },
      { key: 'link', label: '设备链接：', type: 'select', options: list('deviceLinkProfile'), value: (list('deviceLinkProfile')[1] || [''])[0], showIf: v => v.type === 'deviceLinkProfile' },
      { type: 'button', label: '载入…', onClick: async (vals, api) => { const id = await importLut(vals.type); if (!id) return; const k = vals.type === '3DLUT' ? 'lut3' : vals.type === 'abstractProfile' ? 'abst' : 'link'; api.setOptions(k, list(vals.type), id); } },
      { key: 'dither', label: '', type: 'check', value: true, unit: '仿色' },
      { key: 'order', label: '数据顺序：', type: 'select', options: [['rgb', 'RGB'], ['bgr', 'BGR']], value: 'rgb' },
      { key: 'interp', label: '插值：', type: 'select', options: [['tetrahedral', '四面体'], ['trilinear', '三线性']], value: 'tetrahedral', showIf: () => !asLayer },
      { type: 'note', label: asLayer ? '新建「颜色查找」调整图层：查找表整份存进图层（PS 打开不需要原文件）。' : '直接改当前图层的像素（有选区时只改选区内）。' },
    ]);
    if (!v) return;
    const id = v.type === '3DLUT' ? v.lut3 : v.type === 'abstractProfile' ? v.abst : v.link;
    const rec = id && lutLib.get(id);
    if (!rec) { host.err('先「载入…」一个查找表文件'); return; }
    if (asLayer) {
      const ext = (rec.name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || 'cube';
      const fmt = { cube: 'LUTFormatCUBE', '3dl': 'LUTFormat3DL', look: 'LUTFormatLOOK', csp: 'LUTFormatCSP' }[ext] || 'LUTFormatCUBE';
      const values = { lookupType: v.type, name: rec.name, dither: !!v.dither, dataOrder: v.order === 'bgr' ? 'bgrOrder' : 'rgbOrder', tableOrder: v.order === 'bgr' ? 'bgrOrder' : 'rgbOrder' };
      if (v.type === '3DLUT') { values.lutFormat = fmt; values.lutData = rec.bytes; } else { values.profile = rec.bytes; }
      await host.addAdjustmentLayer('colorLookup', values);
      return;
    }
    const L = parseLut(rec.bytes, rec.name);
    host.layerPixelJob('颜色查找', ({ base, w, h, cov }) => {
      const out = applyLutRGBA(base, L, { interp: v.interp, dither: !!v.dither, order: v.order });
      if (cov) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = cov(x, y); if (k >= 1) continue; const o = (y * w + x) * 4; for (let c = 0; c < 3; c++) out[o + c] = base[o + c] + (out[o + c] - base[o + c]) * Math.max(0, k); }
      return out;
    });
  }

  
  async function exportLutDialog() {
    const d = doc(); if (!d) return;
    const adjLayers = (d.layers || []).filter(l => l.adjustment && !l.hidden);
    const v = await cmDialog('导出颜色查找表', [
      { key: 'desc', label: '说明：', type: 'text', value: (host.docName() || 'PSD Editor').replace(/\.[^.]+$/, '') },
      { key: 'copyright', label: '版权：', type: 'text', value: '' },
      { key: 'quality', label: '网格点：', type: 'select', options: [['17', '17（低）'], ['33', '33（中）'], ['64', '64（高）']], value: '33' },
      { type: 'heading', label: '格式' },
      { key: 'cube', label: '', type: 'check', value: true, unit: 'CUBE' },
      { key: '3dl', label: '', type: 'check', value: false, unit: '3DL' },
      { key: 'icc', label: '', type: 'check', value: false, unit: 'ICC 配置文件（设备链接）' },
      { key: 'csp', label: '', type: 'check', value: false, unit: 'CSP' },
      { type: 'note', label: `将采样 ${adjLayers.length} 个可见调整图层（像素图层不参与，PS 同）。${adjLayers.length ? '' : '当前没有调整图层，导出的是恒等查找表。'}` },
    ]);
    if (!v) return;
    const [{ adjustmentRenderParams }, { applyAdjustment }] = await Promise.all([import('../../core/compose.js'), import('../../core/adjust.js')]);
    const N = +v.quality, n = N ** 3, img = new Uint8ClampedArray(n * 4);
    
    for (let b = 0, q = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++, q += 4) { img[q] = Math.round(r * 255 / (N - 1)); img[q + 1] = Math.round(g * 255 / (N - 1)); img[q + 2] = Math.round(b * 255 / (N - 1)); img[q + 3] = 255; }
    let cur = img, skipped = 0;
    for (const l of adjLayers) {
      const p = adjustmentRenderParams(l.adjustment); if (!p) { skipped++; continue; }
      const next = p.type === 'colorLookup' ? applyLutRGBA(cur, p.lut, p.opts) : applyAdjustment(cur, n, 1, p);
      const a = (l.opacity == null ? 255 : l.opacity) / 255;
      if (a < 1) for (let i = 0; i < next.length; i += 4) for (let c = 0; c < 3; c++) next[i + c] = cur[i + c] + (next[i + c] - cur[i + c]) * a;
      cur = next;
    }
    const L = sampleToLut((i, o) => { const r = Math.round(i[0] * (N - 1)), g = Math.round(i[1] * (N - 1)), b = Math.round(i[2] * (N - 1)); const q = ((b * N + g) * N + r) * 4; o[0] = cur[q] / 255; o[1] = cur[q + 1] / 255; o[2] = cur[q + 2] / 255; }, N);
    const base = String(v.desc || 'lut').replace(/[\\/:*?"<>|]/g, '_');
    const o = { title: v.desc, copyright: v.copyright };
    if (v.cube) download(writeCube(L, o), base + '.cube', 'text/plain');
    if (v['3dl']) download(write3dl(L, o), base + '.3dl', 'text/plain');
    if (v.csp) download(writeCsp(L, o), base + '.csp', 'text/plain');
    if (v.icc) download(writeIccLink(L, o), base + '.icc', 'application/vnd.iccprofile');
    host.status(`已导出颜色查找表（${N}³）${skipped ? `；${skipped} 个调整图层没有预览内核，按不改处理` : ''}`);
  }

  
  const hasDoc = () => !!doc();
  const cmds = [
    ['edit.colorSettings', colorSettingsDialog, () => true],
    ['edit.assignProfile', assignProfileDialog, () => hasDoc() && doc().mode !== 9 && doc().mode !== 0 && doc().mode !== 7, { why: () => !hasDoc() ? '先打开一个文档' : 'Lab / 位图 / 多通道文档没有配置文件可指定（PS 同）' }],
    ['edit.convertProfile', convertProfileDialog, () => hasDoc() && doc().mode !== 0 && doc().mode !== 7 && doc().mode !== 2, { why: () => !hasDoc() ? '先打开一个文档' : '位图 / 索引 / 多通道文档先转成 RGB 或灰度' }],
    ['view.proof.custom', proofCustomDialog, hasDoc],
    ...['cmyk', 'cyan', 'magenta', 'yellow', 'black', 'cmy', 'macRgb', 'srgb', 'monitor'].map(t => ['view.proof.' + t, () => setProofTarget(t), hasDoc, { checked: () => S.proofTarget === t }]),
    ['view.proofColors', toggleProof, hasDoc, { checked: () => st.proofOn }],
    ['view.gamutWarning', toggleGamut, hasDoc, { checked: () => st.gamut }],
    ['view.preview32', preview32Dialog, () => true],
    ...MODE_ORDER.map(k => ['image.mode.' + ({ gray: 'grayscale' }[k] || k), () => convertMode(k), () => modeAllowed(k), { checked: () => hasDoc() && MODE_KEY[doc().mode] === k, why: () => modeWhy(k) }]),
    ...[8, 16, 32].map(dp => ['image.depth.' + dp, () => convertDepth(dp), () => depthAllowed(dp), { checked: () => hasDoc() && doc().depth === dp, why: () => !hasDoc() ? '先打开一个文档' : doc().depth === dp ? '已经是这个位深' : '位图 / 索引颜色只有 8 位；32 位只支持 RGB 与灰度' }]),
    ['image.colorTable', colorTableDialog, () => hasDoc() && doc().mode === 2, { why: () => '只有索引颜色模式的文档才有颜色表' }],
    ['image.trap', trapDialog, () => hasDoc() && doc().mode === 4, { why: () => '陷印只适用于 CMYK 模式的文档' }],
    ['image.adjust.colorLookup', () => colorLookupDialog(false), () => hasDoc() && host.canPixelJob()],
    ['layer.adjust.colorLookup', () => colorLookupDialog(true), hasDoc],
    ['file.exportLut', exportLutDialog, hasDoc],
  ];
  return {
    commands: cmds, prepareDocument,
    
    async colorPanelProfiles() { return { src: canvasSpace(), cmyk: await getProfile(S.cmyk), intent: S.intent, bpc: S.bpc }; },
    
    setGamutWarning(rgb, opacity) {
      const c = Array.isArray(rgb) ? rgb.map(v => Math.max(0, Math.min(255, v | 0))) : S.gamutColor;
      const o = Math.max(1, Math.min(100, +opacity || 100));
      if (c.join() === S.gamutColor.join() && o === (S.gamutOpacity || 100)) return;
      S.gamutColor = c; S.gamutOpacity = o; saveSettings(S); st.displayKey = '';
      if (st.gamut) host.rerender();
    },
    
    async bufferToWorkingCmyk(buf) {
      const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const mode = dv.getUint16(24);
      if (mode === 4) return buf;
      const P = await getProfile(S.cmyk); if (!P) return null;
      let src = null; try { const e = readEmbeddedProfile(buf); if (e) src = parseIcc(e); } catch {}
      return convertDocument(buf, { mode: 'cmyk' }, { srcProfile: src || st.profile, dstProfile: P, intent: S.intent, bpc: S.bpc }).buffer;
    },
    
    flatBackdrop(buf) {
      const u8 = new Uint8Array(buf);
      const c = decodeCompositeImage(u8, null, null, { keepRaw: false });
      const W = c.width, H = c.height; if (!W || !H) return null;
      let rgba;
      const codec = getModeCodec(c.mode);
      if (codec && c.depth === 8) {
        rgba = new Uint8ClampedArray(W * H * 4); const pl = c.channels, t = [0, 0, 0];
        for (let i = 0; i < W * H; i++) { codec.toRgb8(pl, i, t); rgba[i * 4] = t[0]; rgba[i * 4 + 1] = t[1]; rgba[i * 4 + 2] = t[2]; rgba[i * 4 + 3] = 255; }
      } else rgba = c.toRGBA({ opacity: 255 });
      return { name: MODE_LABEL[MODE_KEY[c.mode]] === '索引颜色' ? '索引' : '背景', bounds: { top: 0, left: 0, bottom: H, right: W }, width: W, height: H, rgba,
        opacity: 255, blendMode: 'norm', clipping: 0, hidden: false, isSmartObject: false, isText: false, group: null, layerType: 'pixel', synthetic: true };
    },
    setProof(on) { st.proofOn = !!on; if (on) S.proofTarget = S.proofTarget || 'cmyk'; st.displayKey = ''; }, applyDisplay, needsDisplay, cmykReadout, cmykNote,
    state: st, settings: S, getProfile, convertMode, convertDepth, importLut,
    
    async addLutBytes(name, bytes, kind = '3DLUT') { const id = kind + ':' + name; const rec = { id, name, bytes, kind }; lutLib.set(id, rec); await idbPut('luts', rec); return id; },
    
    async convertModeDirect(target, extra = {}) {
      const d = doc(); const cur = MODE_KEY[d.mode];
      const srcP = st.profile;
      const dstP = target === 'cmyk' ? await getProfile(S.cmyk) : (target === 'rgb' || target === 'indexed') ? (cur === 'rgb' ? srcP : await getProfile(S.rgb)) : (target === 'gray' || target === 'duotone' || target === 'bitmap') ? (cur === 'gray' ? srcP : await getProfile(S.gray)) : null;
      const r = convertDocument(await currentBuffer(), { mode: target, depth: extra.depth || (d.depth === 32 && target !== 'rgb' && target !== 'gray' ? 16 : d.depth) }, { srcProfile: srcP, dstProfile: dstP, intent: S.intent, bpc: S.bpc, ...extra });
      await commit(r.buffer, MODE_LABEL[target]); return r.notes;
    },
    profileInfo: () => st.profile ? { ...profileInfo(st.profile), source: st.source } : null,
    lutEvaluator, xyzToLab,
  };
}
