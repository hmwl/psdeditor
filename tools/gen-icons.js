



















import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'web', 'assets', 'icons');
const OUT = path.join(ROOT, 'web', 'editor', 'ps-icons.js');
const checkOnly = process.argv.includes('--check');

const map = JSON.parse(fs.readFileSync(path.join(SRC, 'map.json'), 'utf8'));



const SQUARE_INK_FIT = 0.841;




function parseStyles(svg) {
  const out = {};
  for (const [, css] of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [, cls, body] of css.matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g)) {
      const decl = (out[cls] ||= {});
      for (const part of body.split(';')) {
        const i = part.indexOf(':'); if (i < 0) continue;
        decl[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      }
    }
  }
  return out;
}









const WHITE = /^#(fff|ffffff|fafafa|f0f0f0)$/;
function fillKind(v) {
  const s = String(v).trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s === '#f0f') return 'none';   
  if (s.startsWith('var(--iconbackground')) return 'bg';
  if (WHITE.test(s)) return 'white';
  return 'ink';
}

function normFill(v, whiteIsInk) {
  const k = fillKind(v);
  if (k === 'none') return 'none';
  if (k === 'bg') return 'var(--icon-bg,#323232)';
  if (k === 'white') return whiteIsInk ? 'currentColor' : 'var(--icon-bg,#323232)';
  return 'currentColor';
}

const ATTR_FROM_CSS = ['fill', 'fill-rule', 'fill-opacity', 'opacity', 'stroke', 'stroke-width'];










const GEOM_ATTRS = /\s(d|points|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|transform|stroke-width)="([^"]*)"/g;
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
function roundNums(v) {
  let out = '', last = 0, m;
  NUM.lastIndex = 0;
  while ((m = NUM.exec(v))) {
    out += v.slice(last, m.index);
    let n = +(+m[0]).toFixed(3);
    if (!Number.isFinite(n)) { out += m[0]; last = m.index + m[0].length; continue; }
    if (Object.is(n, -0)) n = 0;
    let t = String(n).replace(/^(-?)0\./, '$1.');
    const prev = out.slice(-1);
    if (prev && /[\d.]/.test(prev) && /^[\d.]/.test(t)) out += ' ';
    out += t;
    last = m.index + m[0].length;
  }
  return out + v.slice(last);
}
function shrinkNumbers(body) {
  return body.replace(GEOM_ATTRS, (_, k, v) => ` ${k}="${roundNums(v)}"`);
}

