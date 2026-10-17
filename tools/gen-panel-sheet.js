













import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'web', 'assets', 'icons');
const PNGDIR = path.join(SRC, 'png');
const OUT = path.join(SRC, 'panel-sheet.html');


const CELL = 16;

const map = JSON.parse(fs.readFileSync(path.join(SRC, 'map.json'), 'utf8'));


const panelsJs = fs.readFileSync(path.join(ROOT, 'web', 'editor', 'panels.js'), 'utf8');
function readTable(name) {
  const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(panelsJs);
  if (!m) throw new Error(`panels.js 里没找到 ${name}`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/([A-Za-z0-9_']+):\s*'([^']+)'/g)) out[k.replace(/'/g, '')] = v;
  return out;
}
const PANEL_ICONS = readTable('PANEL_ICONS');
const PANEL_TITLES = readTable('PANEL_TITLES');


const namesBySrc = new Map();
for (const [iconName, def] of Object.entries(map.ui)) {
  const src = typeof def === 'string' ? def : def.src;
  if (!namesBySrc.has(src)) namesBySrc.set(src, []);
  namesBySrc.get(src).push(iconName);
}
const panelsByIcon = new Map();
for (const [id, iconName] of Object.entries(PANEL_ICONS)) {
  if (!panelsByIcon.has(iconName)) panelsByIcon.set(iconName, []);
  panelsByIcon.get(iconName).push(id);
}


function pngSize(file) {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
const b64 = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');


const panelSrcs = [...namesBySrc.keys()].filter(s => /^(PL_|CxUI_)/.test(s)).sort();

const rows = panelSrcs.map(src => {
  const file = path.join(PNGDIR, src + '.png');
  if (!fs.existsSync(file)) throw new Error(`缺文件 ${file}`);
  const [w, h] = pngSize(file);
  const iconNames = namesBySrc.get(src);
  const ids = iconNames.flatMap(n => panelsByIcon.get(n) || []);
  const cn = ids.map(id => PANEL_TITLES[id] || id);
  return { src, file, w, h, iconNames, ids, cn };
});

const srcCell = r => `<code>png/${r.src}.png</code>`;
const card = r => `      <figure class="card">
        <div class="art">
          <img class="at" src="${b64(r.file)}" width="${r.w}" height="${r.h}" alt="">
          <span class="cell"><img src="${b64(r.file)}" width="${CELL}" height="${CELL}" alt=""><i></i></span>
        </div>
        <figcaption>
          <b>${r.cn.join(' / ')}</b>
          <span class="id">${r.ids.join(' / ')}</span>
          <span class="k">${r.iconNames.join(' / ')}</span>
          ${srcCell(r)}
          <span class="d">画布 ${r.w}×${r.h}（已裁到墨迹，长边＝格子 ${CELL}px）</span>
        </figcaption>
      </figure>`;


const toggleRows = ['chevron-double-left', 'chevron-double-right'].map(iconName => {
  const def = map.ui[iconName];
  const src = typeof def === 'string' ? def : def.src;
  const file = path.join(PNGDIR, src + '.png');
  const [w, h] = pngSize(file);
  const use = iconName.endsWith('left') ? '面板列／图标列「展开面板」' : '面板列／图标列「折叠为图标」';
  return `      <figure class="card">
        <div class="art">
          <img class="at" src="${b64(file)}" width="${w}" height="${h}" alt="">
          <span class="cell"><img src="${b64(file)}" width="${CELL}" height="${CELL}" alt=""><i></i></span>
        </div>
        <figcaption>
          <b>${use}</b>
          <span class="k">${iconName}</span>
          <code>png/${src}.png</code>
          <span class="d">画布 ${w}×${h}（原稿留着内边距，图形 24×20，故长边顶不到格子）</span>
        </figcaption>
      </figure>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>面板图标一览 · PSD Editor</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 32px 48px; background: #262626; color: #d6d6d6;
         font: 13px/1.55 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; color: #f0f0f0; }
  h2 { margin: 30px 0 12px; font-size: 14px; font-weight: 600; color: #e4e4e4; }
  p.lead { margin: 0 0 22px; color: #9a9a9a; max-width: 980px; }
  p.lead code, .d, code { font-family: ui-monospace, Menlo, Consolas, monospace; }
  p.lead code { color: #c8c8c8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 12px; }
  .card { margin: 0; display: flex; gap: 14px; align-items: center; padding: 12px 14px;
          background: #323232; border: 1px solid #3d3d3d; border-radius: 6px; }
  /* 左边原稿 1:1、右边实际格子：两张都用 ps-shell 的深色面板底色摆着，跟真实观感一致 */
  .art { flex: none; display: flex; align-items: center; gap: 14px; }
  .art .at { display: block; image-rendering: auto; }
  .cell { position: relative; display: block; width: ${CELL + 12}px; height: ${CELL + 12}px;
          display: grid; place-items: center; background: #2c2c2c; border-radius: 3px; outline: 1px dashed #5c5c5c; outline-offset: -1px; }
  .cell img { display: block; }
  /* 十字＝格子中心：图形重心没落在十字上就是没对齐 */
  .cell i { position: absolute; inset: 0; pointer-events: none;
            background: linear-gradient(to right, transparent calc(50% - .5px), rgba(255,0,170,.75) 0, rgba(255,0,170,.75) calc(50% + .5px), transparent 0),
                        linear-gradient(to bottom, transparent calc(50% - .5px), rgba(0,220,255,.55) 0, rgba(0,220,255,.55) calc(50% + .5px), transparent 0); }
  figcaption { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  figcaption b { font-size: 13px; font-weight: 600; color: #f0f0f0; }
  figcaption .id { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #8f8f8f; }
  figcaption .k { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #6fa8dc; }
  figcaption code { font-size: 11px; color: #8f8f8f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  figcaption .d { font-size: 11px; color: #7d7d7d; }
  footer { margin-top: 28px; color: #7d7d7d; font-size: 12px; max-width: 980px; }
  footer code { color: #b0b0b0; }
</style>
</head>
<body>
  <h1>面板图标一览（${rows.length} 张原稿 + 2 个列头按钮）</h1>
  <p class="lead">
    编辑器深色面板里用的 PS 原稿。每张卡片：左边是 <b>原稿 1:1</b>（<code>png/</code> 下已经按
    <code>tools/crop-icons.js</code> 裁到墨迹边界，画布即图形），右边是<b>图标列里的实际渲染</b>
    （虚线框＝图标格子 ${CELL}px，<span style="color:#ff6ec7">十字</span>＝格子中心）。
    <b>每张图标至少有一条边顶满格子、且重心压在十字上</b>，这就是「对齐」的判据。
  </p>
  <div class="grid">
${rows.map(card).join('\n')}
  </div>

  <h2>列头的折叠 / 展开按钮</h2>
  <p class="lead">
    面板列与图标列顶上的 <code>.col-toggle</code> 用的是 PS 原稿的一对双箭头，由
    <code>panels.js</code> 的 <code>colToggleGlyph()</code> 按状态换：收起态 « 、展开态 »。
    这两张原稿画布 36×36 而图形只占中间 24×20，所以长边顶不满 16px 的格子 —— 这是原稿自带的
    内边距，两张**一样**，不影响对齐。
  </p>
  <div class="grid">
${toggleRows}
  </div>

  <footer>
    重新生成：<code>node tools/gen-panel-sheet.js</code>（数据来自 <code>map.json</code> 与
    <code>panels.js</code> 的 <code>PANEL_ICONS</code> / <code>PANEL_TITLES</code>，改完重跑即可）。
    重新裁墨迹：<code>node tools/crop-icons.js</code>；编译产物：<code>node tools/gen-icons.js</code>。
  </footer>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`写入 ${path.relative(ROOT, OUT)}（${rows.length} 张原稿 + 2 个列头按钮，${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);
