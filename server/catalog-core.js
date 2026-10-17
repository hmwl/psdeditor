





























const BLEND_KEYS = ['pass', 'norm', 'diss', 'dark', 'mul ', 'idiv', 'lbrn', 'dkCl',
  'lite', 'scrn', 'div ', 'lddg', 'lgCl', 'over', 'sLit', 'hLit',
  'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud', 'fsub', 'fdiv',
  'hue ', 'sat ', 'colr', 'lum '];


const EFFECT_NAMES = ['dropShadow', 'innerShadow', 'outerGlow', 'innerGlow', 'bevelEmboss',
  'satin', 'colorOverlay', 'gradientOverlay', 'patternOverlay', 'stroke'];
const EFFECT_KEYS = ['DrSh', 'IrSh', 'OrGl', 'IrGl', 'ebbl', 'ChFX', 'SoFi', 'GrFl', 'patternFill', 'FrFX'];


const ADJ_ACCEPTS = {
  brightnessContrast: 'brightness(-150…150) contrast(-50…100) useLegacy labColorOnly',
  levels: 'shadowInput(0…253) highlightInput(2…255) gamma(0.10…9.99) shadowOutput(0…255) highlightOutput(0…255)',
  curves: 'points（[[输入,输出], …]，2…19 个点，输入递增，0…255）',
  hueSaturation: 'hue(-180…180) saturation(-100…100) lightness(-100…100) colorize',
  invert: '（无参数）',
  posterize: 'levels(2…255)',
  threshold: 'level(1…255)',
  blackWhite: 'red yellow green cyan blue magenta（均 -200…300）useTint',
  colorBalance: 'shadows/midtones/highlights（各 3 个 -100…100 的整数）preserveLuminosity',
  exposure: 'exposure(-20…20) offset(-0.5…0.5) gamma(0.01…9.99)',
  channelMixer: 'monochrome',
  selectiveColor: 'method(0 相对 / 1 绝对)',
  vibrance: 'vibrance(-100…100) saturation(-100…100)',
  photoFilter: 'color([红, 绿, 蓝] 0…255) density(0…100，百分比) preserveLuminosity',
  colorLookup: 'lookupType(3DLUT / abstract / deviceLink) lutFormat(LUTFormatCUBE / LUTFormat3DL / LUTFormatLOOK / LUTFormatICC / LUTFormatCSP) dataOrder(profileDataOrderRGB / profileDataOrderBGR) name',
  gradientMap: 'stops([[位置0…4096, 红, 绿, 蓝], …]，2…255 个) opacityStops([[位置0…4096, 不透明度0…255], …]，2…255 个) reverse dither name',
};


const PARAM_ADJ_KEYS = ['SoCo', 'GdFl', 'PtFl', 'CgEd', 'blwh', 'vibA', 'clrL', 'brit', 'levl', 'curv',
  'hue ', 'hue2', 'blnc', 'phfl', 'mixr', 'selc', 'expA', 'post', 'thrs', 'nvrt', 'grdm'];


const STROKE_FIELDS = ['enabled', 'fillEnabled', 'width', 'dashOffset', 'miterLimit', 'cap', 'join', 'align',
  'dashes', 'opacity', 'blendMode', 'resolution', 'scaleLock', 'strokeAdjust', 'color'];

const RASTER_BLOCK_KEYS = ['TySh', 'vmsk', 'vsms', 'vogk', 'vstk', 'vscg', 'SoCo', 'GdFl', 'PtFl', 'SoLd', 'PlLd'];
const COLOR_LABELS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
const PATH_UNITS = ['pixel', 'normalized', 'fixed'];



const F = {
  index: (extra = '') => ({ name: 'index', type: 'integer', required: true, desc: '图层下标（底=0，0…图层数-1）' + extra }),
  bounds: (required, desc) => ({ name: 'bounds', type: 'object', required, desc: desc || '{ top, left, bottom, right }，整数文档坐标' }),
  at: (desc) => ({ name: 'at', type: 'integer', required: false, desc: desc || '新图层在「底=0」序里的插入下标，0…图层数；默认 = 图层数（最上面）' }),
  name: (def) => ({ name: 'name', type: 'string', required: false, desc: '图层名，非空、≤255 字符', ...(def !== undefined ? { default: def } : {}) }),
  opacity: () => ({ name: 'opacity', type: 'integer', required: false, desc: '不透明度 0…255（255 = 不透明）' }),
  visible: () => ({ name: 'visible', type: 'boolean', required: false, desc: '是否可见' }),
  clipping: () => ({ name: 'clipping', type: 'boolean|integer', required: false, desc: '剪贴蒙版：布尔值或 0/1' }),
  blendKey: () => ({ name: 'blendKey', type: 'string', required: false, desc: '图层混合模式 4 字符键（不足补空格，如 \'mul \'）', enum: BLEND_KEYS }),
  color: (desc, def) => ({ name: 'color', type: 'string|array', required: false, desc: desc || '颜色：\'#rrggbb\' / \'#rgb\' / [r,g,b]（0…255）', ...(def !== undefined ? { default: def } : {}) }),
  subpaths: (required, extra = '') => ({
    name: 'subpaths', type: 'array', required,
    desc: '子路径数组 [{ closed?:boolean(默认 true), operation?:\'exclude\'|\'combine\'|\'subtract\'|\'intersect\'|0…3|null, ' +
      'knots:[{ anchor:[x,y]|{x,y}, in?:[x,y], out?:[x,y], linked?:boolean }] }]；in/out 缺省 = 与 anchor 相同（角点）' + extra,
  }),
  units: () => ({ name: 'units', type: 'string', required: false, desc: '坐标单位：pixel（绝对像素）/ normalized（0…1）/ fixed（8.24 定点整数）', enum: PATH_UNITS, default: 'pixel' }),
  effect: () => ({ name: 'effect', type: 'string', required: true, desc: '效果名（规范名或 4 字符 PS key，大小写不敏感；另认 drop-shadow / bevel / stroke 等同义写法）', enum: [...EFFECT_NAMES, ...EFFECT_KEYS] }),
};

const RECT_PATH = [{ closed: true, knots: [{ anchor: [100, 100] }, { anchor: [400, 100] }, { anchor: [400, 300] }, { anchor: [100, 300] }] }];



