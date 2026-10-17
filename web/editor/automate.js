














import { actions } from './actions.js';
import { detectPhotos, extractRect } from '../../core/crop-straighten.js';
import { writePdf } from '../../core/pdf-write.js';

let A = null;
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stem = n => String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
const isImg = f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(f.name || '');
const isDoc = f => isImg(f) || /\.ps[db]$/i.test(f.name || '');

function pickFiles(accept = '.psd,.psb,image/*') {
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple: true });
    inp.onchange = () => res([...(inp.files || [])].filter(isDoc));
    inp.addEventListener('cancel', () => res([]));
    inp.click();
  });
}
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = mk('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

const progress = (i, n, name, what) => A.status(`${what}：${i + 1} / ${n}　${name}`);

async function getFiles(accept) {
  const hook = window.__psd_editorAutomate;
  if (hook && Array.isArray(hook.files) && hook.files.length) { const f = hook.files; hook.files = null; return f; }
  return pickFiles(accept);
}


function actionChoices() {
  const P = A.actions; if (!P) return { sets: [], acts: [] };
  const sets = P.sets.map((s, i) => [String(i), s.name]);
  const acts = [];
  P.sets.forEach((s, i) => s.actions.forEach((a, j) => acts.push([`${i}:${j}`, `${s.name} › ${a.name}`])));
  return { sets, acts };
}
async function batch() {
  const { acts } = actionChoices();
  if (!acts.length) { await A.alertDialog('动作面板里还没有动作：先记录一个动作，或载入 .atn。', { title: '批处理' }); return; }
  const sel = A.actions.S.sel;
  const def = sel && sel.a != null ? `${sel.s}:${sel.a}` : acts[0][0];
  const v = await A.formDialog('批处理', [
    { type: 'note', label: '播放' },
    { key: 'act', label: '动作', type: 'select', value: def, options: acts },
    { type: 'note', label: '源：点「确定」后选择要处理的文件（可多选：PSD / PSB / PNG / JPEG…）。' },
    { key: 'noDialogs', label: '禁止显示文件打开选项对话框', type: 'check', value: true },
    { key: 'suppress', label: '覆盖动作中的对话框（按录下的参数直接执行）', type: 'check', value: true },
    { type: 'note', label: '目标' },
    { key: 'dest', label: '目标', type: 'select', value: 'zip', options: [['none', '无（处理后保持打开）'], ['zip', '存储并关闭（打成 zip）']] },
    { key: 'overrideSave', label: '覆盖动作中的「存储为」命令', type: 'check', value: true, showIf: o => o.dest === 'zip' },
    { key: 'format', label: '文件类型', type: 'select', value: 'psd', options: [['psd', 'Photoshop (PSD)'], ['png', 'PNG'], ['jpg', 'JPEG']], showIf: o => o.dest === 'zip' },
    { key: 'quality', label: 'JPEG 品质', type: 'number', value: 90, min: 1, max: 100, showIf: o => o.dest === 'zip' && o.format === 'jpg' },
    { key: 'naming', label: '文件命名', type: 'select', value: 'name', options: [['name', '文档名称'], ['nameSerial', '文档名称 + 序号'], ['serial', '序号']], showIf: o => o.dest === 'zip' },
    { key: 'errors', label: '错误', type: 'select', value: 'log', options: [['stop', '由于错误而停止'], ['log', '将错误记录到文件']] },
  ], { okText: '确定' });
  if (!v) return;
  const files = await getFiles();
  if (!files.length) return;
  const [s, a] = v.act.split(':').map(Number);
  await runBatch(files, { s, a }, v);
}
export async function runBatch(files, target, v = {}) {
  const out = [], log = [];
  const ext = { psd: 'psd', png: 'png', jpg: 'jpg' }[v.format || 'psd'];
  const zip = (v.dest || 'zip') === 'zip';
  let stopped = false, serial = 0;
  const saved = [];
  
  A.setSaveHook(zip ? async p => {
    const f = v.overrideSave !== false ? ext : (p.format || ext);
    saved.push({ f, bytes: await A.exportBytes(f, v.quality || 90) });
    return true;
  } : null);
  try {
    for (let i = 0; i < files.length && !stopped; i++) {
      const f = files[i];
      progress(i, files.length, f.name, '批处理');
      A.clearErr();
      let opened = false;
      try {
        opened = await A.openFile(f);
        if (!opened) throw new Error(A.lastErr() || '打不开');
        saved.length = 0;
        const r = await A.actions.play(target, { quiet: true, strict: true, noDialogs: v.suppress !== false, onError: () => 'stop' });
        if (r.skipped && r.skipped.length) log.push(`${f.name}：跳过了本编辑器回放不了的步骤 —— ${r.skipped.join('；')}`);
        if (!r.ok) throw new Error((r.errors || []).join('；') || '动作没有完整执行，本文件未导出');
        if (zip) {
          serial++;
          const base = v.naming === 'serial' ? String(serial).padStart(4, '0') : v.naming === 'nameSerial' ? `${safe(stem(f.name))}_${String(serial).padStart(4, '0')}` : safe(stem(f.name));
          const list = saved.length ? saved.slice() : [{ f: ext, bytes: await A.exportBytes(ext, v.quality || 90) }];
          list.forEach((sv, k) => out.push({ name: `${base}${k ? '_' + k : ''}.${sv.f}`, data: sv.bytes }));
        }
      } catch (e) {
        log.push(`${f.name}：${e && e.message || e}`);
        if (v.errors === 'stop') stopped = true;
      } finally {
        if (opened && zip) { try { await A.closeDoc(); } catch {} }
      }
      await sleep(0);
    }
  } finally { A.setSaveHook(null); }
  if (log.length) out.push({ name: '错误日志.txt', data: new TextEncoder().encode(log.join('\r\n') + '\r\n') });
  if (zip && out.length) download('批处理结果.zip', A.makeZip(out));
  A.status(`批处理完成：${files.length} 个文件` + (log.length ? `，${log.length} 条错误 / 提示（见 zip 里的错误日志）` : '') + (stopped ? '（已中途停止）' : ''));
  if (log.length && v.errors === 'stop') await A.alertDialog(log.join('\n'), { title: '批处理' });
  return { files: out.map(o => o.name), log, stopped };
}


async function imageProcessor() {
  const { acts } = actionChoices();
  const v = await A.formDialog('图像处理器', [
    { type: 'note', label: '① 选择要处理的图像：点「运行」后选择文件（可多选）。② 结果打成一个 zip（按格式分 JPEG / PSD / PNG 子文件夹，与 PS 同）。' },
    { key: 'jpg', label: '存储为 JPEG', type: 'check', value: true },
    { key: 'quality', label: '品质（0–12）', type: 'number', value: 10, min: 0, max: 12, showIf: o => o.jpg },
    { key: 'jpgFit', label: '调整大小以适合', type: 'check', value: false, showIf: o => o.jpg },
    { key: 'jpgW', label: 'W（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.jpg && o.jpgFit },
    { key: 'jpgH', label: 'H（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.jpg && o.jpgFit },
    { key: 'psd', label: '存储为 PSD', type: 'check', value: false },
    { key: 'psdFit', label: '调整大小以适合', type: 'check', value: false, showIf: o => o.psd },
    { key: 'psdW', label: 'W（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.psd && o.psdFit },
    { key: 'psdH', label: 'H（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.psd && o.psdFit },
    { key: 'png', label: '存储为 PNG', type: 'check', value: false },
    { key: 'pngFit', label: '调整大小以适合', type: 'check', value: false, showIf: o => o.png },
    { key: 'pngW', label: 'W（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.png && o.pngFit },
    { key: 'pngH', label: 'H（像素）', type: 'number', value: 1200, min: 1, max: 30000, showIf: o => o.png && o.pngFit },
    { key: 'runAction', label: '运行动作', type: 'check', value: false, showIf: () => acts.length > 0 },
    { key: 'act', label: '动作', type: 'select', value: acts[0] ? acts[0][0] : '', options: acts.length ? acts : [['', '（没有动作）']], showIf: o => o.runAction },
  ], { okText: '运行' });
  if (!v) return;
  if (!v.jpg && !v.psd && !v.png) { await A.alertDialog('至少勾选一种文件类型。', { title: '图像处理器' }); return; }
  const files = await getFiles();
  if (!files.length) return;
  return runImageProcessor(files, v);
}
export async function runImageProcessor(files, v) {
  const out = [], log = [];
  const fmts = [['jpg', 'JPEG'], ['psd', 'PSD'], ['png', 'PNG']].filter(([k]) => v[k]);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progress(i, files.length, f.name, '图像处理器');
    A.clearErr();
    let opened = false;
    try {
      opened = await A.openFile(f);
      if (!opened) throw new Error(A.lastErr() || '打不开');
      if (v.runAction && v.act) {
        const [s, a] = String(v.act).split(':').map(Number);
        const r = await A.actions.play({ s, a }, { quiet: true, strict: true, noDialogs: true, onError: () => 'stop' });
        if (!r.ok) throw new Error((r.errors || []).join('；') || '动作没有完整执行，本文件未导出');
        if (r.skipped && r.skipped.length) log.push(`${f.name}：跳过 ${r.skipped.length} 步本编辑器回放不了的步骤`);
      }
      const { w: w0, h: h0 } = A.docSize();
      for (const [k, dir] of fmts) {
        
        let resized = false;
        if (v[k + 'Fit']) {
          const W = +v[k + 'W'] || w0, H = +v[k + 'H'] || h0, s = Math.min(W / w0, H / h0);
          const nw = Math.max(1, Math.round(w0 * s)), nh = Math.max(1, Math.round(h0 * s));
          if (nw !== w0 || nh !== h0) { A.resizeImage(nw, nh); resized = true; }
        }
        const q = k === 'jpg' ? Math.round(Math.max(0, Math.min(12, +v.quality || 10)) / 12 * 100) : 90;
        out.push({ name: `${dir}/${safe(stem(f.name))}.${k}`, data: await A.exportBytes(k, q) });
        if (resized) A.resizeImage(w0, h0);
      }
    } catch (e) { log.push(`${f.name}：${e && e.message || e}`); }
    finally { if (opened) { try { await A.closeDoc(); } catch {} } }
    await sleep(0);
  }
  if (log.length) out.push({ name: '错误日志.txt', data: new TextEncoder().encode(log.join('\r\n') + '\r\n') });
  if (out.length) download('图像处理器.zip', A.makeZip(out));
  A.status(`图像处理器完成：${files.length} 个文件 → ${out.length - (log.length ? 1 : 0)} 个输出` + (log.length ? `，${log.length} 条错误` : ''));
  return { files: out.map(o => o.name), log };
}


export async function cropAndStraighten(opts = {}) {
  if (!A.hasDoc()) return false;
  const { w, h } = A.docSize();
  const rgba = A.compositeRGBA();
  if (!rgba) return false;
  const found = detectPhotos(rgba, w, h, opts);
  if (!found.length) { A.status('裁剪并修齐照片：没找到照片（照片之间、照片与扫描边缘之间要留一点空白，背景要接近纯色）'); return []; }
  const base = stem(A.docName()) || '扫描';
  const made = [];
  for (let k = 0; k < found.length; k++) {
    const r = extractRect(rgba, w, h, found[k]);
    const name = `${base} 副本${found.length > 1 ? ' ' + (k + 1) : ''}`;
    if (await A.newDocFromRGBA(r.rgba, r.w, r.h, name)) made.push({ name, w: r.w, h: r.h, angle: +(found[k].angle * 180 / Math.PI).toFixed(2) });
  }
  A.status(`裁剪并修齐照片：找到 ${found.length} 张，已各自存为新文档`);
  return made;
}


async function rasterOf(f) {
  if (isImg(f)) {
    const im = await A.decodeImage(f);
    const cv = mk('canvas', { width: im.width, height: im.height });
    cv.getContext('2d').drawImage(im, 0, 0);
    return cv;
  }
  
  A.clearErr();
  if (!await A.openFile(f)) throw new Error(A.lastErr() || '打不开');
  try {
    const { w, h } = A.docSize(), data = A.compositeRGBA();
    const cv = mk('canvas', { width: w, height: h });
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
    return cv;
  } finally { await A.closeDoc(); }
}
const jpegOf = (cv, q = 0.9) => new Promise((res, rej) => {
  
  const t = mk('canvas', { width: cv.width, height: cv.height }); const g = t.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height); g.drawImage(cv, 0, 0);
  t.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('JPEG 编码失败')), 'image/jpeg', q);
});
const PAGE = { original: null, a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55], screen: [1024 * 0.75, 768 * 0.75] };


async function pdfPresentation() {
  const v = await A.formDialog('PDF 演示文稿', [
    { type: 'note', label: '源文件：点「存储」后选择要放进 PDF 的文件（按选择顺序，一页一张）。' },
    { key: 'page', label: '页面大小', type: 'select', value: 'original', options: [['original', '与图像相同（72 ppi）'], ['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3'], ['screen', '屏幕 4:3']] },
    { key: 'landscape', label: '横向', type: 'check', value: false, showIf: o => o.page !== 'original' },
    { key: 'bg', label: '背景', type: 'select', value: 'white', options: [['white', '白色'], ['gray', '灰色'], ['black', '黑色']] },
    { key: 'caption', label: '包括：文件名', type: 'check', value: false },
    { key: 'quality', label: 'JPEG 品质', type: 'number', value: 90, min: 10, max: 100 },
  ], { okText: '存储' });
  if (!v) return;
  const files = await getFiles();
  if (!files.length) return;
  return runPdfPresentation(files, v);
}
export async function runPdfPresentation(files, v = {}) {
  const pages = [], log = [];
  const BG = { white: [255, 255, 255], gray: [128, 128, 128], black: [0, 0, 0] }[v.bg || 'white'];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progress(i, files.length, f.name, 'PDF 演示文稿');
    try {
      let cv = await rasterOf(f);
      if (v.caption) cv = withCaption(cv, stem(f.name), BG);
      const jpeg = await jpegOf(cv, (v.quality || 90) / 100);
      let W, H;
      if (!PAGE[v.page || 'original']) { W = cv.width; H = cv.height; }       
      else { [W, H] = PAGE[v.page]; if (v.landscape) [W, H] = [H, W]; }
      const s = Math.min(W / cv.width, H / cv.height), dw = cv.width * s, dh = cv.height * s;
      pages.push({ width: W, height: H, background: BG, images: [{ jpeg, pw: cv.width, ph: cv.height, x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh }] });
    } catch (e) { log.push(`${f.name}：${e && e.message || e}`); }
  }
  if (!pages.length) { await A.alertDialog('没有可放进 PDF 的页面。\n' + log.join('\n'), { title: 'PDF 演示文稿' }); return null; }
  const bytes = writePdf(pages, { title: 'PDF 演示文稿' });
  download('演示文稿.pdf', new Blob([bytes], { type: 'application/pdf' }));
  A.status(`PDF 演示文稿：${pages.length} 页` + (log.length ? `（${log.length} 个文件没能加入：${log.join('；')}）` : ''));
  return { pages: pages.length, bytes, log };
}

