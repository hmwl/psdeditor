































const { PS_TOOL_ICONS, PS_UI_ICONS, PS_CURSOR_ART } = await import('./ps-icons.js');

const NS = 'http://www.w3.org/2000/svg';

function render(def, size, extraClass) {
  if (def && def.png) {
    const img = document.createElement('img');
    img.src = def.png;
    










    img.width = size; img.height = size;
    img.style.width = size + 'px'; img.style.height = size + 'px';
    img.style.objectFit = 'contain';
    img.alt = ''; img.draggable = false;
    img.setAttribute('aria-hidden', 'true');
    img.className = 'ps-icon ps-icon-bitmap' + (extraClass ? ' ' + extraClass : '');
    return img;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', def ? def.vb : '0 0 18 18');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ps-icon' + (extraClass ? ' ' + extraClass : ''));
  svg.innerHTML = def ? def.body : '';
  return svg;
}


export function uiIcon(name, size = 14) { return render(PS_UI_ICONS[name], size); }

export function toolIcon(name, size = 18) { return render(PS_TOOL_ICONS[name], size); }

export const psToolIcons = PS_TOOL_ICONS;
export function hasUiIcon(name) { return !!PS_UI_ICONS[name]; }
export function hasToolIcon(name) { return !!PS_TOOL_ICONS[name]; }

export const uiIconNames = () => Object.keys(PS_UI_ICONS);
export const toolIconNames = () => Object.keys(PS_TOOL_ICONS);



const dataUrl = (svg, hx, hy, fallback) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hx} ${hy}, ${fallback}`;



function artCursor(name, fallback) {
  const a = PS_CURSOR_ART[name];
  if (!a) return fallback;
  if (a.png) return `url("${a.png}") ${a.hx} ${a.hy}, ${fallback}`;
  if (!a.ink) return fallback;
  const { x, y, w, h, hx, hy } = a.ink;
  const pw = Math.round(w / 2), ph = Math.round(h / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${x} ${y} ${w} ${h}">${a.body}</svg>`;
  return dataUrl(svg, Math.round(pw * hx), Math.round(ph * hy), fallback);
}




const MARK_ART = {
  lasso: { '': 'lassoPs', add: 'lassoPsAdd', subtract: 'lassoPsSub', intersect: 'lassoPsInt' },
  poly:  { '': 'polyPs',  add: 'polyPsAdd',  subtract: 'polyPsSub',  intersect: 'polyPsInt'  },
  mag:   { '': 'magPs',   add: 'magPsAdd',   subtract: 'magPsSub',   intersect: 'magPsInt'   },
  wand:  { '': 'wandPs',  add: 'wandPsAdd',  subtract: 'wandPsSub',  intersect: 'wandPsInt'  },
  

  cross: { '': 'crossPrecise', add: 'crossAdd', subtract: 'crossSub', intersect: 'crossInt' },
  
  objRect:  { '': 'objRect',  add: 'objRectAdd',  subtract: 'objRectSub',  intersect: 'objRectInt'  },
  objLasso: { '': 'objLasso', add: 'objLassoAdd', subtract: 'objLassoSub', intersect: 'objLassoInt' },
  
  patch: { '': 'patchPs', add: 'patchPsAdd', subtract: 'patchPsSub', intersect: 'patchPsInt' },
};

const markArt = (fam, c) => MARK_ART[fam][(c && c.mark) || ''] || MARK_ART[fam][''];

const CROSS_PX = 19;      
const BADGE_PX = 12;      
const CUR_PX = 27;        


function badgeGroup(toolName, x, y, px) {
  const t = PS_TOOL_ICONS[toolName];
  if (!t || !t.body) return '';
  const [vx, vy, vw] = t.vb.split(' ').map(Number);
  const k = px / vw;
  const body = t.body.replace(/ fill="currentColor"/g, '');
  return `<g transform="translate(${x},${y}) scale(${k.toFixed(4)}) translate(${-vx},${-vy})"`
    + ` fill="#fff" stroke="#1a1a1a" stroke-width="${(1.7 / k).toFixed(2)}" stroke-linejoin="round"`
    + ` paint-order="stroke">${body}</g>`;
}

