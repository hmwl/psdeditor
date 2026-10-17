














import { quantizeRGBA, encodeGif, encodePng8, encodeWbmp, rgbaToBits } from '../../core/web-formats.js';
import { encodeAnimatedGif } from '../../core/anim-encode.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const LS_SFW = 'psd_editor.saveForWeb', LS_EXP = 'psd_editor.exportPrefs';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : { ...d, ...JSON.parse(v) }; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
const hexRGB = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) || 0);
const kb = n => n < 1024 ? `${n} 字节` : `${(n / 1024).toFixed(1)}K`;

export const SFW_DEFAULT = { fmt: 'jpg', quality: 60, blur: 0, matte: '#ffffff', palette: 'selective', colors: 128, dither: 'diffusion', amount: 100, transparency: true, interlace: false, pct: 100, resample: 'bicubic', tab: '2up' };
const EXP_DEFAULT = { quickFmt: 'png', quickTrans: true, quickQuality: 90, location: 'ask', meta: 'none', srgb: true };

async function deflate(u8) {
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}
function scaled(src, w, h, how) {
  if (w === src.width && h === src.height) return src;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.imageSmoothingEnabled = how !== 'nearest'; g.imageSmoothingQuality = how === 'bicubic' ? 'high' : 'low';
  g.drawImage(src, 0, 0, w, h); return c;
}

export async function encodeWeb(src, o) {
  const w = src.width, h = src.height, ctx = src.getContext('2d', { willReadFrequently: true }), rgba = ctx.getImageData(0, 0, w, h).data;
  const matte = hexRGB(o.matte || '#ffffff');
  if (o.fmt === 'gif' || o.fmt === 'png8') {
    const q = quantizeRGBA(rgba, w, h, { colors: o.colors, palette: o.palette, dither: o.dither, amount: o.amount, transparency: !!o.transparency, matte });
    const bytes = o.fmt === 'gif' ? encodeGif(q.idx, w, h, q.pal, { transIndex: q.transIndex, interlace: !!o.interlace })
      : await encodePng8(q.idx, w, h, q.pal, { transIndex: q.transIndex, interlace: !!o.interlace, deflate });
    const pv = document.createElement('canvas'); pv.width = w; pv.height = h; const id = pv.getContext('2d').createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const k = q.idx[i], c = q.pal[k]; id.data[i * 4] = c[0]; id.data[i * 4 + 1] = c[1]; id.data[i * 4 + 2] = c[2]; id.data[i * 4 + 3] = k === q.transIndex ? 0 : 255; }
    pv.getContext('2d').putImageData(id, 0, 0);
    return { bytes, mime: o.fmt === 'gif' ? 'image/gif' : 'image/png', ext: o.fmt === 'gif' ? 'gif' : 'png', preview: pv, colors: q.pal.length };
  }
  if (o.fmt === 'wbmp') {
    const bits = rgbaToBits(rgba, w, h, { dither: o.dither, amount: o.amount, matte });
    const pv = document.createElement('canvas'); pv.width = w; pv.height = h; const id = pv.getContext('2d').createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = bits[i] ? 255 : 0; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    pv.getContext('2d').putImageData(id, 0, 0);
    return { bytes: encodeWbmp(bits, w, h), mime: 'image/vnd.wap.wbmp', ext: 'wbmp', preview: pv };
  }
  
  let c = src;
  if (o.fmt === 'jpg' || !o.transparency) {
    c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = o.matte || '#ffffff'; g.fillRect(0, 0, w, h);
    if (o.fmt === 'jpg' && o.blur > 0) g.filter = `blur(${o.blur}px)`;     
    g.drawImage(src, 0, 0);
  }
  const mime = o.fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise(r => c.toBlob(r, mime, o.fmt === 'jpg' ? Math.max(0.01, o.quality / 100) : undefined));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let pv = c;
  if (o.fmt === 'jpg') { const im = await createImageBitmap(blob); pv = document.createElement('canvas'); pv.width = w; pv.height = h; pv.getContext('2d').drawImage(im, 0, 0); }
  return { bytes, mime, ext: o.fmt === 'jpg' ? 'jpg' : 'png', preview: pv };
}
const FMT_LABEL = { gif: 'GIF', png8: 'PNG-8', jpg: 'JPEG', png24: 'PNG-24', wbmp: 'WBMP' };
function describe(o, r) {
  const t56 = Math.max(1, Math.round(r.bytes.length * 8 / 56600));
  const detail = o.fmt === 'jpg' ? `${o.quality} 品质` : o.fmt === 'gif' || o.fmt === 'png8' ? `${r.colors} 颜色 · ${{ none: '无仿色', diffusion: '扩散', pattern: '图案', noise: '杂色' }[o.dither]}${o.dither !== 'none' ? ' ' + o.amount + '%' : ''}` : o.fmt === 'wbmp' ? '黑白' : (o.transparency ? '透明' : '不透明');
  return `${FMT_LABEL[o.fmt]}　${kb(r.bytes.length)}　${t56} 秒 @ 56.6 Kbps\n${detail}`;
}
function variant(o, k) {
  
  if (o.fmt === 'jpg') return { ...o, quality: Math.max(1, Math.round(o.quality / (k + 1))) };
  if (o.fmt === 'gif' || o.fmt === 'png8') return { ...o, colors: Math.max(2, o.colors >> (k + 1)) };
  if (o.fmt === 'png24') return { ...o, fmt: 'png8', colors: 256 >> k };
  return { ...o, dither: k ? 'none' : 'pattern' };
}

