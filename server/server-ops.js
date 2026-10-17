













import { applyFilterOp, applyAdjustmentOp, contentAwareFillOp, fillPixelsOp, clearPixelsOp } from './edit-ops-pixel.js';
import {
  moveLayerOp, resizeCanvasOp, cropOp, resizeImageOp, rotateCanvasOp, flipCanvasOp, duplicateLayerOp,
} from './doc-geometry.js';
import { createArtboardOp } from './edit-ops-create.js';
import { setSmartFiltersOp, addSmartFilterOp, SMART_FILTERS } from './edit-ops-smartfilter.js';
import { renderTextOp } from './text-render.js';

const F = (name, type, required, desc, extra = {}) => ({ name, type, required, desc, ...extra });
const LAYER = [
  F('index', 'integer', false, '图层下标（/api/doc/inspect 的 flat[].index，底 = 0）；与 target 二选一'),
  F('target', 'integer|string|object', false, '图层名（须唯一）/ 下标 / { layerIndex } / { name }'),
];
const SELECTION = F('selection', 'object|array', false,
  '选区（文档坐标）：{ type:"rect"|"ellipse", x, y, width, height, feather? } | { type:"polygon", points:[[x,y],…] } | { type:"all" }；' +
  '数组 = 多个形状按各自 mode（add/subtract/intersect/xor）组合；{ shapes:[…], invert:true } = 反选。省略 = 整层');