function mark(d, x = 0, y = 0, px = 8) {
  const k = px / 8;
  const tf = x || y ? ` transform="translate(${x},${y}) scale(${k.toFixed(4)})"` : '';
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round"${tf}>`
       + `<path d="${d}" stroke="#1a1a1a" stroke-width="${(3.4 / (k || 1)).toFixed(2)}"/>`
       + `<path d="${d}" stroke="#fff" stroke-width="${(1.7 / (k || 1)).toFixed(2)}"/></g>`;
}


const SEL_MARKS = {
  add:       'M1.2 4h5.6M4 1.2v5.6',
  subtract:  'M1.2 4h5.6',
  intersect: 'M1.8 1.8l4.4 4.4M6.2 1.8l-4.4 4.4',
};


function crossCursor(badge, markName, fallback, extra = '') {
  const c = PS_CURSOR_ART.cross;
  if (!c || !c.ink) return fallback;
  const k = CROSS_PX / c.ink.w;
  const x = CUR_PX - BADGE_PX;
  const corner = markName && SEL_MARKS[markName]
    ? mark(SEL_MARKS[markName], x, x, BADGE_PX)
    : badgeGroup(badge, x, x, BADGE_PX);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CUR_PX}" height="${CUR_PX}" viewBox="0 0 ${CUR_PX} ${CUR_PX}">`
    + `<g transform="scale(${k.toFixed(4)}) translate(${-c.ink.x},${-c.ink.y})">${c.body}</g>`
    + corner + extra + '</svg>';
  const h = Math.round(CROSS_PX / 2);
  return dataUrl(svg, h, h, fallback);
}