let C = null;

let animProvider = null;
export function setAnimProvider(fn) { animProvider = fn; }
export async function saveForWebUI(opts = {}) {
  if (!C.hasDoc()) return false;
  let anim = null; try { anim = animProvider ? await animProvider() : null; } catch { anim = null; }
  const full = C.compositeCanvas();
  let o = lsGet(LS_SFW, SFW_DEFAULT);
  const W0 = full.width, H0 = full.height;
  return new Promise(resolve => {
    const d = mk('dialog', { className: 'fp-dlg sfw-dlg', style: 'width:min(1180px,96vw);max-width:96vw;padding:0' });
    const style = mk('style', { textContent: `
.sfw-dlg .sfw{display:flex;flex-direction:column;height:min(760px,90vh);font-size:12px}
.sfw-dlg .sfw-head{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid #1d1d1d}
.sfw-dlg .sfw-head button.on{background:#4b4b4b}
.sfw-dlg .sfw-main{flex:1;display:flex;min-height:0}
.sfw-dlg .sfw-view{flex:1;display:grid;gap:4px;padding:6px;background:#282828;min-width:0}
.sfw-dlg .sfw-cell{display:flex;flex-direction:column;min-height:0;border:2px solid transparent;background:#1e1e1e}
.sfw-dlg .sfw-cell.on{border-color:#4b9cf8}
.sfw-dlg .sfw-img{flex:1;overflow:hidden;display:grid;place-items:center;min-height:0;background:repeating-conic-gradient(#3a3a3a 0 25%,#2e2e2e 0 50%) 0 0/16px 16px}
.sfw-dlg .sfw-img canvas{max-width:100%;max-height:100%;image-rendering:auto}
.sfw-dlg .sfw-cap{white-space:pre;padding:3px 6px;line-height:1.35;opacity:.85;font-size:11px}
.sfw-dlg .sfw-side{width:260px;flex:none;padding:8px 10px;overflow:auto;display:flex;flex-direction:column;gap:6px;border-left:1px solid #1d1d1d}
.sfw-dlg .sfw-side label{display:flex;align-items:center;gap:6px}
.sfw-dlg .sfw-side label{justify-content:flex-start;text-align:left}
.sfw-dlg .sfw-side label>span:first-child{width:82px;flex:none;opacity:.85;text-align:left}
.sfw-dlg .sfw-side select,.sfw-dlg .sfw-side input[type=number]{flex:1;min-width:0}
.sfw-dlg .sfw-side h4{margin:8px 0 2px;font-size:12px;opacity:.8;border-bottom:1px solid #3a3a3a}
.sfw-dlg .sfw-foot{display:flex;gap:6px;justify-content:flex-end;padding:8px 10px;border-top:1px solid #1d1d1d}
` });
    const head = mk('div', { className: 'sfw-head' }, mk('b', { textContent: '存储为 Web 所用格式', style: 'margin-right:auto' }));
    const tabs = {};
    for (const [k, t] of [['orig', '原稿'], ['opt', '优化'], ['2up', '双联'], ['4up', '四联']]) { tabs[k] = mk('button', { type: 'button', textContent: t }); tabs[k].dataset.sfwTab = k; tabs[k].onclick = () => { o.tab = k; layout(); run(); }; head.append(tabs[k]); }
    const view = mk('div', { className: 'sfw-view' });
    const side = mk('div', { className: 'sfw-side' });
    const main = mk('div', { className: 'sfw-main' }, view, side);
    const foot = mk('div', { className: 'sfw-foot' });
    const bSave = mk('button', { type: 'button', className: 'primary', textContent: '存储…' }); bSave.dataset.sfw = 'save';
    const bCancel = mk('button', { type: 'button', textContent: '取消' });
    const bDone = mk('button', { type: 'button', textContent: '完成' });
    const info = mk('span', { style: 'margin-right:auto;opacity:.75;align-self:center' });
    foot.append(info, bCancel, bDone, bSave);
    d.append(style, mk('div', { className: 'sfw' }, head, main, foot));
    document.body.append(d);

    
    const row = (label, el) => { const l = mk('label', {}, mk('span', { textContent: label }), el); side.append(l); return l; };
    const sel = (key, opts2, cb) => { const s = mk('select'); for (const [v, t] of opts2) s.append(mk('option', { value: v, textContent: t })); s.value = o[key]; s.dataset.sfwKey = key; s.onchange = () => { o[key] = s.value; cb && cb(); sync(); run(); }; return s; };
    const num = (key, min, max, cb) => { const s = mk('input', { type: 'number', min, max, value: o[key] }); s.dataset.sfwKey = key; s.onchange = () => { o[key] = Math.max(min, Math.min(max, +s.value || 0)); s.value = o[key]; cb && cb(); run(); }; return s; };
    const chk = key => { const s = mk('input', { type: 'checkbox', checked: !!o[key] }); s.dataset.sfwKey = key; s.onchange = () => { o[key] = s.checked; run(); }; return s; };
    side.append(mk('h4', { textContent: '预设 / 格式' }));
    const preset = sel('preset', [['', '（自定）'], ['gif128d', 'GIF 128 仿色'], ['gif64n', 'GIF 64 无仿色'], ['jpgHigh', 'JPEG 高'], ['jpgMed', 'JPEG 中'], ['jpgLow', 'JPEG 低'], ['png8', 'PNG-8 128 仿色'], ['png24', 'PNG-24']], () => {
      const P = { gif128d: { fmt: 'gif', colors: 128, dither: 'diffusion' }, gif64n: { fmt: 'gif', colors: 64, dither: 'none' }, jpgHigh: { fmt: 'jpg', quality: 60 }, jpgMed: { fmt: 'jpg', quality: 30 }, jpgLow: { fmt: 'jpg', quality: 10 }, png8: { fmt: 'png8', colors: 128, dither: 'diffusion' }, png24: { fmt: 'png24' } }[o.preset];
      if (P) Object.assign(o, P); rebuild();
    });
    row('预设', preset);
    const fmtSel = sel('fmt', [['gif', 'GIF'], ['jpg', 'JPEG'], ['png8', 'PNG-8'], ['png24', 'PNG-24'], ['wbmp', 'WBMP']], () => { o.preset = ''; rebuild(); });
    row('格式', fmtSel);
    const R = {};
    R.palette = row('颜色算法', sel('palette', [['perceptual', '可感知'], ['selective', '可选择'], ['adaptive', '随样性'], ['restrictive', '受限 (Web)'], ['bw', '黑白'], ['gray', '灰度']]));
    R.colors = row('颜色', num('colors', 2, 256));
    R.dither = row('仿色', sel('dither', [['none', '无仿色'], ['diffusion', '扩散'], ['pattern', '图案'], ['noise', '杂色']]));
    R.amount = row('仿色 %', num('amount', 0, 100));
    R.qsel = row('品质', sel('qpreset', [['', '（自定）'], ['10', '低'], ['30', '中'], ['60', '高'], ['80', '非常高'], ['100', '最佳']], () => { if (o.qpreset) o.quality = +o.qpreset; rebuild(); }));
    R.quality = row('品质值', num('quality', 0, 100, () => { o.qpreset = ''; }));
    R.blur = row('模糊', num('blur', 0, 2));
    R.transparency = row('透明度', chk('transparency'));
    R.interlace = row('交错', chk('interlace'));
    const matte = mk('input', { type: 'color', value: o.matte }); matte.oninput = () => { o.matte = matte.value; run(); };
    R.matte = row('杂边', matte);
    side.append(mk('h4', { textContent: '图像大小' }));
    const wIn = mk('input', { type: 'number', min: 1, max: 30000 }), hIn = mk('input', { type: 'number', min: 1, max: 30000 }), pIn = mk('input', { type: 'number', min: 1, max: 1000 });
    const setSize = () => { wIn.value = Math.max(1, Math.round(W0 * o.pct / 100)); hIn.value = Math.max(1, Math.round(H0 * o.pct / 100)); pIn.value = Math.round(o.pct * 100) / 100; };
    wIn.onchange = () => { o.pct = Math.max(0.1, +wIn.value / W0 * 100); setSize(); run(); };
    hIn.onchange = () => { o.pct = Math.max(0.1, +hIn.value / H0 * 100); setSize(); run(); };
    pIn.onchange = () => { o.pct = Math.max(0.1, +pIn.value); setSize(); run(); };
    wIn.dataset.sfwKey = 'w'; hIn.dataset.sfwKey = 'h'; pIn.dataset.sfwKey = 'pct';
    row('W', wIn); row('H', hIn); row('百分比', pIn);
    row('品质', sel('resample', [['bicubic', '两次立方'], ['bilinear', '两次线性'], ['nearest', '邻近']]));
    
    if (anim) {
      side.append(mk('h4', { textContent: `动画（${anim.canvases.length} 帧）` }));
      if (o.animLoop == null || ![0, 1, 3].includes(+o.animLoop)) o.animLoop = anim.loop;
      const lp = mk('select'); for (const [v, t] of [[1, '一次'], [3, '3 次'], [0, '永远'], ...([0, 1, 3].includes(anim.loop) ? [] : [[anim.loop, anim.loop + ' 次']])]) lp.append(mk('option', { value: String(v), textContent: t }));
      lp.value = String(anim.loop); o.animLoop = anim.loop; lp.dataset.sfwKey = 'animLoop'; lp.onchange = () => { o.animLoop = +lp.value; };
      row('循环选项', lp);
      side.append(mk('div', { textContent: '只有 GIF 存储为动画（延时 / 处理方法 / 优化按时间轴面板）；其它格式存储当前帧。', style: 'opacity:.7;font-size:11px;line-height:1.4' }));
    }
    setSize();
    function sync() {
      const f = o.fmt, idx = f === 'gif' || f === 'png8';
      R.palette.hidden = !idx; R.colors.hidden = !idx; R.dither.hidden = !(idx || f === 'wbmp'); R.amount.hidden = R.dither.hidden || o.dither === 'none';
      R.qsel.hidden = R.quality.hidden = R.blur.hidden = f !== 'jpg';
      R.transparency.hidden = !(idx || f === 'png24'); R.interlace.hidden = !(idx || f === 'png24'); R.matte.hidden = f === 'wbmp';
      R.interlace.title = f === 'png24' ? '浏览器的 PNG-24 编码器不写隔行：勾上也按逐行存（GIF / PNG-8 真的写隔行）' : '';
    }
    function rebuild() { for (const el of side.querySelectorAll('[data-sfw-key]')) { const k = el.dataset.sfwKey; if (!(k in o)) continue; if (el.type === 'checkbox') el.checked = !!o[k]; else el.value = o[k]; } matte.value = o.matte; sync(); run(); }

    
    let cells = [], active = 1, seq = 0, last = null;
    function layout() {
      for (const k in tabs) tabs[k].classList.toggle('on', o.tab === k);
      view.textContent = '';
      const n = o.tab === '4up' ? 4 : o.tab === '2up' ? 2 : 1;
      view.style.gridTemplateColumns = n === 1 ? '1fr' : '1fr 1fr';
      view.style.gridTemplateRows = n === 4 ? '1fr 1fr' : '1fr';
      cells = [];
      for (let k = 0; k < n; k++) {
        const cv = mk('div', { className: 'sfw-img' }), cap = mk('div', { className: 'sfw-cap' });
        const cell = mk('div', { className: 'sfw-cell' }, cv, cap); cell.dataset.sfwCell = k;
        cell.onclick = () => { if (cell._o) { o = { ...o, ...cell._o }; rebuild(); active = k; } };
        view.append(cell); cells.push({ cell, cv, cap });
      }
    }
    async function run() {
      const my = ++seq;
      const w = Math.max(1, Math.round(W0 * o.pct / 100)), h = Math.max(1, Math.round(H0 * o.pct / 100));
      const src = scaled(full, w, h, o.resample);
      const plans = o.tab === 'orig' ? [null] : o.tab === 'opt' ? [o] : o.tab === '2up' ? [null, o] : [null, o, variant(o, 0), variant(o, 1)];
      info.textContent = '正在优化…';
      for (let k = 0; k < plans.length; k++) {
        const cell = cells[k]; if (!cell) continue;
        const p = plans[k];
        let pv = src, cap = `原稿：「${C.docName()}」\n${w} × ${h} 像素`;
        cell.cell._o = p ? { ...p } : null;
        if (p) {
          try { const r = await encodeWeb(src, p); if (my !== seq) return; pv = r.preview; cap = describe(p, r); if (p === o) last = r; }
          catch (e) { cap = '编码失败：' + (e && e.message || e); }
        }
        let show = pv; if (pv === src) { show = document.createElement('canvas'); show.width = w; show.height = h; show.getContext('2d').drawImage(src, 0, 0); }
        cell.cv.textContent = ''; cell.cv.append(show); cell.cap.textContent = cap;
        cell.cell.classList.toggle('on', !!p && p === o);
      }
      if (my === seq) info.textContent = last ? `${FMT_LABEL[o.fmt]} · ${kb(last.bytes.length)} · ${w} × ${h}` : '';
    }
    let done = false;
    const finish = v => { if (done) return; done = true; try { d.close(); } catch {} d.remove(); resolve(v); };
    bCancel.onclick = () => finish(false);
    bDone.onclick = () => { lsSet(LS_SFW, o); finish(true); };
    bSave.onclick = async () => {
      const w = Math.max(1, Math.round(W0 * o.pct / 100)), h = Math.max(1, Math.round(H0 * o.pct / 100));
      let r;
      if (anim && o.fmt === 'gif') {                       
        const frames = anim.canvases.map((cv, i) => ({ rgba: scaled(cv, w, h, o.resample).getContext('2d').getImageData(0, 0, w, h).data, ...anim.frames[i] }));
        const bytes = encodeAnimatedGif(frames, w, h, { loop: o.animLoop ?? anim.loop, colors: o.colors, palette: o.palette, dither: o.dither, amount: o.amount, transparency: !!o.transparency, matte: hexRGB(o.matte), bbox: anim.bbox, redundant: anim.redundant });
        r = { bytes, mime: 'image/gif', ext: 'gif' };
      } else r = await encodeWeb(scaled(full, w, h, o.resample), o);
      const name = safe(C.docName().replace(/\.[^.]+$/, '')) + '.' + r.ext;
      C.download(name, new Blob([r.bytes], { type: r.mime }));
      saveForWebUI.last = { name, size: r.bytes.length, fmt: o.fmt, head: Array.from(r.bytes.slice(0, 8)), frames: anim && o.fmt === 'gif' ? anim.canvases.length : 1 };   
      lsSet(LS_SFW, o); C.status(`已存储为 Web 所用格式：${name}（${kb(r.bytes.length)}）`);
      finish(true);
    };
    d.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    layout(); sync(); run();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    if (opts.onOpen) opts.onOpen(d);
  });
}