export const EXT_OPS = {
  
  applyFilter: {
    run: applyFilterOp, category: 'pixels', structural: false,
    summary: '对普通像素图层应用滤镜（75 种：模糊 / 锐化 / 杂色 / 扭曲 / 风格化 / 像素化 / 渲染 / 其它 / 自动调整…）',
    fields: [...LAYER,
      F('filter', 'string', true, '滤镜名（GET /api/catalog 的 filters[].kind，如 gaussianBlur / unsharpMask / motionBlur / mosaic）'),
      F('params', 'object', false, '滤镜参数；缺省项用默认值；不认识的键会 400'),
      SELECTION,
      F('fade', 'number', false, '渐隐 0…100（PS 的「编辑 › 渐隐」不透明度），默认 100'),
      F('foreground', 'string|array', false, '前景色（云彩 / 纤维等用到前景背景色的滤镜）'),
      F('background', 'string|array', false, '背景色'),
      F('expand', 'boolean|integer', false, '空间类滤镜自动往外补边（默认按半径 ×3）；false = 不补，整数 = 指定像素'),
    ],
    notes: '只作用于 raster 图层；文字 / 智能对象 / 形状先 rasterizeLayer。智能滤镜（非破坏）暂未开放。',
    example: { op: 'applyFilter', index: 1, filter: 'gaussianBlur', params: { radius: 4 } },
  },
  applyAdjustment: {
    run: applyAdjustmentOp, category: 'pixels', structural: false,
    summary: '破坏性图像调整（直接改像素）：曲线 / 色阶 / 色相饱和度 / 亮度对比度 / 黑白 / 色彩平衡 / 渐变映射…',
    fields: [...LAYER,
      F('adjustment', 'object', true, '{ type, …参数 }；type 见 GET /api/catalog 的 adjustments（curves / levels / hueSaturation / brightnessContrast / …）'),
      SELECTION, F('fade', 'number', false, '渐隐 0…100'),
    ],
    notes: '要非破坏的调整图层请用 core op addAdjustmentLayer。',
    example: { op: 'applyAdjustment', index: 1, adjustment: { type: 'brightnessContrast', brightness: 20, contrast: 10 } },
  },
  contentAwareFill: {
    run: contentAwareFillOp, category: 'pixels', structural: false,
    summary: '内容识别填充：用图层其余像素补掉选区（去水印 / 去杂物）',
    fields: [...LAYER, { ...SELECTION, required: true, desc: '要填掉的区域（必填）' },
      F('patch', 'integer', false, '补丁半径 1…6，默认 3'), F('samples', 'integer', false, '每像素候选样本数，默认 120'),
      F('seed', 'integer', false, '随机种子（同种子结果可复现），默认 1')],
    example: { op: 'contentAwareFill', index: 0, selection: { type: 'rect', x: 100, y: 100, width: 60, height: 40 } },
  },
  fillPixels: {
    run: fillPixelsOp, category: 'pixels', structural: false,
    summary: '用纯色填充选区（PS 的「编辑 › 填充」）；空图层也能填（按选区长出像素）',
    fields: [...LAYER, F('color', 'string|array', true, '"#rrggbb" 或 [r,g,b]'), SELECTION,
      F('opacity', 'number', false, '0…100，默认 100'), F('preserveTransparency', 'boolean', false, '保留透明区域（只染已有像素）')],
    example: { op: 'fillPixels', index: 1, color: '#ff3366', selection: { type: 'ellipse', x: 50, y: 50, width: 200, height: 120 } },
  },
  clearPixels: {
    run: clearPixelsOp, category: 'pixels', structural: false,
    summary: '清除选区里的像素（PS 的 Delete）',
    fields: [...LAYER, { ...SELECTION, required: true, desc: '要清除的区域（必填）' }],
    example: { op: 'clearPixels', index: 1, selection: { type: 'rect', x: 0, y: 0, width: 100, height: 100 } },
  },
  
  moveLayer: {
    run: moveLayerOp, category: 'geometry', structural: false,
    summary: '平移图层（组 = 带上整组）；文字仍可编辑、智能对象仍是智能对象、矢量路径与蒙版跟着走',
    fields: [...LAYER, F('indices', 'integer[]', false, '一次平移多个图层 / 组'), F('dx', 'integer', true, '水平位移（像素，右为正）'), F('dy', 'integer', true, '垂直位移（像素，下为正）')],
    example: { op: 'moveLayer', index: 1, dx: 40, dy: -20 },
  },
  duplicateLayer: {
    run: duplicateLayerOp, category: 'structure', structural: true,
    summary: '复制图层 / 组 / 画板（字节级克隆，放在源正上方；智能对象为浅拷贝，与 PS 默认一致）',
    fields: [...LAYER, F('name', 'string', false, '副本名，默认「原名 拷贝」'), F('dx', 'integer', false, '副本平移（像素）'), F('dy', 'integer', false, '副本平移')],
    notes: '给组头 index = 连同全部成员整段复制。复制画板且没给 dx/dy 时，副本放到原画板右侧 100 像素处，画布不够自动撑大。副本整段插在源（组）正上方，其上所有图层下标相应后移。',
    example: { op: 'duplicateLayer', index: 1, dx: 30, dy: 30 },
  },
  resizeCanvas: {
    run: resizeCanvasOp, category: 'document', structural: false,
    summary: '画布大小（只挪位置、不重采样）；背景图层扩出来的部分用 extColor 填',
    fields: [F('width', 'integer', true, '新宽（像素，1…30000）'), F('height', 'integer', true, '新高'),
      F('anchor', 'string|integer', false, '定位：top-left / top / top-right / left / center / right / bottom-left / bottom / bottom-right（或 0…8），默认 center'),
      F('extColor', 'string|array', false, '画布扩展颜色（背景图层用），默认白')],
    example: { op: 'resizeCanvas', width: 1600, height: 1200, anchor: 'center' },
  },
  crop: {
    run: cropOp, category: 'document', structural: false,
    summary: '裁剪到矩形（画布 = 该矩形，图层整体平移）',
    fields: [F('x', 'integer', true, '裁剪框左'), F('y', 'integer', true, '裁剪框上'), F('width', 'integer', true, '宽'), F('height', 'integer', true, '高'),
      F('deleteCropped', 'boolean', false, 'true = 普通像素层裁掉画布外的像素（PS 的「删除裁剪的像素」）；默认 false 保留')],
    example: { op: 'crop', x: 100, y: 80, width: 800, height: 600 },
  },
  resizeImage: {
    run: resizeImageOp, category: 'document', structural: false,
    summary: '图像大小：整份文档重采样（像素层 lanczos3；文字改变换矩阵仍可编辑；智能对象改放置四点）',
    fields: [F('width', 'integer', false, '新宽；只给一边 = 等比'), F('height', 'integer', false, '新高'), F('scale', 'number', false, '整体倍率（与 width/height 二选一）'),
      F('resolution', 'number', false, '新分辨率（像素/英寸），写入资源 1005'),
      F('resample', 'string', false, '重采样：lanczos3（默认）/ bicubic / bilinear / nearest', { enum: ['lanczos3', 'bicubic', 'bilinear', 'nearest'] }),
      F('scaleStyles', 'boolean', false, 'PS 的「缩放样式」：图层样式里的像素尺寸、图案缩放、矢量描边宽度按比例缩放（默认 true）', { default: true })],
    notes: '非等比缩放时样式按面积比例的平方根缩放（与 PS 同口径）；实时形状的尺寸与圆角、切片矩形同步更新。',
    example: { op: 'resizeImage', width: 800 },
  },
  rotateCanvas: {
    run: rotateCanvasOp, category: 'document', structural: false,
    summary: '旋转画布（任意角度，顺时针；新画布 = 外接矩形，90° 倍数无损）',
    fields: [F('angle', 'number', true, '角度（度，顺时针）'), F('extColor', 'string|array', false, '背景图层露出部分的颜色，默认白')],
    example: { op: 'rotateCanvas', angle: 90 },
  },
  flipCanvas: {
    run: flipCanvasOp, category: 'document', structural: false,
    summary: '水平 / 垂直翻转画布',
    fields: [F('axis', 'string', true, 'horizontal / vertical', { enum: ['horizontal', 'vertical'] })],
    example: { op: 'flipCanvas', axis: 'horizontal' },
  },
  
  addSmartFilter: {
    run: addSmartFilterOp, category: 'smartObject', structural: true,
    summary: '新增一条智能滤镜（非破坏，PS 里可双击改参数 / 关眼睛）；普通层自动转智能对象，已有智能滤镜 = 追加',
    fields: [...LAYER,
      F('filter', 'string', true, '滤镜名', { enum: Object.keys(SMART_FILTERS).filter(k => k !== 'liquify') }),
      F('params', 'object', false, '参数，与 applyFilter 同名同范围（见 get_catalog section=filters）'),
      F('opacity', 'number', false, '滤镜混合选项的不透明度 0…100，默认 100'),
      F('mode', 'string', false, '滤镜混合模式，默认 normal（预览只精确支持 normal）'),
      F('enabled', 'boolean', false, 'false = 挂上但先关着')],
    notes: '写完描述符后按「变形栈 → 全部智能滤镜」重渲染缓存栅格；栈里有服务端不认识的滤镜时只在现有缓存上叠加这一条。cameraRaw / lensCorrection 是 PSD Editor 私有条目（PS 里只显示缓存像素、不能在 PS 里再调）；液化智能滤镜只能在编辑器里画。',
    example: { op: 'addSmartFilter', index: 1, filter: 'gaussianBlur', params: { radius: 6 }, opacity: 80 },
  },
  setSmartFilters: {
    run: setSmartFiltersOp, category: 'smartObject', structural: false,
    summary: '改智能对象上已有的智能滤镜（开关 / 参数 / 混合选项 / 删除 / 换序）',
    fields: [F('target', 'integer|string|object', false, '智能对象序号 / 图层名 / { layerIndex }（number = 智能对象序号，与老 op 一致）'),
      F('index', 'integer', false, '图层下标（与 target 二选一）'),
      F('edits', 'object', true, '{ style?:{ enabled?, filterMaskEnable?, … }, filters?:[{ index, enabled?, blendOptions?:{ opacity?, mode? }, values?:{ "参数路径": 值 }, remove? }], order?:[原下标…] }；可先用 POST /api/so/filters 或 MCP 的 get_smart_filters 看现有列表')],
    notes: '改完按新描述符重渲染缓存栅格（栈里全是服务端认识的滤镜时）；新增请用 addSmartFilter。',
    example: { op: 'setSmartFilters', target: 0, edits: { filters: [{ index: 0, enabled: false }] } },
  },
  renderText: {
    run: renderTextOp, category: 'text', structural: false,
    summary: '按服务端字体重排重绘文字层栅格（setText / 改样式后会自动重绘，这条用于强制重绘，如新装了字体）',
    fields: [F('indices', 'integer[]', false, '要重绘的文字层；省略 = 全部文字层'), F('index', 'integer', false, '单个文字层')],
    notes: '字体按 PostScript 名在服务端字体目录里找（server/fonts/、PSD_EDITOR_FONT_DIRS、系统字体目录），缺字体用替代字体并给 warning；PS 打开时仍按它自己的字体重排。',
    example: { op: 'renderText', indices: [2] },
  },
  createArtboard: {
    run: createArtboardOp, category: 'artboard', structural: true,
    summary: '新建画板：给 indices 就把这些图层装进去（来自图层的画板），否则新建空画板放最上面',
    fields: [F('name', 'string', false, '画板名，默认「画板 N」'), F('rect', 'object', false, '{ x, y, width, height } 或 { left, top, right, bottom }；给了 indices 时可省略（= 图层外接框）'),
      F('indices', 'integer[]', false, '要装进画板的图层 / 组'),
      F('backgroundType', 'integer|string', false, '1 白 / 2 黑 / 3 透明 / 4 自定（white / black / transparent / custom）', { default: 1 }),
      F('color', 'string|array', false, 'backgroundType=4 时的底色'), F('presetName', 'string', false, '画板预设名'),
      F('autoSizeCanvas', 'boolean', false, '画板超出画布时撑大画布（默认 true）')],
    example: { op: 'createArtboard', name: '手机', rect: { x: 0, y: 0, width: 1125, height: 2436 }, backgroundType: 'white' },
  },
};