function withCaption(cv, text, bg) {
  const fs = Math.max(12, Math.round(Math.min(cv.width, cv.height) / 28));
  const t = mk('canvas', { width: cv.width, height: cv.height + fs * 2 });
  const g = t.getContext('2d');
  g.fillStyle = `rgb(${bg.join(',')})`; g.fillRect(0, 0, t.width, t.height);
  g.drawImage(cv, 0, 0);
  g.fillStyle = (bg[0] + bg[1] + bg[2]) / 3 > 128 ? '#222' : '#eee';
  g.font = `${fs}px "PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, t.width / 2, cv.height + fs, t.width - 8);
  return t;
}


async function contactSheet() {
  const v = await A.formDialog('联系表 II', [
    { type: 'note', label: '源图像：点「确定」后选择文件。每一页生成一份新文档（缩览图 + 文件名题注，PS 同）。' },
    { key: 'width', label: '宽度（像素）', type: 'number', value: 2480, min: 100, max: 30000 },
    { key: 'height', label: '高度（像素）', type: 'number', value: 3508, min: 100, max: 30000 },
    { key: 'cols', label: '列数', type: 'number', value: 5, min: 1, max: 50 },
    { key: 'rows', label: '行数', type: 'number', value: 6, min: 1, max: 50 },
    { key: 'across', label: '先横向', type: 'check', value: true },
    { key: 'gap', label: '间距（像素）', type: 'number', value: 20, min: 0, max: 1000 },
    { key: 'rotate', label: '旋转以调整到最佳位置', type: 'check', value: false },
    { key: 'caption', label: '使用文件名作题注', type: 'check', value: true },
    { key: 'fontSize', label: '字体大小（像素）', type: 'number', value: 24, min: 6, max: 400, showIf: o => o.caption },
    { key: 'pdf', label: '同时存储一份 PDF', type: 'check', value: false },
  ]);
  if (!v) return;
  const files = await getFiles();
  if (!files.length) return;
  return runContactSheet(files, v);
}
export async function runContactSheet(files, v = {}) {
  const W = +v.width || 2480, H = +v.height || 3508, C = Math.max(1, +v.cols || 5), R = Math.max(1, +v.rows || 6);
  const gap = +v.gap || 0, fs = v.caption === false ? 0 : (+v.fontSize || 24);
  const cellW = (W - gap * (C + 1)) / C, cellH = (H - gap * (R + 1)) / R, imgH = cellH - (fs ? fs * 1.6 : 0);
  if (cellW < 4 || imgH < 4) throw new Error('页面太小或行列太多：缩览图放不下');
  const per = C * R, sheets = [], log = [];
  let page = null, g = null, k = 0;
  const flush = () => { if (page) sheets.push(page); page = null; };
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progress(i, files.length, f.name, '联系表');
    let cv;
    try { cv = await rasterOf(f); } catch (e) { log.push(`${f.name}：${e && e.message || e}`); continue; }
    if (!page) { page = mk('canvas', { width: W, height: H }); g = page.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); k = 0; }
    const col = v.across === false ? Math.floor(k / R) : k % C, row = v.across === false ? k % R : Math.floor(k / C);
    const x0 = gap + col * (cellW + gap), y0 = gap + row * (cellH + gap);
    let iw = cv.width, ih = cv.height, rot = false;
    if (v.rotate && (iw > ih) !== (cellW > imgH)) { rot = true; [iw, ih] = [ih, iw]; }     
    const s = Math.min(cellW / iw, imgH / ih), dw = iw * s, dh = ih * s;
    const cx = x0 + cellW / 2, cy = y0 + imgH / 2;
    g.save(); g.translate(cx, cy); if (rot) g.rotate(Math.PI / 2);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cv, -(rot ? dh : dw) / 2, -(rot ? dw : dh) / 2, rot ? dh : dw, rot ? dw : dh);
    g.restore();
    if (fs) { g.fillStyle = '#000'; g.font = `${fs}px "PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(stem(f.name), cx, y0 + imgH + fs * 0.3, cellW); }
    if (++k >= per) flush();
  }
  flush();
  if (!sheets.length) { await A.alertDialog('没有可拼版的图像。\n' + log.join('\n'), { title: '联系表 II' }); return null; }
  for (let p = 0; p < sheets.length; p++) {
    const d = sheets[p].getContext('2d').getImageData(0, 0, W, H).data;
    await A.newDocFromRGBA(d, W, H, `联系表-${String(p + 1).padStart(3, '0')}`);
  }
  let pdf = null;
  if (v.pdf) {
    const pages = [];
    for (const cv of sheets) pages.push({ width: W * 72 / 300, height: H * 72 / 300, images: [{ jpeg: await jpegOf(cv, 0.9), pw: W, ph: H, x: 0, y: 0, w: W * 72 / 300, h: H * 72 / 300 }] });
    pdf = writePdf(pages, { title: '联系表' });
    download('联系表.pdf', new Blob([pdf], { type: 'application/pdf' }));
  }
  A.status(`联系表 II：${sheets.length} 页` + (log.length ? `（${log.length} 个文件没能加入）` : ''));
  return { sheets: sheets.length, pdf, log };
}


export function installAutomate(api) {
  A = api;
  const R = (id, run, enabled, why) => actions.register(id, { run: (...a) => { run(...a); }, enabled, ...(why ? { why: () => why } : {}) });
  R('file.batch', () => batch(), () => !!A.actions);
  R('file.imageProcessor', () => imageProcessor(), () => true);
  R('file.cropAndStraighten', () => cropAndStraighten(), () => A.hasDoc(), '先打开一份扫描图（照片之间留一点空白、背景接近纯色）');
  R('file.pdfPresentation', () => pdfPresentation(), () => true);
  R('file.contactSheet', () => contactSheet(), () => true);
  const OFF = {
    'file.droplet': '快捷批处理（droplet）是本机可执行的小程序，浏览器不能生成。在本机用命令行生成：psd_editor droplet create --input steps.json（拖文件到生成的 .command / .cmd 上即可）；在浏览器里请用「文件 › 自动 › 批处理…」',
  };
  for (const [id, why] of Object.entries(OFF)) R(id, () => false, () => false, why);
  if (typeof window !== 'undefined') window.__psd_editorAutomate = Object.assign(window.__psd_editorAutomate || {}, { runBatch, runImageProcessor, cropAndStraighten, runPdfPresentation, runContactSheet, files: null });
}