function psPair(u1, u2, hx, hy, fb){
  const hi = `-webkit-image-set(url("${u1}") 1x, url("${u2}") 2x) ${hx} ${hy}, ${fb}`;
  try { if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('cursor', hi)) return hi; } catch {}
  return `url("${u1}") ${hx} ${hy}, ${fb}`;
}
const CURSORS = {
  
  move:        () => artCursor('move', 'move'),
  moveSmall:   () => artCursor('moveSmall', 'move'),
  hand:        () => artCursor('hand', 'grab'),
  handGrab:    () => artCursor('handGrab', 'grabbing'),
  handNo:      () => artCursor('handNo', 'not-allowed'),      
  text:        () => artCursor('typeNew', 'text'),            
  textOver:    () => artCursor('typeOver', 'text'),           
  no:          () => artCursor('notAllowed', 'not-allowed'),
  wait:        () => artCursor('wait', 'wait'),          
  typekitSpinner1: () => artCursor('typekitSpinner1', 'wait'),
  typekitSpinner2: () => artCursor('typekitSpinner2', 'wait'),
  typekitSpinner3: () => artCursor('typekitSpinner3', 'wait'),
  typekitSpinner4: () => artCursor('typekitSpinner4', 'wait'),
  typekitSpinner5: () => artCursor('typekitSpinner5', 'wait'),
  typekitSpinner6: () => artCursor('typekitSpinner6', 'wait'),
  path:        () => artCursor('arrowPath', 'default'),        
  pathDirect:  () => artCursor('arrowDirect', 'default'),      
  pathCopy:    () => artCursor('copyDrag', 'copy'),            
  copyAdd:     () => artCursor('copyAdd', 'copy'),            
  cancel:      () => artCursor('cancel', 'default'),          
  pencil:      () => artCursor('pencil', 'crosshair'),
  link:        () => artCursor('link', 'pointer'),            
  pinch:       () => artCursor('pinch', 'zoom-in'),           
  
  resizeNWSE:  () => artCursor('resizeNWSE', 'nwse-resize'),  
  resizeNESW:  () => artCursor('resizeNESW', 'nesw-resize'),  
  stretchH:    () => artCursor('stretchH', 'ew-resize'),      
  stretchV:    () => artCursor('stretchV', 'ns-resize'),      
  adjustH:     () => artCursor('adjustH', 'ew-resize'),       
  adjustV:     () => artCursor('adjustV', 'ns-resize'),       
  expandRight: () => artCursor('expandRight', 'ew-resize'),   
  collapseLeft:() => artCursor('collapseLeft', 'ew-resize'),  
  brushRing:   () => artCursor('toolRing', 'crosshair'),      
  
  


  selRect:     c => artCursor(markArt('cross', c), 'crosshair'),
  selEllipse:  c => artCursor(markArt('cross', c), 'crosshair'),
  selRow:      c => artCursor(markArt('cross', c), 'crosshair'),
  selCol:      c => artCursor(markArt('cross', c), 'crosshair'),
  
  precise:     () => artCursor('crossPrecise', 'crosshair'),
  objSelRect:  c => artCursor(markArt('objRect', c), 'crosshair'),
  objSelLasso: c => artCursor(markArt('objLasso', c), 'crosshair'),
  

  lasso:       c => artCursor(markArt('lasso', c), 'crosshair'),
  lassoPoly:   c => artCursor((c && c.close) ? 'polyPsClose' : markArt('poly', c), 'crosshair'),
  lassoMagnetic: c => artCursor((c && c.close) ? 'magPsClose' : markArt('mag', c), 'crosshair'),
  wand:        c => artCursor(markArt('wand', c), 'crosshair'),
  

  crop:        () => artCursor('cropPs', 'crosshair'),
  cropPersp:   () => artCursor('cropPersp', 'crosshair'),
  
  slice:       () => artCursor('sliceKnife', 'crosshair'),
  sliceSelect: () => artCursor('sliceSelectPs', 'default'),
  
  artboard:    () => {
    const u1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACr0lEQVR42u1WPWsUURQ9Z958rgspNoR0ksIiiiCkCYlJujT2ETu1SecP0D9gbWdnn+AHaiOkTClbWARWZZEkLFM4YUmxs/M+rs1sGEM+191C2AOPN8y7j3fm3HvPG+AMiAhFhMaYjSzLdo0xG4N3GDG8sw4nKQCCTqezurCwcK/T6awCCEjKqEl4Fy1qraXb7QZaa8GYcCEBkuL7visVGQv8gex/n3tyYGitVQDCcgEAKCLnEh6KwKmNg2ejtd6r1+uF1noPgBERkHQjl0FEEhGJy5GIiA8ArVYrOjw8fN5qtaIyzq/EJpURi0gyVAqMMRtpmj4REQ+AE5HQWvsrTdNnMzMzCkAOIE7TNDg4OHillLoJQAPgqVqh1vq17/vvrpMO/+jo6MHi4uL9Xq8XlfIzSZKl3d3d7wDyPM+n4jh+aoyJV1ZWHvV6PVWtAZJwzkEpxWaz+XN2dvYTyaLSzhcTmJ6e/rCzs9O21loREc/zwm63+w3AZwBRHMePAbwB0N/e3v4xNTV11zlXKKXonEO9Xpf9/f1b6+vrD4uiMNdOAcm3IvKxUnwkqQGg3W67MAyToih6c3NzOYAtEXk/UKqcQwAvoyiic45D+QBJTdKUQ5et5mmtN5eXl19orTfLGmElVpM0AHSe5+e25lBWXH6ZHwTB/PHxcRgEwXzZsidWXPEOlv4weicEUHie5wAUY3XCi9y4Mg9uw4HcJ/M4CQAAnHMCwJRtJVXHFBFTro+HAEnUajUF4IaI6DNCglqtpoatg8sIiLWWWZYt+b6/1e/34XleVRlEUYQsy2astayoMxoCSZIoknZtbe22UurOWa1GEtZaIWmTJFH/TKDy12MajcaXZrP5u9/vF5cUm0RRFDYaja/lrcmr3gWXJk5EgitKe+KgE0wwwQQT/Ff4AwvhiZ3KN9NUAAAAAElFTkSuQmCC', u2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABjElEQVR42u2ZMU7DQBBF30TuEBSIIJRDpIig5wI06ehTcAtyBmp6utwgV6BIwwVQCiLRUVEMRSaSZQXZsbGRs/9JW+zIu9r93h3PjKEB7j5z92W0GT1k0GTzwCjmGACjPoqQNRg7BjIzuw1B3oCLZE7AsSABJIAEkAASQALU4xPwfGwUtmQEWACbXH8TtjQiQTNbASt33/Xn8gE9JMslNvclz34Br1XftLvPgQlwUnNtL2b23PoJ2JPV/dZOY0NVmcSYQc3WSXaZFbO6im+21G5mdw1rDZ1kl/IBwCqOW9nddmBdvJe7cUXf4O7vcbWs4lquYp6HTr8CsaE18F3S1oc4pQPm3TX/t69AW972kHnd/YlmFSr5gE4jQXcfA1Mze4w+wCIixCQiwSkwzPWHYUsmFD4veHgLm3IBCSABJIAEkAASQAJIgKPOBfZwEznBsub4s74L0MtT9WcCmNm1fEBiPqBqLbF2yYFtSa1VrNEKt3X7y5bW9tHFjxEhhBBCCCGEEEIIIYQQQqTDD1mRiNO0XFvxAAAAAElFTkSuQmCC';
    const hi = `-webkit-image-set(url("${u1}") 1x, url("${u2}") 2x) 8 8, crosshair`;   
    try { if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('cursor', hi)) return hi; } catch {}
    return `url("${u1}") 8 8, crosshair`;
  },
  
  abDrag:      () => psPair('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAp0lEQVR42uzVTQ2AMAwFYNogAiEIwMDUYAAVGMEAAlCCCMYbfyELcKPv0ibLSHd435YtSIyxK/Y6Z9NSjEpEBswjC7BgTEC0DITevimIC4C7QEHcT4CC0LxhjdCnpiVC3xasEPq1aIEon5oIzFsJUQOUEM2vgCM8hYVsKfxxCuVHeGf6DBnh+SU0D982jtAe88z6Jcvx1GilBbkc4AAHOMABDnDAKsAA0RJGVm7m6EUAAAAASUVORK5CYII=', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAoVJREFUeJztmb9rE2Ech59vUNBB3QQLWn9jg5LOLl39AzK5GJLJP8JVURDsYhE1ppsIVwVB3cXJJfkDpEp1EtRWUBHh43AJnk1yV21y3yb3PnBD7nIvn8+T997jLgYg6QnwAbhiZp8YEZJGNdTYKEmqAfuAMnBL0infSPlSAuaAl9Vq1YAjwDVJp31j5UcJ2Avsj6JooVqtAswSSyjETCgBAvYARFG00Gg0fvJnJpz0DJcHpc07ms3m+a6EWeCGpGP5x8qPPgHwl4TDwM1pngl9AlqtFtAn4bqk4/lGywlJi5JuE68FkqRWq6Xe53q9/krSa0mRpBP/OPaO3wYKyJCw5Vukd7ltCUiRsCLpTCEEZEiYK4SADAnlQgjIkHC2EAJSJESSzhVCQIqElUESvMuNRUCKhEib1gTvcmMTkCLhsRK3SO9yYxWQIaE8VQKSRdO2SqXyXNKSpKuSDnmX28o28GkwyfLyMrVaLetrAHQ6nQvz8/NHgQPAxS2d5MyutIPJ8pVK5UW73X4LfAfWh5xixLPhF/FL1h3PUAEDyq8Sl/9IXHIQvRm1amYPpZ3/VniggCHlvwD3zexNfvHGT98aMKT8V+DBtJUHMEmLwG4zu5w8kCi/Adz9n/ITewkkyq8D96bxl+/RJ2DTNb9kZmv5x8qPnoAfADMzM0/b7fZ74DNwZ9rLQ7wGXCL+D8C6+74Bj8zs3XYHn4Q1wAC6Eg4Ca8AzM9sYxeATIWASQo6TzGeBaScI8A7gTRDgHcCbIMA7gDdBgHcAb4IA7wDeBAHeAbwJArwDeBMEeAfwJgjwDuBNEOAdwJsgwDuAN0GAdwBvggDvAN4EAd4BvAkCvAN4U3gBvwHBQc0N1Lq0xQAAAABJRU5ErkJggg==', 1, 1, 'default'),
  abCopy:      () => psPair('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAAaZJREFUWIXtk01rE0EAht/RWQwBTx7WILsxngSVHGR/gVfBXKyFJrf8h1y0Xnr0IrQ/IAn0UDwIxT9hDoqN9hYDG/JxWKKeJAk8HuyWbbXtIdn2sg8MAzPMvA/vMAI2h8PhLrCmK8BKuuX7/qPBYHATuCbpnaTbkgqSPhljFmkL2MVi8dDzPBOG4YbrulbSvdFodL9QKLyXtJe2gCRpPp8/8DxPYRi+cF1Xvu/fTbaSWhPAjiTi4ThON4qi79VqlXw+/3U8Hu8D1VTC/ycgiWKxGLXbbQAcx+keSTy7NAFJWGuZTqcAJ5oA7LkXrkpAEuVy+Vgi0cT6pQmcI/F0ZU1cJBBLxCQknqcmUK/XvzQaDc4il8sdTiaTfeDJqgV+VCqVN8DHIAhOhJ6WtNYeAK+A8jL5x+9ojPnVbDa3a7Xab0nfOp1OkNhTqVTa7vV6A0k3EufNMuGSJOCt4zjdfr+/BVSO1nb+TiRbeQ0EwPWlQ08J1IFN4HF8eSxgjPnZarW2gJfAnZUGXyD1TytpcdZfPpjNZpGkD5I+pymQkZGRkZGRceX8AT6odR0bga1kAAAAAElFTkSuQmCC', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAA5JJREFUeJztmU9oHGUYh593acWLCj0UDbVqa0u62m7OXnr1kFv25CUh8dLcxeS0oJCeFBXaUtrGDVgsxUkEQcWTUjztZVMvCtYoba3ag/0Drljh18Ps2ulkZzKbZvfdjPPAXGa+b/b3Pt+fYWYNQNJXwG/Am2Z2AwckefwsJUlvADuBvcA7ko64JHGiBDwNfFOtVgFGgJqkw66pBkgJeAx4MgiCo20Je4G3JL3smmxAlAABjwMEQXB0ZmbmH2APoYSX4h0kfSrphKRdg43aH0rxE4uLi6+0JTwLvB2VIGkKeAIoA+9JOjCooP1inQDoKqGzJxwCLlWrVSNcKsclHRxM1D4h6QNJJwmXwkPH9PT0t5IakgJJh9tt3wU0MTHxdeTaI88ESS5HqoCYhGVJH0XbRq59IunFXAqIFfqjpI9TBL2QSwGRQn+X9NPo6GjaLNnUTBh6AYDm5uauS/pjZWVF5XJZ9Xo9ab/Yl0sBgObn5280Gg0FQSBJaRL251IAoPHxcTUaDXVIkZD5EbmtBHQkREmQsCxpNJcCAC0sLGSVcCiXAnqUUM6lgB4lJL5hbmsBPUgIlPCtYdsLADQ7O5t1JqyTkAsBPUgIFNsThl5ApVL5QtJlSc1araZaraasJEhYUeQR6SWg6/eAOJVK5ctms7kG3ANarVaLVquVpSsAk5OT1Ot14KFvDXsIvyekPh36zkYzoD3yJyUdl7QUbbvRaKcd7fuekrQg6ZmhnAGRkb8DfAjcSmu/tLTE1NRUJvGrq6uvjo2NPQ88BbyWqVMf2JF0IVL8XeCMmV2RlHijaPHtvj8DLeB2QhcjnA3/Atc3E34r6CogPvJmdiXtJl2KXyMs/iZhkd3ozL41M7uQJrefrBMQG/nzZvZD2g0Sir8FnNtI3DDQEfA3wMjIyGfNZvMa4cifN7Pv0jonFH+XDLNmWDBJrxP+JWbtc/eAZTP7Pt5Y0vvATjM7Fj0fWzJnNlO81xIomdlZ4FfCwm8Cp7sVn0Sk+NtssnhPdgC0JfRMbM2fMrOrWxluECQ+BlOI7xd/Es6abVc8PFj3mZA0CTwX6fcXcNHMfnnUIF57QE8C4D8Ju4GrwOdmdmcrgrgJ8PrhYSHT22CeKQR4B/CmEOAdwJtCgHcAbwoB3gG8KQR4B/CmEOAdwJtCgHcAbwoB3gG8KQR4B/CmEOAdwJtCgHcAbwoB3gG8KQR4B/Dmfy/gPuVW86MbkHMAAAAAAElFTkSuQmCC', 1, 1, 'copy'),
  shape:       c => (c && c.mark) ? crossCursor('rect', c.mark, 'crosshair') : artCursor('crossPrecise', 'crosshair'),
  gradient:    c => (c && c.mark) ? crossCursor('gradient', c.mark, 'crosshair') : artCursor('crossPrecise', 'crosshair'),
  bucket:      () => artCursor('bucketPour', 'crosshair'),
  

  toolRing:    () => artCursor('toolRing', 'crosshair'),
  

  moveSel:     () => artCursor('moveSel', 'move'),
  cutSel:      () => artCursor('cutSel', 'move'),
  


  eyedropper:  c => !(c && c.eye) ? artCursor('dropperTool', 'crosshair')
                    : artCursor(c.eye === 'Dark' ? 'eyedropDark'
                              : c.eye === 'Mid' ? 'eyedropMid' : 'eyedropLight', 'crosshair'),
  

  sample:      () => artCursor('samplerPs', 'crosshair'),
  sampleMove:  () => artCursor('samplerMove', 'default'),
  sampleDel:   () => artCursor('samplerDel', 'crosshair'),
  
  cloneSrc:    () => artCursor('cloneSrc', 'crosshair'),
  
  patch:       c => artCursor(markArt('patch', c), 'crosshair'),
  contentMove: () => artCursor('contentMovePs', 'crosshair'),
  redEye:      () => artCursor('redEyePs', 'crosshair'),
  

  ruler:       () => artCursor('rulerPs', 'default'),
  rulerPoint:  () => artCursor('rulerPoint', 'default'),
  rulerMove:   () => artCursor('rulerMove', 'default'),
  protractor:  () => artCursor('protractor', 'default'),
  note:        () => artCursor('notePs', 'default'),                  
  
  count:       () => artCursor('countAdd', 'default'),
  countMove:   () => artCursor('countMove', 'default'),
  countDel:    () => artCursor('countDel', 'default'),
  rotateView:  () => artCursor('rotateViewPs', 'grab'),               
  magicEraser: () => artCursor('magicEraserPs', 'crosshair'),         
  eraserBlock: () => artCursor('eraserBlock', 'crosshair'),           
  

  textV:       () => artCursor('typeVNew', 'vertical-text'),
  textVOver:   () => artCursor('typeVOver', 'vertical-text'),
  textPath:    () => artCursor('typePathH', 'text'),
  textPathV:   () => artCursor('typePathV', 'vertical-text'),
  textArea:    () => artCursor('typeAreaH', 'text'),
  textAreaV:   () => artCursor('typeAreaV', 'vertical-text'),
  
  

  moveArrow:   () => artCursor('moveArrow', 'default'),
  

  clipOn:      () => artCursor('clipOn', 'default'),
  clipOff:     () => artCursor('clipOff', 'default'),
  

  selReplace:  () => artCursor('selReplace', 'pointer'),
  selAdd:      () => artCursor('selAdd', 'pointer'),
  selSub:      () => artCursor('selSub', 'pointer'),
  selInt:      () => artCursor('selInt', 'pointer'),
  


  scrubH:      () => artCursor('scrubH', 'ew-resize'),
  
  pointer:     () => artCursor('pointer', 'pointer'),
  

  rotE:        () => artCursor('rotE', 'crosshair'),
  rotSE:       () => artCursor('rotSE', 'crosshair'),
  rotS:        () => artCursor('rotS', 'crosshair'),
  rotSW:       () => artCursor('rotSW', 'crosshair'),
  rotW:        () => artCursor('rotW', 'crosshair'),
  rotNW:       () => artCursor('rotNW', 'crosshair'),
  rotN:        () => artCursor('rotN', 'crosshair'),
  rotNE:       () => artCursor('rotNE', 'crosshair'),
  

  pen:         c => artCursor(c && c.penStart ? 'penPen' : 'penTip', 'crosshair'),
  penDrag:     () => artCursor('penBreak', 'crosshair'),
  penAnchor:   () => artCursor('penAnchor', 'crosshair'),
  penJoin:     () => artCursor('penJoin', 'crosshair'),
  penAdd:      () => artCursor('penAdd', 'crosshair'),
  penDel:      () => artCursor('penDel', 'crosshair'),
  penClose:    () => artCursor('penClose', 'crosshair'),
  penConvert:  () => artCursor('penConvert', 'crosshair'),
  penBreak:    () => artCursor('penBreak', 'crosshair'),
  
  penFree:     c => artCursor(c && c.magnetic ? 'penMagPs' : 'penFreePs', 'crosshair'),
  

  penCurv:     () => artCursor('penCurvPs', 'crosshair'),
  penCurvClose:() => artCursor('penCurvClose', 'crosshair'),
  penCurvAnchor:() => artCursor('penCurvAnchor', 'crosshair'),
  penCurvAdd:  () => artCursor('penCurvAdd', 'crosshair'),
  
  zoomIn:      () => artCursor('zoomIn',  'zoom-in'),
  zoomOut:     () => artCursor('zoomOut', 'zoom-out'),
  zoomFit:     () => artCursor('zoomFit', 'zoom-in'),          
};

const cache = Object.create(null);






export function toolCursor(name, ctx) {
  if (!CURSORS[name]) return '';
  

  const key = name + '|' + ((ctx && ctx.mark) || '') + '|' + !!(ctx && ctx.penStart) + '|' + ((ctx && ctx.eye) || '') + '|' + !!(ctx && ctx.close) + '|' + !!(ctx && ctx.magnetic);
  if (cache[key] === undefined) { try { cache[key] = CURSORS[name](ctx); } catch { cache[key] = ''; } }
  return cache[key];
}
export const cursorNames = () => Object.keys(CURSORS);
export const cursorArtNames = () => Object.keys(PS_CURSOR_ART);



const ROT8 = ['rotE', 'rotSE', 'rotS', 'rotSW', 'rotW', 'rotNW', 'rotN', 'rotNE'];
export function rotCursorName(deg){ return ROT8[((Math.round(deg / 45) % 8) + 8) % 8]; }
export function rotCursor(deg){ return toolCursor(rotCursorName(deg)); }





let rotBaseImg = null;
const rotSmoothCache = new Map();
{
  const a = PS_CURSOR_ART.rotN;
  if (a && a.png) { const img = new Image(); img.onload = () => { rotBaseImg = img; rotSmoothCache.clear(); }; img.src = a.png; }
}



export function rotCursorSmooth(deg){
  const q = (Math.round((((deg % 360) + 360) % 360) / 3) * 3) % 360;
  const hit = rotSmoothCache.get(q);
  if (hit !== undefined) return hit;
  const base = PS_CURSOR_ART.rotN;
  if (!rotBaseImg || !base) return rotCursor(deg);          
  const S = 72, C = S / 2;                                   
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return rotCursor(deg);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.translate(C, C); g.rotate((((q - 270) % 360) + 360) % 360 * Math.PI / 180);
  g.drawImage(rotBaseImg, -base.hx, -base.hy);
  const css = `url("${cv.toDataURL('image/png')}") ${C} ${C}, crosshair`;
  rotSmoothCache.set(q, css);
  return css;
}




export function injectUiCursor(){
  try {
    const set = (v, name) => { const s = toolCursor(name); if (s) document.documentElement.style.setProperty(v, s); };
    set(UI_CURSOR_VAR, 'pointer');
    set(GRAB_CURSOR_VAR, 'hand');
    set(GRABBING_CURSOR_VAR, 'handGrab');
    set(SCRUB_CURSOR_VAR, 'scrubH');
  } catch {  }
}
export const UI_CURSOR_VAR = '--ps-cursor-pointer';
export const GRAB_CURSOR_VAR = '--ps-cursor-grab';
export const GRABBING_CURSOR_VAR = '--ps-cursor-grabbing';
export const SCRUB_CURSOR_VAR = '--ps-cursor-scrub';