export const LEGACY_SERVER_OPS = [
  {
    op: 'replaceSmartObject', aliases: ['replaceSmartObjectImage'], category: 'smartObject', structural: false,
    summary: '换智能对象源图（按覆盖模式渲染进网格 / 变形，写回内嵌源图、缓存栅格、FEid 与缩略图）',
    fields: [F('target', 'integer|string|object', false, '智能对象序号 / 图层名 / { layerIndex } / { smartObjectIndex }；省略 = 第 0 个智能对象'),
      F('image', 'object|integer|string', true, '图片引用：{ file:"image", index:n } / 上传文件名 / data:URL / 裸 base64'),
      F('fit', 'object', false, '{ mode:"cover"|"contain"|"tile"|"stretch", alignX?, alignY?, scale? }，默认 cover'),
      F('sourceName', 'string', false, '写进 PSD 的内嵌源图文件名')],
    notes: '与 /api/render（output.format=psd）逐字节相同。注意：number 型 target 在这三条老 op 里指「智能对象序号」。',
    example: { op: 'replaceSmartObject', target: 0, image: { file: 'image', index: 0 }, fit: { mode: 'cover' } },
  },
  {
    op: 'setSmartObjectDescriptor', aliases: [], category: 'smartObject', structural: false,
    summary: '改智能对象放置描述符（Idnt / placed / 原始尺寸 Sz）',
    fields: [F('target', 'integer|string|object', false, '同 replaceSmartObject'),
      F('linkId', 'string', false, '改 Idnt（指向哪份内嵌文件）'), F('placedId', 'string', false, '改 placed（实例 id）'),
      F('originalSize', 'object', false, '{ width, height }')],
    example: { op: 'setSmartObjectDescriptor', target: 0, originalSize: { width: 800, height: 800 } },
  },
];

export const EXT_OP_NAMES = Object.keys(EXT_OPS);