export const CORE_OP_CATALOG = [
  {
    op: 'addFrameLayer', category: 'structure', structural: true,
    summary: '新建 Photoshop 原生画框组（矩形或椭圆）',
    fields: [
      { name: 'at', type: 'integer', desc: '插入位置，默认图层栈顶部；创建分隔记录和组头两条记录' },
      { name: 'name', type: 'string', desc: '图框名称，默认自动编号' },
      { name: 'rect', type: 'object', required: true, desc: '{x,y,w,h} 文档像素；坐标可负，宽高必须为正有限数' },
      { name: 'shape', type: 'string', enum: ['rect', 'ellipse'], desc: '矩形或椭圆，默认rect' },
    ],
    notes: '仅验证RGB/8新建。返回index/headerIndex和dividerIndex。内容需作为组内子图层，clipping=0。',
    example: { op: 'addFrameLayer', name: '原生图框', rect: { x: 20, y: 30, w: 200, h: 150 }, shape: 'rect' },
  },
  {
    op: 'setFrameRect', category: 'structure', structural: true,
    summary: '修改已有原生画框边界并同步矢量路径',
    fields: [
      { name: 'index', type: 'integer', required: true, desc: '具有frgb的画框组头下标' },
      { name: 'rect', type: 'object', required: true, desc: '{x,y,w,h} 文档像素；同步frgb/vsms/vogk并移除过期派生蒙版缓存' },
    ],
    notes: '只调整图框边界，不缩放或移动组内内容。自定路径按当前矩形比例变换。',
    exampleSetup: [{ op: 'addFrameLayer', at: 6, name: '原生图框', rect: { x: 20, y: 30, w: 200, h: 150 } }],
    example: { op: 'setFrameRect', index: 7, rect: { x: 25, y: 35, w: 240, h: 180 } },
  },

  
  {
    op: 'setLayerProps', category: 'layer', structural: false,
    summary: '改图层名 / 可见性 / 不透明度 / 剪贴 / 混合模式（可一次改多项）',
    fields: [
      F.index(),
      { name: 'name', type: 'string', required: false, desc: '新图层名，非空、≤255 字符；同时写 luni（真名）与 Pascal 名（非 ASCII 落地为 ?）' },
      { name: 'unicodeName', type: 'string', required: false, desc: '只改 luni 里的 Unicode 名（非空），不动 Pascal 名' },
      F.visible(), F.opacity(), F.clipping(), F.blendKey(),
    ],
    notes: 'name/unicodeName/visible/opacity/clipping/blendKey 至少给一个；附加区解析已降级（extraRaw）的图层拒绝改名。',
    example: { op: 'setLayerProps', index: 1, name: '标题', opacity: 200, blendKey: 'mul ' },
  },
  {
    op: 'renameLayer', aliasOf: 'setLayerProps', category: 'layer', structural: false,
    summary: '改图层名（setLayerProps 的便捷别名）',
    fields: [F.index(), { name: 'name', type: 'string', required: true, desc: '新图层名，非空、≤255 字符' }],
    example: { op: 'renameLayer', index: 1, name: '主标题' },
  },
  {
    op: 'setVisible', aliasOf: 'setLayerProps', category: 'layer', structural: false,
    summary: '显示 / 隐藏图层（setLayerProps 的便捷别名）',
    fields: [F.index(), { name: 'visible', type: 'boolean', required: true, desc: '是否可见' }],
    example: { op: 'setVisible', index: 1, visible: false },
  },
  {
    op: 'setOpacity', aliasOf: 'setLayerProps', category: 'layer', structural: false,
    summary: '改图层不透明度（setLayerProps 的便捷别名）',
    fields: [F.index(), { name: 'opacity', type: 'integer', required: true, desc: '不透明度 0…255（255 = 不透明）' }],
    example: { op: 'setOpacity', index: 1, opacity: 128 },
  },
  {
    op: 'setBlendMode', aliasOf: 'setLayerProps', category: 'layer', structural: false,
    summary: '改图层混合模式（setLayerProps 的便捷别名）',
    fields: [F.index(), { ...F.blendKey(), required: true }],
    example: { op: 'setBlendMode', index: 1, blendKey: 'scrn' },
  },
  {
    op: 'setClipping', aliasOf: 'setLayerProps', category: 'layer', structural: false,
    summary: '设 / 取消剪贴蒙版（setLayerProps 的便捷别名）',
    fields: [F.index(), { ...F.clipping(), required: true }],
    example: { op: 'setClipping', index: 1, clipping: true },
  },

  
  {
    op: 'setText', category: 'text', structural: false,
    summary: '改文字图层的文字内容（可顺带换字体），并删除全局 Txt2',
    fields: [
      F.index('，必须是文字图层（带 TySh 块）'),
      { name: 'text', type: 'string', required: true, desc: '新文字内容（可为空串）' },
      { name: 'opts', type: 'object', required: false, desc: '可选：{ font?:PostScript 字体名（同步改两份 FontSet）, keepTxt2?:boolean（保留全局 Txt2，PS 可能仍显示旧字）, orientation?:\'horizontal\'|\'vertical\', antiAlias?, bounds? }' },
    ],
    notes: '默认删全局 Txt2（否则 PS 优先读 Txt2 显示旧文字）；只改内容与 run 长度，不改字号 / 颜色。',
    example: { op: 'setText', index: 1, text: '新的标题文字' },
  },
  {
    op: 'addTextLayer', category: 'text', structural: true,
    summary: '新建一个文字图层（以内置模板 TySh 为骨架，可设字号 / 颜色 / 字体 / 段落框）',
    fields: [
      { name: 'text', type: 'string', required: true, desc: '文字内容，非空、≤30000 字符' },
      F.at(),
      F.name('文字首行（前 60 字）'),
      { name: 'x', type: 'number', required: false, desc: '文字基线原点的文档 x 坐标（段落文字为框左上角）', default: 0 },
      { name: 'y', type: 'number', required: false, desc: '文字基线原点的文档 y 坐标', default: 0 },
      { name: 'orientation', type: 'string', required: false, desc: '排版方向', enum: ['horizontal', 'vertical'] },
      { name: 'fontSize', type: 'number', required: false, desc: '字号，0 < 值 ≤ 5000' },
      F.color('文字颜色：\'#rrggbb\' / \'#rgb\' / [r,g,b]（0…255）'),
      { name: 'box', type: 'array', required: false, desc: '段落文字框 [宽, 高]，正数；给了就是段落文字' },
      { name: 'font', type: 'string', required: false, desc: 'PostScript 字体名（如 ArialMT），非空' },
      F.opacity(), F.visible(),
    ],
    notes: '新层继承模板的字体与排版默认值；新建时无像素（bounds 全 0），由 PS 按 EngineData 排版；会删除全局 Txt2。传 at2 会被拒绝（位置用 x/y）。',
    example: { op: 'addTextLayer', text: '你好世界', x: 200, y: 300, fontSize: 48, color: '#222222' },
  },

  
  {
    op: 'deleteLayer', category: 'structure', structural: true,
    summary: '删除图层；指向组头或分隔记录时整组删除（或只拆外壳）',
    fields: [
      F.index(),
      { name: 'keepChildren', type: 'boolean', required: false, desc: 'index 是组头 / 分隔记录时：true = 只删组头+分隔两条记录、成员升一级；false = 整组连根删', default: false },
    ],
    notes: '不能删光全部图层；16/32 位文档（Lr16/Lr32）不支持；删掉文字层但保留全局 Txt2 时给 warning。',
    example: { op: 'deleteLayer', index: 4 },
  },
  {
    op: 'reorderLayers', category: 'structure', structural: true,
    summary: '按原始 index 数组重排图层；数组里省略的 index 即被删除',
    fields: [
      { name: 'order', type: 'array', required: true, desc: '原始图层 index 组成的新顺序（底→顶），元素唯一、在 0…图层数-1 内；非空；省略的 index 表示删除' },
    ],
    notes: '不能拆散分组：组头与其分隔记录必须同去同留、配对关系不变；16/32 位文档不支持。',
    example: { op: 'reorderLayers', order: [3, 4, 5, 0, 1, 2] },
  },
  {
    op: 'groupLayers', category: 'structure', structural: true,
    summary: '把若干图层包进一个新建的组（PS 的 ⌘G，支持不连续多选与组中组）',
    fields: [
      { name: 'indices', type: 'array', required: false, desc: '要包进组的图层 index 数组（底=0）；选中组头（groupType 1）= 带上整个组；不能选分隔记录' },
      { name: 'index', type: 'integer', required: false, desc: '单个图层（旧口径）；与 indices 二选一' },
      F.name('组'),
    ],
    notes: 'indices / index 必须给一个；新组插在最顶层成员原来的位置，组头混合模式 pass。只识别 groupType=1（展开）的组头会带整组 —— 折叠组头（groupType=2）会被当成单条记录处理。',
    example: { op: 'groupLayers', indices: [1], name: '新组' },
  },
  {
    op: 'newGroup', category: 'structure', structural: true,
    summary: '新建一个空组（分隔记录 + 组头两条空记录）',
    fields: [
      F.at('插入下标，0…图层数；默认最上层；分隔落在 at、组头在 at+1'),
      F.name('组 N（N = 现有组头数 + 1）'),
    ],
    example: { op: 'newGroup', at: 6, name: '空组' },
  },
  {
    op: 'createLayer', category: 'structure', structural: true,
    summary: '新建一个空像素图层（bounds 全 0，像素之后用 replaceLayerPixels 落地）',
    fields: [F.at(), F.name('图层 N（N = 图层数 + 1）'), F.visible()],
    example: { op: 'createLayer', name: '新图层' },
  },

  
  {
    op: 'replaceLayerPixels', category: 'pixels', structural: true,
    summary: '替换一个图层的像素（RGBA），可选同时更新整幅合成图',
    fields: [
      F.index(),
      { name: 'rgba', type: 'object', required: true, desc: '{ data:字节(长度 = width×height×4，非预乘 RGBA), width, height }；HTTP 可省略 rgba、改传 image（上传文件引用 { file:\'image\', index } / 文件名 / data URL / 裸 base64），服务端用 sharp 解码成 RGBA' },
      F.bounds(false, '{ top, left, bottom, right } 整数；尺寸必须等于 rgba 的宽高；默认 = 图层原左上角 + rgba 尺寸'),
      { name: 'merged', type: 'object', required: false, desc: '{ data:字节 } 整幅合成图 RGBA（长度 = 画布宽×高×4）；不给则原样保留旧合成图' },
      { name: 'opts', type: 'object', required: false, desc: '透传给 rebuildPsdReplacingLayerPixels 的选项（premultiplied / sourcePatch / filterEffectsPatch / maskOriginDelta 等，一般不用）' },
    ],
    notes: '只支持 8/16 位文档；不给 merged 时缩略图 / 合成图仍是旧的。',
    example: { op: 'replaceLayerPixels', index: 1, rgba: { data: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128], width: 2, height: 2 } },
    httpExample: { op: 'replaceLayerPixels', index: 1, image: { file: 'image', index: 0 } },
  },
  {
    op: 'rasterizeLayer', category: 'pixels', structural: true,
    summary: '栅格化：摘掉决定图层类型的附加块（文字 / 矢量 / 填充 / 智能对象），变成普通像素层',
    fields: [
      F.index(),
      { name: 'keys', type: 'array', required: false, desc: '只摘这些块（非空数组）；默认全摘', enum: RASTER_BLOCK_KEYS },
    ],
    notes: '只摘块、不渲染像素 —— 渲染结果要另用 replaceLayerPixels 写；样式 / 锁定 / 名字等块保留；全局 Txt2 不在这里删。',
    example: { op: 'rasterizeLayer', index: 1 },
  },

  
  {
    op: 'setImageResource', category: 'resource', structural: true,
    summary: '新增或替换一条图像资源（8BIM 资源块）',
    fields: [
      { name: 'id', type: 'integer', required: true, desc: '资源 id，0…65535' },
      { name: 'data', type: 'array', required: true, desc: '资源数据字节（Uint8Array / number[]）；HTTP 也接受 base64 字符串' },
    ],
    example: { op: 'setImageResource', id: 1034, data: [0] },
    httpExample: { op: 'setImageResource', id: 1034, data: 'AA==' },
  },
  {
    op: 'removeImageResource', category: 'resource', structural: true,
    summary: '删除一条图像资源（不存在则不改动）',
    fields: [{ name: 'id', type: 'integer', required: true, desc: '资源 id，0…65535' }],
    example: { op: 'removeImageResource', id: 1054 },
  },

  
  {
    op: 'setLayerFlags', category: 'flags', structural: false,
    summary: '改图层锁定（lspf：锁透明像素 / 锁图像像素 / 锁位置 / 画板嵌套 / 全部锁定）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'lockTransparency', type: 'boolean', required: false, desc: '锁定透明像素' },
      { name: 'lockComposite', type: 'boolean', required: false, desc: '锁定图像像素' },
      { name: 'lockPosition', type: 'boolean', required: false, desc: '锁定位置' },
      { name: 'lockAll', type: 'boolean', required: false, desc: '全部锁定' },
      { name: 'lockNesting', type: 'boolean', required: false, desc: '防止在画板和画框内外自动嵌套（lspf bit3）' },
    ],
    notes: '五个字段至少给一个；从不删块（原本没有 lspf 且目标全 0 时不新建）。',
    example: { op: 'setLayerFlags', index: 1, lockPosition: true },
  },
  {
    op: 'setLayerColorLabel', category: 'flags', structural: false,
    summary: '改图层面板的颜色标签（lclr）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'color', type: 'integer|string', required: true, desc: '0…7（0 无 1 红 2 橙 3 黄 4 绿 5 蓝 6 紫 7 灰）或颜色名（另认 grey / 无）', enum: COLOR_LABELS },
    ],
    example: { op: 'setLayerColorLabel', index: 1, color: 'red' },
  },
  {
    op: 'setFillOpacity', category: 'flags', structural: false,
    summary: '改填充不透明度（iOpa，面板上的「填充」）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'fillOpacity', type: 'integer', required: true, desc: '0…255（255 = 填充 100%）' },
    ],
    example: { op: 'setFillOpacity', index: 1, fillOpacity: 128 },
  },
  {
    op: 'setLayerKnockout', category: 'flags', structural: false,
    summary: '改混合选项里的「挖空」（knko）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'knockout', type: 'integer', required: true, desc: '0 无 / 1 浅 / 2 深', enum: [0, 1, 2] },
    ],
    example: { op: 'setLayerKnockout', index: 2, knockout: 1 },
  },
  {
    op: 'setBlendOptions', category: 'flags', structural: false,
    summary: '改混合选项的高级混合 / 通道 / 混合颜色带（infx · clbl · tsly · lmgm · vmgm · brst · Blend If）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'blendInterior', type: 'boolean', desc: '将内部效果混合成组（infx，默认 false）' },
      { name: 'blendClipped', type: 'boolean', desc: '将剪贴图层混合成组（clbl，默认 true）' },
      { name: 'transparencyShapes', type: 'boolean', desc: '透明形状图层（tsly，默认 true）' },
      { name: 'layerMaskHidesEffects', type: 'boolean', desc: '图层蒙版隐藏效果（lmgm，默认 false）' },
      { name: 'vectorMaskHidesEffects', type: 'boolean', desc: '矢量蒙版隐藏效果（vmgm，默认 false）' },
      { name: 'channels', type: 'object', desc: '{ r?, g?, b? } 布尔：false = 该通道不参与混合（brst）' },
      { name: 'blendIf', type: 'object', desc: '{ gray|red|green|blue: { this?: [黑低,黑高,白低,白高], under?: […] } }，0…255 且递增；只做等长覆写，记录里没有该通道的混合范围段会报错' },
    ],
    example: { op: 'setBlendOptions', index: 2, blendIf: { gray: { under: [0, 0, 180, 230] } }, channels: { b: false } },
  },

  
  {
    op: 'setMaskProps', category: 'mask', structural: false,
    summary: '改图层蒙版的开关位与浓度 / 羽化（像素蒙版与矢量蒙版各一份）',
    fields: [
      F.index('；不能是分组结束分隔记录；改像素蒙版字段时图层必须已有蒙版，改矢量蒙版字段时必须已有矢量蒙版'),
      { name: 'disabled', type: 'boolean', required: false, desc: '停用蒙版' },
      { name: 'invert', type: 'boolean', required: false, desc: '混合时反相（PS 已废弃，仍原样读写）' },
      { name: 'relative', type: 'boolean', required: false, desc: '蒙版位置相对于图层数据' },
      { name: 'density', type: 'integer', required: false, desc: '像素蒙版浓度 0…255（255 = 100%）' },
      { name: 'feather', type: 'number', required: false, desc: '像素蒙版羽化 0…1000 像素' },
      { name: 'vectorDensity', type: 'integer', required: false, desc: '矢量蒙版浓度 0…255（255 = 100%）' },
      { name: 'vectorFeather', type: 'number', required: false, desc: '矢量蒙版羽化 0…1000 像素' },
    ],
    notes: '七个字段至少给一个。参数段里已有对应项时等长覆写；没有时补写参数段（蒙版段变长，只有矢量蒙版的图层会新建一个空矩形的蒙版段）。没有蒙版 / 没有矢量蒙版在 apply 阶段才报错（planEdits 查不出）。',
    exampleSetup: [{ op: 'addLayerMask', index: 1 }],
    example: { op: 'setMaskProps', index: 1, disabled: true },
  },
  {
    op: 'addLayerMask', category: 'mask', structural: true,
    summary: '给图层新建用户蒙版（通道 -2），纯色填充或给灰度位图',
    fields: [
      F.index('；不能是分组结束分隔记录；图层不能已有蒙版'),
      { name: 'fill', type: 'string|integer', required: false, desc: '\'reveal\'（全白 255，默认）/ \'hide\'（全黑 0）/ 0…255；与 gray 互斥' },
      { name: 'gray', type: 'array|object', required: false, desc: '8 位灰度字节（长度 = bounds 宽×高）或 { data, width, height }；与 fill 互斥；JSON 请传 number[]（不解 base64）' },
      F.bounds(false, '{ top, left, bottom, right } 整数，宽高 > 0；默认 = 图层包围盒（空图层必须显式给）'),
      { name: 'defaultColor', type: 'integer', required: false, desc: '蒙版矩形之外的取值 0…255；默认 = fill 值（给 gray 时默认 0）' },
      { name: 'disabled', type: 'boolean', required: false, desc: '新建即停用' },
      { name: 'invert', type: 'boolean', required: false, desc: '反相位' },
    ],
    example: { op: 'addLayerMask', index: 1, fill: 'reveal' },
  },
  {
    op: 'deleteLayerMask', category: 'mask', structural: true,
    summary: '删除图层蒙版（蒙版段 + 通道同删）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'which', type: 'string', required: false, desc: 'user = 用户蒙版 -2 / real = real 用户蒙版 -3 / all = 两个都删', enum: ['user', 'real', 'all'], default: 'user' },
    ],
    exampleSetup: [{ op: 'addLayerMask', index: 1 }],
    example: { op: 'deleteLayerMask', index: 1 },
  },
  {
    op: 'applyLayerMask', category: 'mask', structural: true,
    summary: '应用蒙版：灰度乘进 alpha 后删除蒙版（停用的蒙版直接删、像素不变）',
    fields: [
      F.index('；不能是分组结束分隔记录'),
      { name: 'which', type: 'string', required: false, desc: '用哪个蒙版；不给则优先 -2、没有再用 -3', enum: ['user', 'real'] },
    ],
    notes: '只支持 8/16 位；蒙版带非默认浓度 / 羽化时拒绝；不重编合成图（给 warning）。',
    exampleSetup: [{ op: 'addLayerMask', index: 1, fill: 128 }],
    example: { op: 'applyLayerMask', index: 1 },
  },
  {
    op: 'setLayerMaskPixels', category: 'mask', structural: false,
    summary: '改现有蒙版的像素（整张 / 局部矩形 / 连同 bounds），画笔的落地出口',
    fields: [
      F.index('；不能是分组结束分隔记录；图层必须已有对应蒙版'),
      { name: 'gray', type: 'array|object', required: true, desc: '灰度样本（Uint8Array / Uint16Array / number[]）或 { data, width, height }；长度 = 目标区域面积；JSON 请传 number[]' },
      { name: 'which', type: 'string', required: false, desc: 'user（-2）/ real（-3）', enum: ['user', 'real'], default: 'user' },
      { name: 'x', type: 'integer', required: false, desc: '局部矩形左上角 x（相对蒙版左上角，≥0，默认 0）' },
      { name: 'y', type: 'integer', required: false, desc: '局部矩形左上角 y（相对蒙版左上角，≥0，默认 0）' },
      { name: 'w', type: 'integer', required: false, desc: '局部矩形宽（给了 x/y/w/h 任一就必须给 w 与 h）' },
      { name: 'h', type: 'integer', required: false, desc: '局部矩形高' },
      F.bounds(false, '同时改蒙版 bounds { top, left, bottom, right }（此时 gray 要覆盖整张新蒙版）；与 x/y/w/h 互斥'),
    ],
    notes: '不给 x/y/w/h/bounds 时 gray 必须覆盖整张蒙版；保持原压缩方式；非 structural。',
    exampleSetup: [{ op: 'addLayerMask', index: 1 }],
    example: { op: 'setLayerMaskPixels', index: 1, x: 0, y: 0, w: 2, h: 2, gray: [0, 64, 128, 255] },
  },
  {
    op: 'replaceLayerMask', category: 'mask', structural: true,
    summary: '整张换掉用户蒙版（-2）的像素与范围，保留其余蒙版属性（随图层变换用）',
    fields: [
      F.index('；不能是分组结束分隔记录；图层必须已有用户蒙版'),
      F.bounds(true, '新蒙版范围 { top, left, bottom, right }，整数，宽高 > 0'),
      { name: 'gray', type: 'array', required: true, desc: '8 位灰度（长度 = bounds 宽×高）；JSON 请传 number[] —— 传字符串会被逐字符当字节，长度凑巧相等时不报错' },
      { name: 'defaultColor', type: 'integer', required: false, desc: '只能是 0 或 255', enum: [0, 255] },
    ],
    exampleSetup: [{ op: 'addLayerMask', index: 1 }],
    example: { op: 'replaceLayerMask', index: 1, bounds: { top: 748, left: 266, bottom: 750, right: 268 }, gray: [255, 0, 0, 255] },
  },

  
  {
    op: 'addShapeLayer', category: 'vector', structural: true,
    summary: '新建形状图层（SoCo 纯色填充 + vmsk 路径，可选 vstk 描边）',
    fields: [
      F.subpaths(true, '；至少一条子路径'),
      F.units(),
      F.color('填充色：\'#rrggbb\' / \'#rgb\' / [r,g,b]（0…255），默认黑', '#000000'),
      { name: 'fill', type: 'object', required: false, desc: '{ type:\'solid\', color }（color 的另一种写法；目前只支持 solid）' },
      { name: 'stroke', type: 'object', required: false, desc: '{ color, width(0.01…1000,默认1), opacity(0…100), dashOffset, cap:butt|round|square, join:miter|round|bevel, align:inside|center|outside, dash:[正数…], enabled:false=不描边 }' },
      { name: 'origin', type: 'object', required: false, desc: '实时形状属性（vogk）：{ type:\'rect\'|\'roundRect\'|\'ellipse\', left, top, right, bottom, radii?:[左上,右上,右下,左下] }（像素）；PS 属性面板据此显示可调的 W/H 与四角圆角' },
      F.at(), F.name('形状 1'), F.opacity(), F.visible(), F.clipping(), F.blendKey(),
    ],
    notes: '只支持 RGB 文档；像素坐标需落在画布附近（超 int32 定点范围拒绝）。',
    example: { op: 'addShapeLayer', name: '矩形', color: '#ff6600', subpaths: RECT_PATH },
  },
  {
    op: 'setShapeContent', category: 'vector', structural: true,
    summary: '改形状 / 填充图层的填充类型与描边类型（属性面板「外观」两个下拉）',
    fields: [
      F.index('；须是形状或填充图层'),
      { name: 'fill', type: 'object', required: false, desc: '{ type:\'none\'|\'solid\'|\'gradient\'|\'pattern\', color?, gradient?, pattern? }（gradient/pattern 结构同 addFillLayer）' },
      { name: 'stroke', type: 'object', required: false, desc: '{ type:\'none\'|\'solid\'|\'gradient\'|\'pattern\', color?, gradient?, pattern?, width?(0…1000) }' },
    ],
    notes: 'fill / stroke 至少给一个；只支持 RGB；「无填充」与描边需要图层有 vmsk 路径。',
    exampleSetup: [{ op: 'addShapeLayer', color: '#ff6600', subpaths: RECT_PATH }],
    example: { op: 'setShapeContent', index: 6, stroke: { type: 'solid', color: '#000000', width: 3 } },
  },
  {
    op: 'setShapeOrigin', category: 'vector', structural: true,
    summary: '写 / 删形状层的实时形状属性（vogk：矩形 / 圆角矩形 / 椭圆的外框与四角半径）',
    fields: [
      F.index('；须是形状图层'),
      { name: 'origin', type: 'object', required: true, desc: '{ type:\'rect\'|\'roundRect\'|\'ellipse\', left, top, right, bottom, radii?:[左上,右上,右下,左下] }；传 null = 删掉 vogk（形状在 PS 里变成普通路径）' },
    ],
    notes: '只改 vogk，不改路径：改圆角 / 尺寸时与 setVectorMaskPath 一起下发，两者要描述同一个形状。',
    exampleSetup: [{ op: 'addShapeLayer', color: '#ff6600', subpaths: RECT_PATH }],
    example: { op: 'setShapeOrigin', index: 6, origin: { type: 'roundRect', left: 10, top: 10, right: 110, bottom: 60, radii: [8, 8, 8, 8] } },
  },
  {
    op: 'addVectorMask', category: 'vector', structural: true,
    summary: '给没有矢量蒙版的图层新建矢量蒙版（vmsk）',
    fields: [F.index('；不能是分组结束分隔记录；不能已有 vmsk/vsms'), F.subpaths(true, '；实际不能为空'), F.units()],
    notes: '代码注释说「subpaths 为空 = 隐藏全部」，但 freshPathRecords 会拒绝空数组 —— 目前必须至少一条子路径。',
    example: { op: 'addVectorMask', index: 1, subpaths: RECT_PATH },
  },
  {
    op: 'setVectorMaskPath', category: 'vector', structural: true,
    summary: '整份替换已有矢量蒙版（vmsk/vsms）的路径',
    fields: [F.index('；图层必须已有矢量蒙版'), F.subpaths(true, '；空数组 = 清空路径（给 warning）'), F.units()],
    notes: 'operation / closed 缺省时沿用原子路径的值；没有矢量蒙版在 apply 阶段报错。',
    exampleSetup: [{ op: 'addVectorMask', index: 1, subpaths: RECT_PATH }],
    example: { op: 'setVectorMaskPath', index: 1, subpaths: [{ closed: true, knots: [{ anchor: [120, 120] }, { anchor: [360, 120] }, { anchor: [240, 320] }] }] },
  },
  {
    op: 'setVectorStroke', category: 'vector', structural: true,
    summary: '改矢量描边参数（vstk 描述符里的宽度 / 颜色 / 端点 / 虚线等）',
    fields: [
      F.index('；图层必须已有 vstk 块'),
      { name: 'values', type: 'object', required: true, desc: '非空对象 { 字段: 新值 }；width/dashOffset/opacity(0…100) 数字，cap:butt|round|square，join:miter|round|bevel，align:inside|center|outside，dashes:[≥0…]，color:\'#rrggbb\'|[r,g,b]|{r,g,b}（仅纯色描边），blendMode 友好名，enabled/fillEnabled/scaleLock/strokeAdjust 布尔', enum: STROKE_FIELDS },
    ],
    notes: 'values 的键也接受描述符字段名（strokeStyleLineWidth）与 lineWidth / size / dash 等同义写法。',
    exampleSetup: [{ op: 'addShapeLayer', color: '#ff6600', subpaths: RECT_PATH, stroke: { color: '#000000', width: 2 } }],
    example: { op: 'setVectorStroke', index: 6, values: { width: 4, color: '#ff0000' } },
  },
  {
    op: 'setVectorMaskFlags', category: 'vector', structural: false,
    summary: '改矢量蒙版标志位（反相 / 不链接 / 停用）与初始填充规则',
    fields: [
      F.index('；图层必须已有矢量蒙版'),
      { name: 'invert', type: 'boolean', required: false, desc: '反相' },
      { name: 'notLink', type: 'boolean', required: false, desc: '不与图层链接' },
      { name: 'disable', type: 'boolean', required: false, desc: '停用' },
      { name: 'fillStartsWithAllPixels', type: 'boolean', required: false, desc: '初始填充规则记录（selector 8）' },
    ],
    notes: '四个字段至少给一个。',
    exampleSetup: [{ op: 'addVectorMask', index: 1, subpaths: RECT_PATH }],
    example: { op: 'setVectorMaskFlags', index: 1, disable: true },
  },

  
  {
    op: 'setLayerStyle', category: 'effects', structural: true,
    summary: '整份替换一个图层的图层样式（样式面板「点样式 = 应用」；effects:null = 清除样式）',
    fields: [
      F.index(),
      { name: 'effects', type: 'object', required: false, desc: 'lfx2 口径的效果描述符（class null：Scl  / masterFXSwitch / DrSh / FrFX …）；null = 清除全部样式' },
      { name: 'effectsBytes', type: 'string', required: false, desc: '或直接给序列化后的描述符字节（.asl 里 Styl.Lefx 那一段）' },
    ],
    notes: '写 lfx2，并摘掉 lmfx / lrFX；样式里引用的图案需先用 addPatterns 写进文档。',
    example: { op: 'setLayerStyle', index: 1, effects: null },
  },
  {
    op: 'addPatterns', category: 'document', structural: true,
    summary: '把图案写进文档全局图案资源（Patt / Pat2 / Pat3），供图案填充层 / 图案叠加按 Idnt 引用',
    fields: [
      { name: 'patterns', type: 'array', required: true, desc: '[{ id(ASCII uuid), name, width, height, rgba(base64 或字节，width×height×4) }]；已有同 id 的跳过' },
    ],
    example: { op: 'addPatterns', patterns: [{ id: '00000000-0000-4000-8000-000000000001', name: '1×1', width: 1, height: 1, rgba: '/wAA/w==' }] },
  },
  {
    op: 'addLayerEffect', category: 'effects', structural: false,
    summary: '给图层新增一条图层样式效果（没有样式块时新建 lfx2）',
    fields: [
      F.index(),
      F.effect(),
      { name: 'values', type: 'object', required: false, desc: '覆盖默认模板的字段 { 路径: 值 }（如 Opct / Dstn / \'Clr \':\'#000000\'）；各效果可用路径见 core/psd-edit-create.js listCreatableEffects().fields；百分比 -100…100、角度 -360…360、像素 0…30000' },
    ],
    notes: '新条目插在最前（at=0）；只允许一条的效果重复添加会被拒绝；patternOverlay 必须用 values 指定 Ptrn.Nm / Ptrn.Idnt；lfx2 上加第二条可多重效果会整块升级为 lmfx（不可逆）。',
    example: { op: 'addLayerEffect', index: 1, effect: 'dropShadow', values: { Opct: 60, Dstn: 8, 'Clr ': '#000000' } },
  },
  {
    op: 'removeLayerEffect', category: 'effects', structural: false,
    summary: '删除一条图层样式效果（删到一条不剩时删掉整个样式块）',
    fields: [F.index(), F.effect(), { name: 'at', type: 'integer', required: false, desc: '多重效果里删第几条（≥0）', default: 0 }],
    exampleSetup: [{ op: 'addLayerEffect', index: 1, effect: 'dropShadow' }],
    example: { op: 'removeLayerEffect', index: 1, effect: 'dropShadow' },
  },
  {
    op: 'setLayerEffect', category: 'effects', structural: false,
    summary: '启用 / 停用一条已有的图层样式效果（enab）',
    fields: [
      F.index(), F.effect(),
      { name: 'enabled', type: 'boolean', required: true, desc: '启用或停用' },
      { name: 'at', type: 'integer', required: false, desc: '多重效果里改第几条（≥0）', default: 0 },
    ],
    notes: '图层没有描述符型样式块 / 没有该效果时在 apply 阶段才报错（planEdits 查不出）；老式 lrFX 不改。',
    exampleSetup: [{ op: 'addLayerEffect', index: 1, effect: 'dropShadow' }],
    example: { op: 'setLayerEffect', index: 1, effect: 'dropShadow', enabled: false },
  },
  {
    op: 'setLayerEffectsEnabled', category: 'effects', structural: false,
    summary: '图层样式整体开关（masterFXSwitch）',
    fields: [F.index(), { name: 'enabled', type: 'boolean', required: true, desc: '启用或停用全部图层样式' }],
    notes: '图层没有样式块时在 apply 阶段才报错。',
    exampleSetup: [{ op: 'addLayerEffect', index: 1, effect: 'dropShadow' }],
    example: { op: 'setLayerEffectsEnabled', index: 1, enabled: false },
  },
  {
    op: 'clearLayerEffects', category: 'effects', structural: true,
    summary: '整块摘掉图层样式（lfx2 / lmfx / lrFX），用于样式已烘进像素之后',
    fields: [F.index()],
    notes: '没有样式块时不改动（changed=false）。',
    exampleSetup: [{ op: 'addLayerEffect', index: 1, effect: 'dropShadow' }],
    example: { op: 'clearLayerEffects', index: 1 },
  },
  {
    op: 'setLayerParams', category: 'effects', structural: true,
    summary: '按路径改已有图层样式 / 调整图层 / 填充图层块里的参数（可增删渐变色标）',
    fields: [
      F.index(),
      { name: 'target', type: 'string', required: true, desc: '\'effects\'（样式顶层）/ \'effect:<效果名或 key>\'（也可裸写效果名）/ \'adjustment\'（主调整块）/ \'adjustment:<块 key>\'；块 key 见 enum', enum: ['effects', ...EFFECT_KEYS.map(k => 'effect:' + k), 'adjustment', ...PARAM_ADJ_KEYS.map(k => 'adjustment:' + k)] },
      { name: 'values', type: 'object', required: false, desc: '{ 字段路径: 新值 }（\'.\' 分段，如 \'Clr .Rd  \'、\'records.3.midtoneInput\'；颜色对象可整体赋 \'#rrggbb\'）；≤256 个；无 arrayOps 时必填且非空' },
      { name: 'at', type: 'integer', required: false, desc: '多重效果里改第几条（≥0）', default: 0 },
      { name: 'arrayOps', type: 'array', required: false, desc: '数组增删（≤64 条）：{ path, insertAt|removeAt|sortBy（三选一）, copyFrom?, value? }；仅白名单数组（渐变 Clrs/Trns、grdm 色标）；先于 values 执行' },
    ],
    notes: '只改已有块里已存在的字段；字段是否存在、块能否原样重建在 apply 阶段校验（planEdits 只查参数形状）。可用字段见 core/psd-edit-params.js getLayerParams()。',
    exampleSetup: [{ op: 'addLayerEffect', index: 1, effect: 'dropShadow' }],
    example: { op: 'setLayerParams', index: 1, target: 'effect:DrSh', values: { Opct: 40 } },
  },

  
  {
    op: 'addAdjustmentLayer', category: 'adjustment', structural: true,
    summary: '新建一个调整图层（无像素记录 + 对应调整块）',
    fields: [
      { name: 'kind', type: 'string', required: true, desc: '调整类型（也认块 key 与 brightness / hue / bw / curve / level / mixer / selective 等别名，忽略大小写与连字符）', enum: Object.keys(ADJ_ACCEPTS) },
      { name: 'values', type: 'object', required: false, desc: '按 kind 不同的参数，未知键报错；见 valuesByKind', valuesByKind: ADJ_ACCEPTS },
      F.at(), F.name('该 kind 的中文名'), F.opacity(), F.visible(), F.clipping(), F.blendKey(),
    ],
    notes: '文档必须已有图层；支持位图/灰度/索引/RGB/CMYK/多通道/双色调/Lab 模式；16/32 位文档不支持。',
    example: { op: 'addAdjustmentLayer', kind: 'hueSaturation', values: { saturation: -30 } },
  },
  {
    op: 'addFillLayer', category: 'adjustment', structural: true,
    summary: '新建填充图层：纯色（SoCo）/ 渐变（GdFl）/ 图案（PtFl），铺满画布',
    fields: [
      { name: 'kind', type: 'string', required: false, desc: '填充类型', enum: ['solid', 'gradient', 'pattern'], default: 'solid' },
      F.color('kind=solid 的颜色：\'#rrggbb\' / \'#rgb\' / [r,g,b]', '#000000'),
      { name: 'gradient', type: 'object', required: false, desc: 'kind=gradient：{ type:linear|radial|angle|reflected|diamond, angle(-360…360,默认90), scale(1…1000), stops:[{color,location 0…1,midpoint 1…99}]≥2 个≤64 个, opacityStops:[{opacity 0…100,location,midpoint}], name, dither, reverse, align }' },
      { name: 'pattern', type: 'object', required: false, desc: 'kind=pattern 时必填：{ name, id（文档 Patt 资源里的图案 uuid）, scale(1…1000), linked, angle }' },
      F.at(), F.name('纯色填充 / 渐变填充 / 图案填充'), F.opacity(), F.visible(), F.clipping(), F.blendKey(),
    ],
    notes: '只支持 RGB 文档；没有 vmsk（要限定范围请再加蒙版）。',
    example: { op: 'addFillLayer', kind: 'solid', color: '#3366ff', opacity: 128 },
  },

  
  {
    op: 'convertToSmartObject', category: 'smartObject', structural: true,
    summary: '把图层转换为内嵌智能对象（写内嵌 PSD + PlLd/SoLd + 全局 lnk2）',
    fields: [
      F.index('；不能是组，不能已是智能对象'),
      { name: 'source', type: 'object', required: true, desc: '{ data:RGBA 字节(≥ width×height×4，非预乘), width, height } 内嵌文档像素（通常就是该层像素）；JSON 可传 number[]' },
      F.bounds(false, '智能对象在画布上的位置 { left, top, right, bottom }；默认 = 图层 bounds'),
      { name: 'name', type: 'string', required: false, desc: '内嵌文件名；默认「图层名.psd」' },
      { name: 'embedded', type: 'object', required: false, desc: '现成的内嵌 PSD 字节（Uint8Array，8BPS 开头）；只能在进程内调用时传，JSON 无法表达' },
      { name: 'id', type: 'string', required: false, desc: '内嵌文件 uuid（测试用；默认随机）' },
      { name: 'placedId', type: 'string', required: false, desc: '放置实例 uuid（默认随机）' },
      { name: 'resolution', type: 'number', required: false, desc: '内嵌文档分辨率 dpi', default: 72 },
    ],
    notes: '图层原有像素 / 蒙版 / 样式不动。',
    example: { op: 'convertToSmartObject', index: 1, source: { data: [200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255], width: 2, height: 2 } },
  },
  {
    op: 'detachSmartObject', category: 'smartObject', structural: true,
    summary: '把共享内嵌文件的智能对象拆成独立副本（复制内嵌文件、换新 id）',
    fields: [F.index('；必须是智能对象')],
    notes: '外部链接的智能对象（没有内嵌文件）拒绝。',
    exampleFile: 'tshirt.psd',
    example: { op: 'detachSmartObject', index: 1 },
  },

  {
    op: 'addGallerySmartFilter', category: 'smartObject', structural: true,
    summary: '给智能对象追加一条「滤镜库」智能滤镜（SoLd.filterFX.filterFXList 末尾 = 最后应用，面板里显示在最上面）',
    fields: [
      F.index('；必须是智能对象且带 SoLd 放置描述符'),
      { name: 'entry', type: 'object', required: true, desc: 'filterFXList 的一条描述符（__classID \'filterFX\'，含 Fltr:{ classID \'GEfc\', GEfs:[…] }）；由 core/filter-gallery-spec.js 的 galleryFilterFXEntry(layers, { fg, bg }) 生成' },
    ],
    notes: '只写描述符，不重算缓存像素：图层像素请在同一批里用 replaceLayerPixels 一起写（一步撤销）。没有 filterFX 时新建（键紧跟 Rslt）。写完自检读回，末条不是刚写的滤镜就放弃。HTTP 走服务端 op addSmartFilter(kind:\'filterGallery\') 更方便（它会顺带算像素）。',
  },
  {
    op: 'setSmartFilterEntry', category: 'smartObject', structural: true,
    summary: '改智能对象上的一条智能滤镜（SoLd.filterFX.filterFXList[at]）：参数（Fltr）/ 混合选项 / 前景背景色 / 启用位',
    fields: [
      F.index('；必须是智能对象且带 SoLd 放置描述符'),
      { name: 'at', type: 'integer', required: true, desc: 'filterFXList 下标（0 = 最先应用 = PS 图层面板上最下面那条）' },
      { name: 'Fltr', type: 'object', required: false, desc: '整份新的滤镜描述符（__classID 必须与原条目相同；换滤镜种类请删掉重加）。core/smart-filter-spec.js 的 fltrWithParams(原 Fltr, kind, 参数) / 滤镜库用 galleryDescriptor(layers) 生成' },
      { name: 'blendOptions', type: 'object', required: false, desc: '{ opacity?: 0…100, mode?: 图层混合键（norm / mul  / scrn …）}，写成 PS 的 blendOptions（Opct #Prc + Md   BlnM）' },
      { name: 'fg', type: 'array', required: false, desc: '[r,g,b] 执行时的前景色（素描类滤镜库效果用；只在条目本来有 FrgC 时改）' },
      { name: 'bg', type: 'array', required: false, desc: '[r,g,b] 执行时的背景色（BckC）' },
      { name: 'enabled', type: 'boolean', required: false, desc: '这条滤镜的启用位（enab）' },
    ],
    notes: '只改描述符，不重算缓存像素：图层像素请在同一批里用 replaceLayerPixels 一起写（一步撤销）。编辑器「双击智能滤镜重开对话框 / 混合选项」走的就是它。',
  },
  {
    op: 'setStackMode', category: 'smartObject', structural: true,
    summary: '智能对象 › 堆栈模式：写进放置描述符（SoLd Type = 3「图像堆栈」+ imageStackPlugin 类；PlLd 的 placedLayerType 同步）',
    fields: [
      F.index('；必须是智能对象且带 SoLd'),
      { name: 'mode', type: 'string', required: true, desc: 'none / entropy / kurtosis / max / mean / median / min / range / skewness / stdDev / sum / variance（对应 PS 插件类 entr kurt maxx avrg medn minn rang skew stdv summ vari）', enum: ['none', 'entropy', 'kurtosis', 'max', 'mean', 'median', 'min', 'range', 'skewness', 'stdDev', 'sum', 'variance'] },
    ],
    notes: '只写描述符（none = 去掉 imageStackPlugin、Type 回 2）；统计后的缓存像素由调用方用 replaceLayerPixels 写（core/stack-modes.js 的 stackCombine）。imageStackPlugin 的存放位置按 Action Manager 口径（applyImageStackPluginRenderer 事件的 imageStackPlugin 类）推定，未拿 PS 样本逐字节核对。',
    exampleFile: 'tshirt.psd',
    example: { op: 'setStackMode', index: 1, mode: 'median' },
  },
  {
    op: 'copyLayerBlocks', category: 'structure', structural: true,
    summary: '把一层的若干附加信息块原样拷到另一层（已有同名块则替换）',
    fields: [
      { name: 'from', type: 'integer', required: true, desc: '源图层下标（底=0）' },
      { name: 'to', type: 'integer', required: true, desc: '目标图层下标' },
      { name: 'keys', type: 'array', required: true, desc: '四字符块名数组，如 [\'lfx2\', \'vmsk\']；源层没有的键跳过。不允许 lsct / lsdk / luni / lyid / SoLd / PlLd / TySh（会破坏图层身份）' },
    ],
    notes: '「智能对象 › 转换为图层」用它把智能对象的图层样式 / 矢量蒙版带到外包组上。矢量蒙版坐标是相对画布归一化的，同一文档内拷贝不用换算。',
    example: { op: 'copyLayerBlocks', from: 1, to: 4, keys: ['lfx2'] },
  },
  {
    op: 'ensureLayerIds', category: 'structure', structural: true,
    summary: '给没有 lyid 的图层补一个唯一图层 id（链接组 / 图层复合 / 变量都按 lyid 对齐）',
    fields: [],
    notes: '已有 id 的不动；新 id = 当前最大 id + 1 起递增。全部都有时 changed:false。',
    example: { op: 'ensureLayerIds' },
  },
  {
    op: 'setLinkGroups', category: 'structure', structural: true,
    summary: '链接 / 取消链接图层，或停用 / 启用链接（图像资源 1026 / 1072，按 lyid 对齐）',
    fields: [
      { name: 'indices', type: 'array', required: true, desc: '图层下标数组（底=0）；非空' },
      { name: 'link', type: 'boolean', required: false, desc: 'true = 链成一组（已在组里的并进最小组号，PS 同）；false = 从各自链接组里拿出（剩一层的组自动解散）；link:true 时至少两个图层（给了 disable 时除外）' },
      { name: 'disable', type: 'boolean', required: false, desc: '给了就只改「在组里是否停用」（PS ⇧ 点链条图标出现红叉），忽略 link' },
    ],
    notes: '会先自动补齐缺失的 lyid。',
    example: { op: 'setLinkGroups', indices: [1, 4], link: true },
  },
  {
    op: 'setLayerCompsMeta', category: 'structure', structural: true,
    summary: '写各图层的图层复合记录（shmd 块里的 cmls 子块）',
    fields: [
      { name: 'entries', type: 'array', required: true, desc: '[{ index, cmls: 描述符|null }]；cmls = 该层在各图层复合里的可见 / 位置 / 外观记录（PS 的 layerSettings 列表），null = 去掉该子块' },
    ],
    notes: '没有 shmd 就新建；shmd 里其它子块原样保留。复合本身的列表在图像资源 1065（用 setImageResource 写），与这里按 compID 对应。',
    example: { op: 'setLayerCompsMeta', entries: [{ index: 1, cmls: null }] },
  },
  {
    op: 'setLayerAnimMeta', category: 'structure', structural: true,
    summary: '写各图层的帧动画记录（shmd 块里的 mlst / mdyn 子块）',
    fields: [
      { name: 'entries', type: 'array', required: true, desc: '[{ index, mlst: 描述符|null, mdyn: 整数|null }]；mlst = 该层在各帧里的可见性 / 位置偏移 / 不透明度（PS 的 LaSt 列表，按帧 id 分组），mdyn = 统一位置 / 样式 / 可见性与「传播帧 1」标志；两者都 null = 去掉这两个子块' },
    ],
    notes: '没有 shmd 就新建；shmd 里其它子块原样保留。帧列表本身在图像资源 4000（\'mani\' / \'AnDs\'），与这里按帧 id 对应。',
    example: { op: 'setLayerAnimMeta', entries: [{ index: 1, mlst: null, mdyn: null }] },
  },

  
  {
    op: 'setArtboard', category: 'artboard', structural: true,
    summary: '把组头设为画板 / 改画板矩形与背景，或取消画板身份',
    fields: [
      F.index('；设画板时必须是组头（groupType 1/2）'),
      { name: 'rect', type: 'object', required: false, desc: '画板矩形 { top, left, bottom, right }（数字，宽高 > 0）；remove 为假时必填' },
      { name: 'presetName', type: 'string', required: false, desc: '画板预设名；默认 = 图层名' },
      F.color('背景色（backgroundType=4 时生效）', '#ffffff'),
      { name: 'backgroundType', type: 'integer|string', required: false, desc: '1 白 / 2 黑 / 3 透明 / 4 其它（用 color）；也认 white / black / transparent / custom / other', enum: [1, 2, 3, 4, 'white', 'black', 'transparent', 'custom', 'other'], default: 1 },
      { name: 'remove', type: 'boolean', required: false, desc: 'true = 删掉 artb/artd/abdd，取消画板（此时其余字段忽略；本来不是画板则报错）' },
    ],
    notes: '写 artb + abdd，原有 artd 一并更新；保留原 guideIDs。',
    example: { op: 'setArtboard', index: 2, rect: { top: 0, left: 0, bottom: 1080, right: 1920 }, backgroundType: 'white' },
  },
];

export default CORE_OP_CATALOG;