function normalizeSvg(text, name, { keepColors = false } = {}) {
  const styles = parseStyles(text);
  let s = text
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '');

  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>/.exec(s);
  if (!m) throw new Error(`${name}: 不像一份 SVG`);
  let [, rootAttrs, body] = m;

  const vbm = /viewBox="([^"]+)"/.exec(rootAttrs);
  if (!vbm) throw new Error(`${name}: 缺 viewBox`);
  let [vx, vy, vw, vh] = vbm[1].trim().split(/[\s,]+/).map(Number);

  
  body = body.replace(/<([a-zA-Z]+)\b([^>]*)>/g, (whole, tag, attrs) => {
    
    
    const selfClose = /\/\s*$/.test(attrs);
    if (selfClose) attrs = attrs.replace(/\/\s*$/, '');
    const cm = /\sclass="([^"]*)"/.exec(attrs);
    let extra = '';
    if (cm) {
      const decl = {};
      for (const cls of cm[1].split(/\s+/)) Object.assign(decl, styles[cls] || {});
      for (const k of ATTR_FROM_CSS) {
        if (decl[k] === undefined) continue;
        if (new RegExp(`\\s${k}="`).test(attrs)) continue;   
        extra += ` ${k}="${decl[k]}"`;
      }
      attrs = attrs.replace(/\sclass="[^"]*"/, '');
    }
    return `<${tag}${attrs}${extra}${selfClose ? ' /' : ''}>`;
  });

  
  const whiteIsInk = ![...body.matchAll(/\sfill="([^"]*)"/g)].some(mm => fillKind(mm[1]) === 'ink');
  
  
  
  body = body
    .replace(/\sfill="([^"]*)"/g, (_, v) => keepColors ? ` fill="${v}"` : ` fill="${normFill(v, whiteIsInk)}"`)
    .replace(/\sfill:\s*[^;"]*;?/g, '')
    .replace(/\s(?:id|data-name|class|style)="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  body = shrinkNumbers(body);

  







  if (vw !== vh) {
    const side = Math.max(vw, vh) * SQUARE_INK_FIT;
    vx -= (side - vw) / 2; vy -= (side - vh) / 2; vw = vh = side;
  }
  return { vb: [vx, vy, vw, vh].map(n => +n.toFixed(3)).join(' '), body };
}



function loadIcon(key, def) {
  const src = typeof def === 'string' ? def : def.src;
  const flipX = typeof def === 'object' && !!def.flipX;
  const svgPath = path.join(SRC, 'svg', src + '.svg');
  if (fs.existsSync(svgPath)) {
    const o = normalizeSvg(fs.readFileSync(svgPath, 'utf8'), src);
    if (flipX) {
      const [vx, vy, vw] = o.vb.split(' ').map(Number);
      o.body = `<g transform="translate(${+(2 * vx + vw).toFixed(3)},0) scale(-1,1)">${o.body}</g>`;
    }
    
    return { src, vb: o.vb, body: o.body.replace(/ fill="currentColor"/g, '') };
  }
  const pngPath = path.join(SRC, 'png', src + '.png');
  if (fs.existsSync(pngPath)) {
    return { src, png: 'data:image/png;base64,' + fs.readFileSync(pngPath).toString('base64') };
  }
  throw new Error(`图标 ${key}：${SRC} 下找不到 ${src}.svg / ${src}.png`);
}

const tool = {}, ui = {}, cursor = {};
for (const [k, v] of Object.entries(map.tool)) tool[k] = loadIcon(k, v);
for (const [k, v] of Object.entries(map.ui)) ui[k] = loadIcon(k, v);
for (const [k, v] of Object.entries(map.cursor)) {
  const p = path.join(SRC, 'cursor', v + '.svg');
  if (fs.existsSync(p)) {
    
    const o = normalizeSvg(fs.readFileSync(p, 'utf8'), v, { keepColors: true });
    cursor[k] = { src: v, vb: o.vb, body: o.body, ink: map.cursorInk?.[k] || null };
    continue;
  }
  


  if (fs.existsSync(path.join(SRC, 'svg', v + '.svg'))) {
    cursor[k] = { ...loadIcon(k, v), ink: map.cursorInk?.[k] || null };
    continue;
  }
  throw new Error(`光标 ${k}：${SRC}/cursor 与 ${SRC}/svg 下都找不到 ${v}.svg`);
}



for (const [k, v] of Object.entries(map.cursorPng || {})) {
  const p = path.join(SRC, 'cursor', v.src + '.png');
  if (!fs.existsSync(p)) throw new Error(`位图光标 ${k}：${SRC}/cursor 下找不到 ${v.src}.png`);
  cursor[k] = { src: v.src, png: 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'), hx: v.hx, hy: v.hy };
}






{
  const ICONS = path.join(ROOT, 'web/editor/icons.js');
  const src = fs.readFileSync(ICONS, 'utf8');
  if (src.indexOf('const CURSORS = {') < 0) throw new Error('web/editor/icons.js 里找不到 CURSORS 表（改过结构就同步改这条检查）');
  



  const table = src;
  


  const missing = Object.keys(map.cursorPng || {}).filter(k =>
    !new RegExp('(^|[{,\\s])' + k + '\\s*:|[\'"]' + k + '[\'"]').test(table));
  if (missing.length) {
    throw new Error(`位图光标 ${missing.join('、')} 在 map.json 里登记了，但 web/editor/icons.js 的 CURSORS 表里没有 —— `
      + `toolCursor() 会返回空串（光标静默失效）。去 CURSORS 里补一行 artCursor('名字', '回退值')。`);
  }
}



const j = o => JSON.stringify(o, null, 0);
const lines = [];
lines.push('export const PS_TOOL_ICONS = ' + j(tool) + ';');
lines.push('');
lines.push('export const PS_UI_ICONS = ' + j(ui) + ';');
lines.push('');
lines.push('export const PS_CURSOR_ART = ' + j(cursor) + ';');
lines.push('');
const text = lines.join('\n');

if (checkOnly) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.error('web/editor/ps-icons.js 与 web/assets/icons 不同步：跑 node tools/gen-icons.js'); process.exit(1); }
  console.log('图标产物同步 ✓');
} else {
  fs.writeFileSync(OUT, text);
  const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
  console.log(`写入 web/editor/ps-icons.js（${kb} KB）：工具 ${Object.keys(tool).length} / 界面 ${Object.keys(ui).length} / 光标 ${Object.keys(cursor).length}`);
}
