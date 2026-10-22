


import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const ALL = [
  ['production-smoke-browser', '真实页面初始化、新建文档和图层（支持生产构建）'],
  ['layer-panel-visual-browser', '图层类型/缩略图/蒙版选中与属性同步'],
  ['layer-header-browser', '图层筛选原稿/内嵌百分号/切换与输入交互'],
  ['document-layout-browser', '文档分屏顺序/浮动窗口拖动/合并页签'],
  ['smart-object-tabs-browser', '智能对象父文档/源文档独立页签与切换存储'],
  ['editor-chrome-browser', '文档页签与全域浏览器右键菜单策略'],
  ['transform-repeat-browser', 'Ctrl+T连续变形确认/重入/取消'],
  ['native-frame-browser', '原生图框创建/置入/取出/边界与撤销'],
  ['place-embedded-browser', '置入嵌入对象与结构撤销'],
  ['place-linked-browser', '置入链接智能对象与结构撤销'],
  ['frame-stroke-browser', '原生图框空心描边/组不透明度/GPU合成对拍'],
  ['properties-browser', '智能对象原生复位/撤销/图框属性写回'],
  ['no-document-tools-browser', '无文档工具和参数编辑/新建继承/空画布保护'],
  ['ui-options-browser', 'PS2026选项栏分型与选区画笔弹出设置'],
  ['gradient-panel-browser', '动态渐变缩略图/对角线预览/空白层预设填充'],
  ['preset-panels-browser', '色板渐变图案默认内容/分组/原地改名/布局'],
  ['color-picker-browser', '全局拾色器/颜色通道/确认取消/默认面板尺寸'],
  ['recent-files-browser', '最近文件迁移/持久化/重开与颜色面板尺寸'],
  ['parity-first-pass-browser', '透明边GL对拍与严格动作回放'],
  ['native-pixel-edit-browser', '浏览器高位深局部编辑/撤销/扩边/重载'],
  ['brush-undo-render-browser', '画笔 Ctrl+Z 后画布与缩略图同步清空'],
  ['sparse-operations-browser', '空图层绘画与分块填充/滤镜/调整的选区和撤销'],
  ['lazy-clipboard-safety-browser', '惰性复制/合并原像素及失败时保留源数据'],
  ['lazy-png-export-browser', '超大单层 PSD 分块 PNG 导出及边缘编辑'],
  ['color-presentation-browser', 'ICC身份/CMYK设置刷新/校样保护'],
  ['cmyk-native-browser', '浏览器CMYK保K/原生缓存/局部编辑'],
  ['photoshop-presets-browser', '原生PS预设资源/笔尖/依赖/持久化'],
  ['document-save-browser', '保存当前本机文件 / 另存为 / 多文档句柄'],
  ['open-formats', '文件 › 打开 各种格式'],
  ['export-formats', '导出为 各种格式'],
  ['ps-script-browser', '在编辑器里运行 PS 脚本'],
  ['reload-reuse', '结构性重载认回的像素 ≡ 完整重新解析'],
  ['relight-browser', 'Ai › 重新打光（真实本地 AI / 选区 / 撤销 / 导出）'],
  ['gpu-compositor', 'WebGPU 合成 ≡ CPU（SwiftShader）'],
  ['large-canvas-fallback-browser', '9390×30000 超大文档视口采样保底'],
  ['layer-panel-virtual-browser', '大图层面板可视行虚拟化'],
  ['worker-tile-cache-browser', 'ZIP Worker 压缩源常驻/行缓存/预算回收'],
  ['zip-batch-browser', 'ZIP 相邻瓦片批量解码与压缩源复用'],
  ['large-zip-worker-browser', '真实 2.8 亿像素 ZIP PSD 打开/显示/细节解码'],
  ['virtual-tiles-gpu-browser', 'GPU 虚拟图层的代理/高清瓦片复合'],
  ['lod-tiles-gpu-browser', '多级 LOD 的透明复合/精细覆盖/逐级回退'],
  ['large-tile-interaction-browser', '真实 ZIP/RLE 大图层放大/平移/高清像素'],
  ['large-lod-interaction-browser', '真实 ZIP/RLE 大图的 50%/25%/12.5% 分级瓦片与热平移'],
  ['giant-lod-browser', '真实 30 亿像素 PSB 的 1/64 LOD 与条带内存路径'],
  ['sparse-paint-browser', '超大图层的稀疏画笔/跨瓦片/异步撤销'],
  ['sparse-fill-clear-browser', '超大图层选区填充/清除的稀疏事务'],
  ['zip-seek-browser', 'ZIP 检查点索引、远距离随机访问与原生像素'],
  ['zip-seek-budget-browser', '多来源 ZIP 检查点预算、游标回收与随机重访'],
  ['pixel-grid-browser', '原生像素与像素网格一格一像素、不同缩放和 DPR'],
  ['multilayer-tile-budget-browser', '真实 12 层 PSB 的全局瓦片预算与稳定驻留'],
  ['preset-style-performance-browser', '隐藏样式面板按需计算与缩略图无读回'],
  ['gpu-frame-queue-browser', 'GPU 在途限制/最新像素/切文档与快照'],
  ['large-jpg-ops-browser', '超大 JPG 打开后的画笔/缩放/移动/变换/滤镜/样式实测'],
  ['large-mask-browser', '超大带蒙版 PSD 的惰性通道与蒙版逐块渲染'],
  ['large-export-browser', '超大文档的 WebP / TIFF / JPEG→PDF 导出'],
  ['large-transform-browser', '超大 JPG/PSD 的旋转缩放导出与重新载入'],
  ['image-mask-save-browser', '大 JPG 新建蒙版后保存/重开保留蒙版'],
  ['raw-formats-browser', '超大文档 PPM/PAM/TGA/BMP/HDR 流式编码'],
];
const want = process.argv.slice(2);
let list = want.length ? ALL.filter(([k]) => want.includes(k)) : ALL;
if (process.env.PSD_EDITOR_TEST_GPU === '0') list = list.filter(([k]) => k !== 'gpu-compositor' && k !== 'frame-stroke-browser');

