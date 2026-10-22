

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ALL = [
  ['psd-mask-interop', 'PSD蒙版文档坐标/默认色/合成透明度与保存通道'],
  ['psd-gradient-interop', 'Photoshop原生渐变中点/插值/几何及编辑往返'],
  ['psd-layer-interop', '组折叠/真实效果/大型液化块与旋转属性'],
  ['psd-clipping-interop', '剪贴调整作用域/栈顺序与透明度'],
  ['psd-special-blend-interop', '混合被剪切元素/浅深挖空/高级混合写回'],
  ['native-mask-write', '16/32位蒙版通道安全写回与预乘拒绝'],
  ['rotation-transform-interop', '智能对象镜像/旋转/非仿射变换角度'],
  ['inflate-cursor', 'DEFLATE 检查点游标与有界随机读取'],
  ['frame-queue', 'GPU 在途预算与最新请求合并'],
  ['tile-cache', '跨层瓦片字节预算与可见集规划'],
  ['lod-raster', '分级瓦片解码与透明边缘/行复用'],
  ['sparse-pixels', '超大图层稀疏修改与分块历史'],
  ['selection-brush', '选区画笔稀疏覆盖与底选区保留'],
  ['sparse-write', '稀疏像素的 PSD/PSB 行写回与合成缓存'],
  ['frame-stroke', '原生图框空心描边/分组遮罩/CPU绘制清单'],
  ['smart-properties', '智能对象源复合与原生复位变换写回'],
  ['color-books', 'ACB原始色库/分页/色彩数值/资源摘要'],
  ['raster-alpha', '透明边缘预乘采样与半开三角边'],
  ['lazy-raster', '大画布懒通道行索引与视口瓦片缓存'],
  ['lazy-write', '分层 PSD 写回：附加流式层、偏移包围盒与隐藏标记'],
  ['native-frames', 'PS 2026 原生图框组解析、新建与边界写回'],
  ['native-planes', '16/32 位原生通道编辑及精度往返'],
  ['native-pixel-edit', '高位深局部编辑与原生基准保留'],
  ['hdr-native-interop', 'Photoshop原生HDR载体与32位通道'],
  ['native-16-color', '原生16位颜色满量程与暗通道'],
  ['cmyk-compose', 'CMYK原生四通道合成与保黑版缓存'],
  ['photoshop-presets', 'PS原始预设资源与格式兼容'],
  ['doc-color-context', '服务端ICC文档上下文与并发隔离'],
  ['formats', '位图编解码（TIFF / TGA / PNM / ICO / HDR / EXR / BMP）'],
  ['drawlist-cpu', '绘制清单 CPU 执行 ≡ compositeAll'],
  ['relight', 'AI 重新打光：模型通道、法线、深度与透明度'],
  ['relight-lighting', 'AI 重新打光：软阴影、皮肤散射与 CPU 回退'],
  ['golden', '合成结果回归（md5）'],
  ['edit-bytes', '内核字节层：写时拷贝 / 延后拼接 / 复用旧 RLE 行'],
  ['ps-script', 'PS 脚本沙箱（ExtendScript / UXP）'],
  ['cli', '命令行 + stdio MCP + 快捷批处理'],
];
const want = process.argv.slice(2);
const list = want.length ? ALL.filter(([k]) => want.includes(k)) : ALL;
const results = [];
for (const [name, label] of list) {
  const t0 = Date.now();
  console.log(`\n━━ ${name} · ${label}`);
  const r = spawnSync(process.execPath, [path.join(here, name + '.mjs')], { stdio: 'inherit', env: process.env, timeout: 15 * 60000 });
  results.push([name, r.status === 0, ((Date.now() - t0) / 1000).toFixed(1)]);
}
console.log('\n━━ 汇总');
for (const [n, ok, s] of results) console.log(`${ok ? '✓' : '✗'} ${n.padEnd(14)} ${s}s`);
const bad = results.filter(r => !r[1]);
console.log(bad.length ? `\n${bad.length} 组失败` : '\n全部通过');
process.exit(bad.length ? 1 : 0);
