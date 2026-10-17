
import { createWorkspace, mk, section, slider, select, check, color, button, row, rgbaCanvas, drawChecker, hexToRgb, rgbToHex } from './fx-workspace.js';
import { RELIGHT_DEFAULTS, analyzeRelight, renderRelightAsync, disposeRelight } from '../../core/relight.js';


const LIGHT_TEMPERATURES = [
  [1000, '1000K · 烛光', [218, 118, 17]], [2000, '2000K · 暖光', [225, 158, 52]],
  [3200, '3200K · 钨丝灯', [235, 192, 113]], [4300, '4300K · 暖白', [246, 221, 168]],
  [5500, '5500K · 中性', [255, 255, 255]], [6500, '6500K · 日光', [230, 233, 242]],
  [7500, '7500K · 冷光', [212, 221, 237]], [9000, '9000K · 蓝光', [169, 203, 239]],
  [10000, '10000K · 深蓝', [118, 173, 240]],
];
const PROCESSING_HINTS = ['正在计算光影…', '正在寻找光源…', '正在整理明暗层次…', '正在调整光线方向…', '正在描绘表面细节…'];

export function openRelight({ rgba, w, h, title = '', coverage = null, isCurrent = () => true }) {
  const ws = createWorkspace({ title: '重新打光' + (title ? ' — ' + title : ''), width: w, height: h, rightWidth: 294,
    tools: [{ id: 'light', label: '移动光源', key: 'L', glyph: '☀' }], onKey: ev => {
      if (!ready || applying || ev.type !== 'keydown' || /INPUT|SELECT/.test(ev.target?.tagName)) return;
      const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (steps[ev.key]) { const d = steps[ev.key], s = ev.shiftKey ? 0.1 : 0.02;
        lights[active].x = clamp(lights[active].x + d[0] * s, -2, 2);
        lights[active].y = clamp(lights[active].y + d[1] * s, -2, 2); syncLight(); schedule(); return true; }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { removeLight(); return true; }
    } });
  ws.dlg.classList.add('relight-dlg'); ws.dlg.setAttribute('aria-label', '重新打光');
  ws.view.dataset.relightCanvas = '';
  ws.dlg.dataset.phase = 'loading';
  const k = Math.min(1, 512 / Math.max(w, h)), pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
  const original = rgbaCanvas(rgba, w, h), source = mk('canvas', { width: pw, height: ph });
  source.getContext('2d').drawImage(original, 0, 0, pw, ph);
  original.width = original.height = 1;
  const small = k < 1 ? source.getContext('2d').getImageData(0, 0, pw, ph).data : new Uint8ClampedArray(rgba);
  
  const smallCov = coverage ? new Uint8Array(pw * ph) : null;
  if (smallCov) for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++)
    smallCov[y * pw + x] = coverage[Math.min(h - 1, Math.floor((y + 0.5) * h / ph)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / pw))];
  const dk = Math.min(1, 256 / Math.max(pw, ph)), dw = Math.max(1, Math.round(pw * dk)), dh = Math.max(1, Math.round(ph * dk));
  const dragSource = mk('canvas', { width: dw, height: dh }); dragSource.getContext('2d').drawImage(source, 0, 0, dw, dh);
  const dragPixels = dk < 1 ? dragSource.getContext('2d').getImageData(0, 0, dw, dh).data : small;
  const dragCov = coverage ? new Uint8Array(dw * dh) : null;
  if (dragCov) for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++)
    dragCov[y * dw + x] = coverage[Math.min(h - 1, Math.floor((y + 0.5) * h / dh)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / dw))];
  const previewCanvas = rgbaCanvas(small, pw, ph);
  const params = { originalLighting: RELIGHT_DEFAULTS.originalLighting, blend: 1 }, lights = [{ ...RELIGHT_DEFAULTS, temperature: 5500, color: [...RELIGHT_DEFAULTS.color] }];
  let maps = null, active = 0, ended = false, applying = false, ready = false, dragging = false, preview = true, showLights = true, view = 'result', split = 0.5;
  let holdingOriginal = false;
  let renderRaf = 0, diagnostic = null, diagnosticKind = '', previewBusy = false, revision = 0, interacting = false, needsPreview = false, previewFrames = 0;
  const analysisEvents = [];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const settings = (quality = 'idle') => ({ ...params, quality, lights: lights.map(l => ({ ...l, color: [...l.color] })) });
  const blendCoverage = (out, base, cov) => {
    if (!cov) return out;
    for (let i = 0; i < cov.length; i++) { const c = cov[i] / 255, o = i * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = c === 0 ? base[o + ch] : Math.round(base[o + ch] + (out[o + ch] - base[o + ch]) * c);
      out[o + 3] = base[o + 3]; }
    return out;
  };
  const status = mk('div', { textContent: PROCESSING_HINTS[0] }, 'line-height:1.6;opacity:.8;white-space:pre-wrap;min-height:26px');
  status.dataset.relightStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const setStatus = s => { status.textContent = s; ws.setStatus(s); };
  let hintTimer = 0, hintIndex = -1;
  function stopHints() { clearInterval(hintTimer); hintTimer = 0; }
  function startHints() {
    stopHints();
    const next = () => { const step = 1 + Math.floor(Math.random() * (PROCESSING_HINTS.length - 1)); hintIndex = (hintIndex + step) % PROCESSING_HINTS.length;
      setStatus(PROCESSING_HINTS[hintIndex]);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) status.animate?.([{ opacity: 0.3, transform: 'translateY(3px)' }, { opacity: 0.8, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' }); };
    next(); hintTimer = setInterval(next, 1100);
  }
  const finish = v => { if (ended) return; ended = true; stopHints(); cancelAnimationFrame(renderRaf); clearInterval(watch); disposeRelight(); ws.finish(v); };
  ws.onCancel = () => finish(null);

  check(ws.bar, '预览', true, v => { preview = v; ws.draw(); }).el.querySelector('input').dataset.relightPreview = '';
  check(ws.bar, '显示光源', true, v => { showLights = v; ws.draw(); });
  const viewCtl = select(ws.bar, '视图', view, [['compare', '前后对比'], ['result', '打光结果'], ['original', '原图'], ['depth', '深度'], ['normals', '法线']], v => { view = v; ws.draw(); });
  viewCtl.sel.dataset.relightView = '';
  const compareButton = button(ws.bar, '按住看原图', () => {});
  compareButton.onpointerdown = e => { compareButton.setPointerCapture(e.pointerId); holdingOriginal = true; ws.draw(); };
  compareButton.onpointerup = compareButton.onpointercancel = () => { holdingOriginal = false; ws.draw(); };
  compareButton.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); holdingOriginal = true; ws.draw(); } };
  compareButton.onkeyup = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); holdingOriginal = false; ws.draw(); } };
  compareButton.onblur = () => { holdingOriginal = false; ws.draw(); };
  button(ws.bar, '适合窗口', () => ws.fit());
  ws.bar.append(mk('span', { textContent: '拖动光源调整位置 · 拖动中线对比 · 空格拖动平移' }, 'opacity:.65;font-size:11px'));
  ws.right.append(status);
  const retry = button(ws.right, '重试', () => { retry.hidden = true; startAnalysis(); }); retry.hidden = true;
  section(ws.right, '光源');
  const lightBar = row(ws.right), lightList = mk('select', { 'ariaLabel': '当前光源' }, 'flex:1;min-width:0'); lightBar.append(lightList);
  lightList.onchange = () => { active = +lightList.value; syncLight(); ws.draw(); };
  const add = button(lightBar, '+ 添加', () => { if (lights.length >= 3) return;
    const previousLight = lights.at(-1);
    lights.push({ ...RELIGHT_DEFAULTS, temperature: 5500, x: -previousLight.x, y: previousLight.y * 0.6, color: [...RELIGHT_DEFAULTS.color] });
    active = lights.length - 1; syncLight(); schedule(); });
  const remove = button(lightBar, '移除', () => removeLight());
  function removeLight() { if (!ready || lights.length <= 1 || applying) return; lights.splice(active, 1); active = Math.min(active, lights.length - 1); syncLight(); schedule(); }
  const lightEnabled = check(ws.right, '开启当前光源', true, v => { lights[active].enabled = v; schedule(); });
  button(ws.right, '重置当前光源', () => { lights[active] = { ...RELIGHT_DEFAULTS, temperature: 5500, color: [...RELIGHT_DEFAULTS.color] }; syncLight(); schedule(); });
  const controls = {};
  const lightSlider = (key, label, value, min, max, step, convert = v => v) => {
    const ctl = slider(ws.right, label, value, min, max, step, (v, done) => { interacting = !done; lights[active][key] = convert(v); schedule(); });
    ctl.el.querySelector('input[type=range]').setAttribute('aria-label', label);
    ctl.el.querySelector('input[type=number]').setAttribute('aria-label', label + '数值');
    controls[key] = ctl; return ctl;
  };
  lightSlider('x', '水平位置', lights[0].x * 100, -200, 200, 1, v => v / 100);
  lightSlider('y', '垂直位置', lights[0].y * 100, -200, 200, 1, v => v / 100);
  lightSlider('depth', '近远位置', lights[0].depth * 100, 0, 100, 1, v => v / 100);
  lightSlider('intensity', '光照强度', lights[0].intensity, 0, 100, 1).el.querySelector('input[type=range]').dataset.relightStrength = '';
  lightSlider('diffusion', '光源扩散', lights[0].diffusion, 0, 100, 1);
  const temperatureCtl = select(ws.right, '色温', '5500', [...LIGHT_TEMPERATURES.map(([k, label]) => [String(k), label]), ['custom', '自定颜色']], v => {
    const preset = LIGHT_TEMPERATURES.find(([k]) => String(k) === v);
    lights[active].temperature = preset ? preset[0] : null;
    if (preset) { lights[active].color = [...preset[2]]; colorCtl.set(rgbToHex(preset[2])); schedule(); }
  });
  const colorCtl = color(ws.right, '光源颜色', rgbToHex(lights[0].color), (v, done) => { interacting = !done; lights[active].temperature = null; temperatureCtl.set('custom'); lights[active].color = hexToRgb(v); schedule(); });
  colorCtl.el.querySelector('input').setAttribute('aria-label', '光源颜色');
  function syncLight() {
    if (lightList.options.length !== lights.length) lightList.replaceChildren(...lights.map((_, i) => mk('option', { value: i, textContent: '光源 ' + (i + 1) })));
    lightList.value = active; add.disabled = !ready || lights.length >= 3; remove.disabled = !ready || lights.length <= 1;
    const l = lights[active]; for (const key of ['x', 'y', 'depth']) controls[key].set(l[key] * 100);
    controls.intensity.set(l.intensity); controls.diffusion.set(l.diffusion); colorCtl.set(rgbToHex(l.color));
    lightEnabled.set(l.enabled !== false);
    temperatureCtl.set(l.temperature == null ? 'custom' : String(l.temperature));
  }
  section(ws.right, '整体光照');
  for (const [key, label, max] of [['originalLighting', '原始光照', 100]]) {
    const c = slider(ws.right, label, params[key], 0, max, 1, (v, done) => { interacting = !done; params[key] = v; schedule(); });
    c.el.querySelector('input[type=range]').setAttribute('aria-label', label);
    c.el.querySelector('input[type=number]').setAttribute('aria-label', label + '数值');
  }
  ws.right.append(mk('div', { textContent: '单击图片放置光源；方向键微调。「原始光照」控制保留多少原有光线；「近远位置」控制光源在场景中的距离。' }, 'opacity:.6;line-height:1.6;margin-top:5px'));
  if (coverage) ws.right.append(mk('div', { textContent: '仅应用于当前选区，保留透明度与羽化边缘。' }, 'opacity:.7;line-height:1.6'));
  ws.right.append(mk('div', {}, 'flex:1'));
  const buttons = row(ws.right, 'justify-content:flex-end');
  const cancel = button(buttons, '取消', () => finish(null)); cancel.dataset.relightCancel = '';
  const apply = button(buttons, '应用', async () => {
    if (!ready || !maps || applying || ended) return;
    if (!isCurrent()) { finish(null); return; }
    applying = true; setReady(false); cancelAnimationFrame(renderRaf); renderRaf = 0; ws.dlg.dataset.phase = 'rendering'; startHints();
    try {
      const out = await renderRelightAsync(rgba, w, h, maps, settings('final'));
      if (ended) return;
      if (!isCurrent()) { finish(null); return; }
      finish(blendCoverage(out, rgba, coverage));
    } catch (e) { if (ended) return; applying = false;
      stopHints(); ws.dlg.dataset.error = String(e?.message || e); setReady(true); ws.dlg.dataset.phase = 'ready'; setStatus('光影计算暂时失败，请重试。'); }
  }, { primary: true });
  apply.dataset.relightApply = ''; apply.disabled = true; ws.onEnter = () => apply.click();

  function setReady(value) {
    ready = value; ws.dlg.dataset.ready = String(value); ws.dlg.setAttribute('aria-busy', String(!value));
    for (const el of ws.dlg.querySelectorAll('input, select, button')) el.disabled = !value && el !== cancel && el !== retry;
    if (!value) ws.space = false;
    ws.view.style.pointerEvents = value ? '' : 'none'; ws.mid.style.cursor = !value ? 'progress' : ws.tool === 'hand' ? 'grab' : ws.tool === 'zoom' ? 'zoom-in' : 'crosshair';
    apply.disabled = !value; syncLight();
  }
  ws.dlg.addEventListener('keydown', ev => {
    if (ready || ev.key === 'Escape' || ev.key === 'Tab' || ev.target === cancel || ev.target === retry) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
  }, true);
  ws.mid.addEventListener('wheel', ev => { if (!ready) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, { capture: true, passive: false });

  async function renderPreview() {
    if (!maps || ended || applying || previewBusy) return false;
    previewBusy = true; needsPreview = false; const currentRevision = revision, started = performance.now();
    const quality = interacting || dragging === 'light' ? 'drag' : 'idle', quick = quality === 'drag';
    const pixels = quick ? dragPixels : small, width = quick ? dw : pw, height = quick ? dh : ph;
    try { const out = blendCoverage(await renderRelightAsync(pixels, width, height, maps, settings(quality)), pixels, quick ? dragCov : smallCov);
      if (ended || applying) return false;
      if (out.renderBackend) ws.dlg.dataset.renderer = out.renderBackend;
      if (previewCanvas.width !== width || previewCanvas.height !== height) { previewCanvas.width = width; previewCanvas.height = height; }
      previewCanvas.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0);
      ws.dlg.dataset.previewFrames = String(++previewFrames); ws.dlg.dataset.previewMs = String(Math.round(performance.now() - started));
      ws.dlg.dataset.previewQuality = quality; ws.dlg.dataset.previewRevision = String(currentRevision);
      if (ready) ws.draw(); else ws.drawNow(); return true; }
    catch (e) { if (!ended && !applying) { ws.dlg.dataset.error = String(e?.message || e); if (ready) setStatus('预览暂时失败，请重试。'); } return false; }
    finally { previewBusy = false; if (!ended && !applying && (needsPreview || currentRevision !== revision)) {
      cancelAnimationFrame(renderRaf); renderRaf = 0; renderPreview();
    } }
  }
  function requestPreviewFrame() { if (!renderRaf && !ended && !applying) renderRaf = requestAnimationFrame(() => { renderRaf = 0; if (!previewBusy && needsPreview) renderPreview(); }); }
  function schedule() { revision++; needsPreview = true; requestPreviewFrame(); ws.draw(); }
  function mapCanvas(kind) {
    if (!maps) return source;
    if (diagnostic && diagnosticKind === kind) return diagnostic;
    const n = maps.width * maps.height, px = new Uint8ClampedArray(n * 4);
    const near = maps.scene?.near ?? 0, far = maps.scene?.far ?? 1;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) px[i * 4 + c] = kind === 'depth' ? clamp((maps.depth[i] - near) / Math.max(1e-6, far - near), 0, 1) * 255 : (maps.normals[i * 3 + c] * (c === 0 ? 1 : -1) + 1) * 127.5;
      px[i * 4 + 3] = 255;
    }
    diagnosticKind = kind; diagnostic = rgbaCanvas(px, maps.width, maps.height); return diagnostic;
  }
  ws.redraw = ctx => {
    ctx.save(); ctx.translate(ws.tx, ws.ty); ctx.scale(ws.scale, ws.scale);
    
    ctx.save(); ctx.scale(w / pw, h / ph); drawChecker(ctx, 0, 0, pw, ph); ctx.restore();
    if (!preview || holdingOriginal || !maps || view === 'original') ctx.drawImage(source, 0, 0, w, h);
    else {
      if (view === 'depth' || view === 'normals') ctx.drawImage(mapCanvas(view), 0, 0, w, h);
      else if (view === 'compare') {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * split, h); ctx.clip(); ctx.drawImage(source, 0, 0, w, h); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(w * split, 0, w * (1 - split), h); ctx.clip(); ctx.drawImage(previewCanvas, 0, 0, w, h); ctx.restore();
      }
      else ctx.drawImage(previewCanvas, 0, 0, w, h);
    }
    ctx.restore();
    if (preview && !holdingOriginal && maps && view === 'compare') {
      const p = ws.toScreen(w * split, 0), b = ws.toScreen(0, h);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, b.y); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(p.x - 22, (p.y + b.y) / 2 - 12, 44, 24);
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('↔', p.x, (p.y + b.y) / 2 + 5);
      ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('原图', ws.tx + 10, ws.ty + 20); ctx.fillText('打光结果', p.x + 10, ws.ty + 20);
    }
    if (showLights && !holdingOriginal && view !== 'depth' && view !== 'normals' && view !== 'original') lights.forEach((l, i) => {
      const p = ws.toScreen((l.x + 1) * 0.5 * w, (l.y + 1) * 0.5 * h); ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = l.enabled === false ? '#777' : rgbToHex(l.color); ctx.fill(); ctx.lineWidth = i === active ? 3 : 1; ctx.strokeStyle = i === active ? '#fff' : '#777'; ctx.stroke();
      ctx.fillStyle = '#222'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i + 1, p.x, p.y + 4);
    });
  };
  ws.onDown = (ev, p) => {
    if (!ready || applying) return;
    const hit = lights.findIndex(l => Math.hypot((p.x - (l.x + 1) * 0.5 * w) * ws.scale, (p.y - (l.y + 1) * 0.5 * h) * ws.scale) <= 18);
    if (hit >= 0 && showLights) { active = hit; dragging = 'light'; syncLight(); ws.draw(); return; }
    if (view === 'compare' && Math.abs((p.x - split * w) * ws.scale) <= 12) { dragging = 'split'; return; }
    if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) return;
    dragging = 'light'; lights[active].x = p.x / w * 2 - 1; lights[active].y = p.y / h * 2 - 1; syncLight(); schedule();
  };
  ws.onMove = (ev, p) => {
    if (!ready || applying) return;
    if (dragging === 'split') { split = clamp(p.x / w, 0.02, 0.98); ws.draw(); }
    else if (dragging === 'light') { lights[active].x = clamp(p.x / w * 2 - 1, -2, 2); lights[active].y = clamp(p.y / h * 2 - 1, -2, 2); syncLight(); schedule(); }
  };
  ws.onUp = () => { const movedLight = dragging === 'light'; dragging = false; if (movedLight) schedule(); };
  
  const watch = setInterval(() => { if (!isCurrent()) finish(null); }, 250);
  async function startAnalysis() {
    setReady(false); maps = null; interacting = false; dragging = false; needsPreview = false;
    cancelAnimationFrame(renderRaf); renderRaf = 0; ws.dlg.dataset.phase = 'loading'; delete ws.dlg.dataset.error; startHints();
    analysisEvents.length = 0; delete ws.dlg.dataset.models; delete ws.dlg.dataset.modelCount; delete ws.dlg.dataset.faceInference; delete ws.dlg.dataset.faceCount;
    const started = performance.now();
    try {
      maps = await analyzeRelight(rgba, w, h, p => { if (ended) return;
        const lastEvent = analysisEvents.at(-1);
        if (!lastEvent || lastEvent.stage !== p.stage || lastEvent.model !== p.model || p.progress === 1) {
          analysisEvents.push({ stage: p.stage, model: p.model, backend: p.backend, completed: p.completed, total: p.total });
          ws.dlg.dataset.analysisEvents = JSON.stringify(analysisEvents);
        }
        if (p.stage === 'analyze' || p.stage === 'geometry') ws.dlg.dataset.phase = 'analyzing';
        else if (p.stage === 'model') ws.dlg.dataset.phase = 'loading';
      });
      if (ended) return;
      if (!Array.isArray(maps.models) || maps.models.length !== 3) throw new Error('三模型分析尚未完成，请重试');
      ws.dlg.dataset.models = JSON.stringify(maps.models);
      ws.dlg.dataset.modelCount = '3';
      ws.dlg.dataset.faceInference = JSON.stringify(maps.faceInference);
      ws.dlg.dataset.faceCount = String(maps.faceInference?.faceCount ?? 0);
      ws.dlg.dataset.analysisMs = String(Math.round(performance.now() - started));
      ws.dlg.dataset.phase = 'previewing';
      if (!await renderPreview()) { if (ended) return; throw new Error('打光预览尚未就绪，请重试'); }
      if (ended) return;
      stopHints(); setReady(true); ws.dlg.dataset.phase = 'ready'; setStatus('光影已就绪');
    } catch (e) { if (ended) return; stopHints(); ws.dlg.dataset.error = String(e?.message || e); ws.dlg.dataset.phase = 'error'; ws.dlg.setAttribute('aria-busy', 'false'); setStatus('光影计算暂时失败，请重试。'); retry.hidden = false; }
  }
  syncLight(); ws.open(); startAnalysis(); return ws.done;
}