const port = await new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const built = process.env.PSD_EDITOR_TEST_DIST === '1';
const srv = spawn(process.execPath, [path.join(root, 'server/index.js')], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), PSD_EDITOR_DEV: built ? '0' : '1', PSD_EDITOR_AUTH: 'off', PSD_EDITOR_STATE: 'off', PSD_EDITOR_ACCESS_LOG: 'off', PSD_EDITOR_DEV_RELOAD: '0' },
});
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
const up = async () => { for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/editor`); if (r.ok) return true; } catch {  } await new Promise(r => setTimeout(r, 500)); } return false; };
if (!await up()) { console.error('开发服务器没能启动：\n' + srvLog.slice(-3000)); srv.kill(); process.exit(1); }
console.log(`${built ? '构建产物' : '开发'}服务器 http://127.0.0.1:${port}`);
const results = [];
try {
  for (const [name, label] of list) {
    const t0 = Date.now();
    console.log(`\n━━ ${name} · ${label}`);
    const r = spawnSync(process.execPath, [path.join(here, name + '.mjs'), String(port)], { stdio: 'inherit', env: process.env, timeout: 20 * 60000 });
    results.push([name, r.status === 0, ((Date.now() - t0) / 1000).toFixed(1)]);
  }
} finally { srv.kill(); }
console.log('\n━━ 汇总');
for (const [n, ok, s] of results) console.log(`${ok ? '✓' : '✗'} ${n.padEnd(18)} ${s}s`);
const bad = results.filter(r => !r[1]);
console.log(bad.length ? `\n${bad.length} 组失败` : '\n全部通过');
process.exit(bad.length ? 1 : 0);