async function exportPrefsUI() {
  const p = lsGet(LS_EXP, EXP_DEFAULT);
  const v = await C.formDialog('导出首选项', [
    { type: 'note', label: '快速导出格式' },
    { key: 'quickFmt', label: '格式', type: 'select', value: p.quickFmt, options: [['png', 'PNG'], ['jpg', 'JPG'], ['gif', 'GIF'], ['webp', 'WebP']] },
    { key: 'quickTrans', label: '透明度', type: 'check', value: p.quickTrans, showIf: o => o.quickFmt === 'png' || o.quickFmt === 'webp' },
    { key: 'quickQuality', label: '品质', type: 'number', value: p.quickQuality, min: 1, max: 100, unit: '%', showIf: o => o.quickFmt === 'jpg' || o.quickFmt === 'webp' },
    { type: 'note', label: '快速导出位置' },
    { key: 'location', label: '位置', type: 'select', value: p.location, options: [['ask', '每次询问导出位置（浏览器下载）'], ['assets', '导出到当前文档旁边的资源文件夹（打成 zip）']] },
    { type: 'note', label: '快速导出元数据' },
    { key: 'meta', label: '元数据', type: 'select', value: p.meta, options: [['none', '无'], ['copyright', '版权和联系信息']] },
    { type: 'note', label: '快速导出色彩空间' },
    { key: 'srgb', label: '转换为 sRGB', type: 'check', value: p.srgb },
  ]);
  if (!v) return false;
  lsSet(LS_EXP, { ...p, ...v });
  C.status('已存储导出首选项');
  return true;
}

export function exportPrefs() { return lsGet(LS_EXP, EXP_DEFAULT); }

export function installSaveForWeb(ctx) {
  C = ctx;
  ctx.R('file.saveForWeb', () => saveForWebUI(), () => C.hasDoc(), { why: () => '先打开一个文档' });
  ctx.R('file.exportPrefs', () => exportPrefsUI());
  return { saveForWebUI, exportPrefsUI, encodeWeb };
}
