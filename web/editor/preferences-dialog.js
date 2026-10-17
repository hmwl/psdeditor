





import { DEFAULTS, PAGES, THEME_LABELS, THEMES, CHECKER_COLORS, CHECKER_PX, clone, all, set, get, resetAll, applyInterface, checkerColors, checkerSize } from './preferences.js';

const BROWSER_WHY = '浏览器版本没有对应物';
const UNIT_OPTS = [['px', '像素'], ['in', '英寸'], ['cm', '厘米'], ['mm', '毫米'], ['pt', '点'], ['pc', '派卡'], ['pct', '百分比']];
const COLOR_NAMES = [['#4affff', '青色'], ['#6fa8ff', '浅蓝色'], ['#ff00aa', '洋红'], ['#4aff4a', '浅绿色'], ['#ff4a4a', '浅红色'], ['#ffff4a', '黄色'], ['#8c8c8c', '灰色'], ['#000000', '黑色']];



function schema(ctx) {
  const n = x => ({ t: 'note', label: x });
  return {
    general: [
      { title: '', rows: [
        { k: 'general.colorPicker', t: 'select', label: '拾色器', options: [['adobe', 'Adobe'], ['system', '系统（浏览器取色器）']], disabled: '本编辑器只有一套 PS 式拾色器（浏览器取色器不能取画布外的颜色）' },
        { k: 'general.hudPicker', t: 'select', label: 'HUD 拾色器', options: [['hueStrip', '色相条纹（小）'], ['hueStripM', '色相条纹（中）'], ['hueStripL', '色相条纹（大）'], ['hueWheel', '色相轮（小）'], ['hueWheelM', '色相轮（中）'], ['hueWheelL', '色相轮（大）']], disabled: '本编辑器没有 HUD 拾色器（⌃⌥⌘ 右键拖）' },
        { k: 'general.interp', t: 'select', label: '图像插值', options: [['nearest', '邻近（保留硬边缘）'], ['bilinear', '两次线性'], ['bicubicAuto', '两次立方（自动）'], ['bicubic', '两次立方（平滑渐变）'], ['bicubicSmoother', '两次立方（较平滑）（扩大）'], ['bicubicSharper', '两次立方（较锐利）（缩减）'], ['preserveDetails', '保留细节 2.0']], disabled: '「图像大小」对话框里有自己的重新采样下拉，这一项还没接成它的默认值' },
      ] },
      { title: '选项', rows: [
        { k: 'general.autoUpdate', t: 'check', label: '自动更新打开的基于文件的文档', disabled: '浏览器拿不到磁盘文件的修改通知（没有文件系统监听）' },
        { k: 'general.beep', t: 'check', label: '完成后用声音提示', disabled: '浏览器页面不能在后台主动发声（音频需要用户手势才能播放）' },
        { k: 'general.exportClipboard', t: 'check', label: '导出剪贴板', disabled: '浏览器剪贴板由系统管理，页面关闭后内容本来就留着' },
        { k: 'general.resizeOnPlace', t: 'check', label: '在置入时调整图像大小', disabled: '本编辑器的「置入」目前是替换智能对象内容，没有独立的置入流程' },
        { k: 'general.placeSmart', t: 'check', label: '在置入时始终创建智能对象', disabled: '本编辑器的「置入」目前是替换智能对象内容，没有独立的置入流程' },
        { k: 'general.skipTransformOnPlace', t: 'check', label: '在置入时跳过变换', disabled: '本编辑器的「置入」目前是替换智能对象内容，没有独立的置入流程' },
        { k: 'general.legacyFreeTransform', t: 'check', label: '使用旧版自由变换（Shift 等比）' },
        { k: 'general.legacyNewDoc', t: 'check', label: '使用旧版「新建文档」界面', disabled: '本编辑器只有一套新建文档对话框' },
        { k: 'general.homeScreen', t: 'check', label: '自动显示主屏幕', disabled: '没有主屏幕（Adobe 云内容）' },
      ] },
      { title: '', rows: [
        { t: 'button', label: '复位所有警告对话框', run: ctx.resetWarnings },
        { t: 'button', label: '重置首选项…', run: ctx.resetPrefs },
      ] },
    ],
    interface: [
      { title: '外观', rows: [
        { k: 'interface.theme', t: 'swatches', label: '颜色方案', options: THEME_LABELS.map(([v, l]) => [v, l, THEMES[v].bg]) },
        { k: 'interface.highlight', t: 'select', label: '高亮颜色', options: [['default', '默认'], ['blue', '蓝色']] },
        { k: 'interface.neutralColorMode', t: 'check', label: '中性颜色模式' },
      ] },
      { title: '', grid: true, head: ['', '颜色', '边界'], rows: [
        { t: 'pair', label: '标准屏幕模式', keys: ['interface.canvas.standard.color', 'interface.canvas.standard.border'] },
        { t: 'pair', label: '全屏（带菜单）', keys: ['interface.canvas.fullMenu.color', 'interface.canvas.fullMenu.border'] },
        { t: 'pair', label: '全屏', keys: ['interface.canvas.full.color', 'interface.canvas.full.border'] },
        { t: 'pair', label: '画板', keys: ['interface.canvas.artboards.color', 'interface.canvas.artboards.border'], disabledBorder: '画板轮廓由画布叠加绘制，尚未接入此边界样式' },
        { k: 'interface.canvas.standard.custom', t: 'color', label: '标准屏幕 · 自定颜色', show: p => p.interface.canvas.standard.color === 'custom' },
        { k: 'interface.canvas.fullMenu.custom', t: 'color', label: '全屏（带菜单）· 自定颜色', show: p => p.interface.canvas.fullMenu.color === 'custom' },
        { k: 'interface.canvas.full.custom', t: 'color', label: '全屏 · 自定颜色', show: p => p.interface.canvas.full.color === 'custom' },
        { k: 'interface.canvas.artboards.custom', t: 'color', label: '画板 · 自定颜色', show: p => p.interface.canvas.artboards.color === 'custom' },
      ] },
      { title: '呈现', rows: [
        { k: 'interface.uiScale', t: 'select', label: '用户界面缩放', options: [['auto', '自动'], ['100', '100%'], ['200', '200%']] },
        { k: 'interface.textSize', t: 'select', label: '用户界面字体大小', options: [['tiny', '微小'], ['small', '小'], ['medium', '中'], ['large', '大']] },
        { k: 'interface.scaleToFont', t: 'check', label: '缩放 UI 以适合字体' },
        n('更改在下次打开对话框 / 面板时完全生效（PS 要重启；这里即刻生效）。'),
      ] },
      { title: '选项', rows: [
        { k: 'interface.channelsInColor', t: 'check', label: '用彩色显示通道', disabled: '还没接：通道面板缩览图固定按灰度显示' },
        { k: 'interface.dynamicSliders', t: 'check', label: '动态颜色滑块', disabled: '颜色面板的滑块本来就按当前颜色动态着色（等同开着），不能关' },
        { k: 'interface.menuColors', t: 'check', label: '显示菜单颜色' },
      ] },
    ],
    workspace: [
      { title: '', rows: [
        { k: 'workspace.autoCollapseIcons', t: 'check', label: '自动折叠图标面板', disabled: '还没接：图标面板点别处总是自动收起（等同开着）' },
        { k: 'workspace.autoShowHidden', t: 'check', label: '自动显示隐藏面板', disabled: '还没接：Tab 隐藏的面板不会因鼠标靠边而弹出' },
        { k: 'workspace.openAsTabs', t: 'check', label: '以选项卡方式打开文档' },
        { k: 'workspace.floatDocDocking', t: 'check', label: '启用浮动文档窗口停放' },
        { k: 'workspace.largeTabs', t: 'check', label: '大选项卡' },
        { k: 'workspace.narrowOptionsBar', t: 'check', label: '启用窄选项栏' },
        { k: '_nativeFullScreen', t: 'check', label: '启用本机全屏', disabled: '本机窗口全屏需要 macOS 原生窗口；本编辑器通过「视图 › 屏幕模式」使用浏览器全屏' },
        { t: 'button', label: '恢复默认工作区', run: ctx.restoreWorkspace },
      ] },
    ],
    notifications: [
      { title: '通知', rows: [
        { k: 'tools.showTooltips', t: 'check', label: '显示工具提示' },
        { k: 'tools.richTooltips', t: 'check', label: '显示丰富的工具提示', disabled: '尚未内置工具视频演示' },
        { k: '_featureOnboarding', t: 'check', label: '功能入门指南', disabled: '尚未内置分步工作流导览' },
        { k: '_whatsNew', t: 'check', label: '新增功能', disabled: '本编辑器尚未提供主屏幕新增功能通知' },
        { t: 'info', label: '系统警报', value: () => '始终处于活动状态' },
      ] },
    ],
    tools: [
      { title: '', rows: [
        { k: 'tools.shiftToolSwitch', t: 'check', label: '使用 Shift 键切换工具' },
        { k: 'tools.wheelZoom', t: 'check', label: '用滚轮缩放' },
        { k: 'tools.animatedZoom', t: 'check', label: '带动画效果的缩放' },
        { k: 'tools.zoomResizeWindows', t: 'check', label: '缩放时调整窗口大小', disabled: '浏览器标签页不能由页面调整顶层窗口大小' },
        { k: 'tools.zoomClickCenter', t: 'check', label: '将单击点缩放至中心' },
        { k: 'tools.flickPanning', t: 'check', label: '启用轻击平移', disabled: '还没接：抓手松手不带惯性' },
        { k: 'tools.touchRotate', t: 'check', label: '启用手势' },
        { k: 'tools.springLoaded', t: 'check', label: '弹簧加载的工具快捷键' },
        { k: 'tools.springTiming', t: 'number', label: '计时敏感度', min: 200, max: 1000, unit: '毫秒', enabled: p => p.tools.springLoaded },
        { k: 'tools.dblClickMaskSelectAndMask', t: 'check', label: '双击图层蒙版可启动「选择并遮住」工作区' },
        { k: 'tools.showRefPoint', t: 'check', label: '变换时显示参考点' },
        { k: 'tools.overscroll', t: 'check', label: '过度滚动', disabled: '还没接：画布平移总是保留 24px 与视口重叠' },
        { k: 'tools.hudHardness', t: 'check', label: '根据 HUD 垂直移动来更改圆形画笔硬度', disabled: '本编辑器的 ⌃⌥ 拖动 HUD：左右 = 大小、上下 = 硬度（等同开着），不能关' },
        { k: 'tools.snapVectorToPixel', t: 'check', label: '将矢量工具与变换与像素网格对齐', disabled: '还没接：矢量工具总是按亚像素坐标' },
        { k: 'tools.transformValues', t: 'select', label: '显示变换值', options: [['topRight', '右上'], ['bottomRight', '右下'], ['bottomLeft', '左下'], ['topLeft', '左上'], ['never', '从不']], disabled: '还没接：变换时的数值提示固定在指针右上' },
      ] },
    ],
    history: [
      { title: '历史记录', rows: [
        { k: 'history.states', t: 'number', label: '历史记录状态', min: 1, max: 1000, unit: '（撤销上限）' },
        { k: 'history.log', t: 'check', label: '历史记录日志' },
        { k: 'history.logTo', t: 'radio', label: '将记录项目存储到', options: [['text', '文本文件']], show: p => p.history.log },
        { k: 'history.logItems', t: 'select', label: '编辑记录项目', options: [['sessions', '仅限会话'], ['concise', '简明'], ['detailed', '详细']], show: p => p.history.log },
        { t: 'button', label: '存储日志文本文件…', run: ctx.saveHistoryLog, show: p => p.history.log },
        n('文本文件：点上面的按钮把本次会话的日志下载成 .txt。「元数据」（写进 PSD 的 XMP photoshop:History）还没接，所以只剩文本文件一档。'),
      ] },
      { title: '内容凭证', rows: [
        n('内容凭证（C2PA）要用 Adobe 签发的签名证书，并把清单上传到 Adobe 的内容凭证云 —— 浏览器版本做不到，置灰。'),
        { k: '_c2pa', t: 'check', label: '存储时始终附加内容凭证', disabled: '需要 Adobe 签名证书与云服务' },
      ] },
    ],
    file: [
      { title: '文件存储选项', rows: [
        { k: 'file.imagePreviews', t: 'select', label: '图像预览', options: [['always', '总是存储'], ['never', '从不存储'], ['ask', '存储时询问']], disabled: '浏览器下载的文件没有 Finder / 资源管理器缩览图资源' },
        { k: 'file.extCase', t: 'select', label: '文件扩展名', options: [['lower', '使用小写'], ['upper', '使用大写']], disabled: '还没接：导出文件名固定用小写扩展名' },
        { k: 'file.saveToOriginal', t: 'check', label: '存储至原始文件夹', disabled: '浏览器拿不到原文件所在的文件夹路径' },
        { k: 'file.backgroundSave', t: 'check', label: '后台存储', disabled: '导出本来就在后台异步写（等同开着）' },
        { k: 'file.autoSave', t: 'check', label: '自动存储恢复信息' },
        { k: 'file.autoSaveMin', t: 'select', label: '自动存储恢复信息的间隔', options: [[5, '5 分钟'], [10, '10 分钟'], [15, '15 分钟'], [30, '30 分钟'], [60, '1 小时']], enabled: p => p.file.autoSave },
        n('恢复信息存在本浏览器的 IndexedDB 里（有改动的活动文档，整份 PSD）；标签页崩溃或没存就关掉后，下次打开编辑器会问要不要恢复。正常关闭文档时会删掉。'),
      ] },
      { title: '文件兼容性', rows: [
        { k: 'file.ignoreExifProfile', t: 'check', label: '忽略 EXIF 配置文件标记', disabled: '还没接' },
        { k: 'file.ignoreRotation', t: 'check', label: '忽略旋转元数据', disabled: '浏览器解码 JPEG 时按 EXIF 方向自动转正，页面关不掉' },
        { k: 'file.askTiffLayers', t: 'check', label: '存储分层的 TIFF 文件之前进行询问', disabled: '本编辑器不写分层 TIFF' },
        { k: 'file.disableCompression', t: 'check', label: '停用 PSD 和 PSB 文件压缩', disabled: '还没接：PSD 写出固定用 RLE 压缩' },
        { k: 'file.psdCompat', t: 'select', label: '最大兼容 PSD 和 PSB 文件', options: [['always', '总是'], ['ask', '询问'], ['never', '从不']], disabled: '写出 PSD 时总是带合成图（等同「总是」）' },
      ] },
      { title: '', rows: [
        { k: 'file.recentCount', t: 'number', label: '近期文件列表包含', min: 0, max: 100, unit: '个文件' },
      ] },
    ],
    export: [
      { title: '快速导出', rows: [
        { k: 'export.quickFormat', t: 'select', label: '快速导出格式', options: [['png', 'PNG'], ['jpg', 'JPG'], ['gif', 'GIF'], ['svg', 'SVG']], disabled: '还没接：快速导出固定为 PNG（文件 › 导出 › 导出为… 可选格式）' },
        { k: 'export.quickLocation', t: 'radio', label: '快速导出位置', options: [['ask', '每次询问导出位置'], ['assets', '将文件导出到当前文档旁的资源文件夹']], disabled: '浏览器下载位置由浏览器决定' },
        { k: 'export.quickMeta', t: 'radio', label: '快速导出元数据', options: [['none', '无'], ['copyright', '版权和联系信息']], disabled: '还没接' },
        { k: 'export.quickSrgb', t: 'check', label: '转换为 sRGB', disabled: '导出总是转换为 sRGB（等同开着）' },
        { k: 'export.useLegacyExport', t: 'check', label: '使用旧版「导出为」', disabled: '本编辑器只有一套「导出为」' },
      ] },
    ],
    performance: [
      { title: '内存使用情况', rows: [
        { t: 'info', label: '可用内存', value: () => (navigator.deviceMemory ? `约 ${navigator.deviceMemory} GB（浏览器只给到这个粒度）` : '浏览器不公开') },
        { k: 'performance.memoryPct', t: 'range', label: '让 PSD Editor 使用', min: 20, max: 100, unit: '%' },
        n('浏览器的总内存上限由浏览器定；这里的比例决定历史记录（撤销快照）最多占多少：设备内存 × 比例 × ⅙（最多 1 GB），超出时从最早的步骤起丢弃（PS 是换到暂存盘，浏览器没有）。'),
      ] },
      { title: '历史记录与高速缓存', rows: [
        { k: 'history.states', t: 'number', label: '历史记录状态', min: 1, max: 1000 },
        { k: 'performance.cacheLevels', t: 'number', label: '高速缓存级别', min: 1, max: 8, disabled: '本编辑器没有图像金字塔高速缓存（合成按视口实时算）' },
        { k: 'performance.cacheTile', t: 'select', label: '高速缓存拼贴大小', options: [['128', '128K'], ['256', '256K'], ['1024', '1024K']], disabled: '本编辑器没有图像金字塔高速缓存（合成按视口实时算）' },
        { t: 'buttons', items: [['为 Web / 用户界面设计优化', () => ctx.setPerf(20, 2, '128')], ['默认 / 照片', () => ctx.setPerf(50, 4, '1024')], ['超大像素大小', () => ctx.setPerf(50, 6, '1024')]] },
        n('历史记录状态直接决定撤销上限（历史记录面板的条数与 ⌘Z 能走回的步数）；笔画类步骤存的是像素，另外封顶 200 步。'),
      ] },
      { title: '图形处理器设置', rows: [
        { t: 'info', label: '检测到的图形处理器', value: ctx.gpuName },
        { k: 'performance.gpu', t: 'check', label: '使用图形处理器' },
        n('开着时画布预览用 WebGPU 在显卡上按视口合成（底下是 Metal / Direct3D 12 / Vulkan）：图层常驻显存，平移、缩放、改参数、画笔与文档大小无关，几 GB 的文档也流畅。浏览器没有 WebGPU、或遇到它不支持的显示状态时自动退回 CPU 合成。存盘与导出始终用 CPU 合成（结果逐字节确定）。'),
      ] },
    ],
    imageProcessing: [
      { title: '', rows: [
        n('「图像处理」页（选择主体 / 移除背景 / 内容识别填充的处理方式：云端 / 设备）只管 AI 模型的跑法。本编辑器不接 AI 模型，这一页没有可设的项。'),
        { k: '_ip', t: 'select', label: '选择主体和移除背景', options: [['device', '设备（更快）']], disabled: '不做（永久）：依赖 AI 模型' },
      ] },
    ],
    scratch: [
      { title: '暂存盘', rows: [
        n('PS 把放不进内存的图块换到磁盘上的「暂存盘」。浏览器页面不能直接写磁盘分区，内存不够时由浏览器自己管理（标签页可能被回收）。所以这一页只作说明。'),
        { t: 'info', label: '浏览器存储配额', value: ctx.storageQuota },
        { k: '_scratch', t: 'check', label: '启动盘（活动）', disabled: '浏览器里没有可选的暂存盘' },
      ] },
    ],
    cursors: [
      { title: '绘画光标', rows: [
        { k: 'cursors.paint', t: 'radio', label: '', options: [['standard', '标准'], ['precise', '精确'], ['normal', '正常画笔笔尖'], ['full', '全尺寸画笔笔尖']], preview: 'paint' },
        { k: 'cursors.crosshairInTip', t: 'check', label: '在画笔笔尖显示十字线', show: p => p.cursors.paint === 'normal' || p.cursors.paint === 'full' },
        { k: 'cursors.crosshairWhilePainting', t: 'check', label: '绘画时仅显示十字线', show: p => p.cursors.paint === 'normal' || p.cursors.paint === 'full' },
      ] },
      { title: '其它光标', rows: [
        { k: 'cursors.other', t: 'radio', label: '', options: [['standard', '标准'], ['precise', '精确']] },
      ] },
      { title: '画笔预览', rows: [
        { k: 'cursors.previewColor', t: 'color', label: '颜色' },
        n('画笔预览 = ⌃⌥ 拖动（Win：Alt+右键拖）调大小 / 硬度时画布上那团半透明色块。Caps Lock 仍会把绘画光标临时换成精确十字。'),
      ] },
    ],
    transparency: [
      { title: '透明区域设置', rows: [
        { k: 'transparency.gridSize', t: 'select', label: '网格大小', options: [['none', '无'], ['small', '小'], ['medium', '中'], ['large', '大']] },
        { k: 'transparency.gridColors', t: 'select', label: '网格颜色', options: [['light', '浅'], ['medium', '中'], ['dark', '深'], ['red', '红色'], ['orange', '橙色'], ['green', '绿色'], ['blue', '蓝色'], ['purple', '紫色'], ['custom', '自定']] },
        { k: 'transparency.color1', t: 'color', label: '网格颜色 1', show: p => p.transparency.gridColors === 'custom' },
        { k: 'transparency.color2', t: 'color', label: '网格颜色 2', show: p => p.transparency.gridColors === 'custom' },
        { t: 'checker' },
      ] },
      { title: '色域警告', rows: [
        { k: 'transparency.gamutColor', t: 'color', label: '颜色' },
        { k: 'transparency.gamutOpacity', t: 'number', label: '不透明度', min: 1, max: 100, unit: '%' },
      ] },
    ],
    units: [
      { title: '单位', rows: [
        { k: 'units.rulers', t: 'select', label: '标尺', options: UNIT_OPTS.filter(u => u[0] !== 'pct') },
        { k: 'units.type', t: 'select', label: '文字', options: [['pt', '点'], ['px', '像素'], ['mm', '毫米']], disabled: '还没接：文字大小固定按「点」显示' },
      ] },
      { title: '列尺寸', rows: [
        { k: 'units.colWidth', t: 'number', label: '宽度', min: 1, max: 5000, unit2: 'units.colWidthUnit', disabled: '还没接：新建文档没有「列」单位' },
        { k: 'units.gutter', t: 'number', label: '装订线', min: 0, max: 5000, unit2: 'units.gutterUnit', disabled: '还没接：新建文档没有「列」单位' },
      ] },
      { title: '新文档预设分辨率', rows: [
        { k: 'units.printRes', t: 'number', label: '打印分辨率', min: 1, max: 10000, unit: '像素/英寸', disabled: '还没接：新建文档预设的分辨率写在各预设里' },
        { k: 'units.screenRes', t: 'number', label: '屏幕分辨率', min: 1, max: 10000, unit: '像素/英寸', disabled: '还没接：新建文档预设的分辨率写在各预设里' },
      ] },
      { title: '点/派卡大小', rows: [
        { k: 'units.pointSize', t: 'radio', label: '', options: [['postscript', 'PostScript（72 点/英寸）'], ['traditional', '传统（72.27 点/英寸）']], disabled: '还没接：点 / 派卡固定按 PostScript（72 点/英寸）换算' },
      ] },
    ],
    guides: [
      { title: '参考线', rows: [
        { k: 'guides.canvasColor', t: 'colorName', label: '画布', style: 'guides.canvasStyle' },
        { k: 'guides.artboardColor', t: 'colorName', label: '画板', style: 'guides.artboardStyle' },
      ] },
      { title: '智能参考线', rows: [{ k: 'guides.smartColor', t: 'colorName', label: '颜色' }] },
      { title: '网格', rows: [
        { k: 'guides.gridColor', t: 'colorName', label: '颜色', style: 'guides.gridStyle', dots: true },
        { k: 'guides.gridEvery', t: 'number', label: '网格线间隔', min: 1, max: 10000, unit2: 'guides.gridUnit' },
        { k: 'guides.gridSub', t: 'number', label: '子网格', min: 1, max: 100 },
      ] },
      { title: '切片', rows: [
        { k: 'guides.sliceColor', t: 'colorName', label: '线条颜色' },
        { k: 'guides.sliceNumbers', t: 'check', label: '显示切片编号' },
      ] },
      { title: '路径选项', rows: [
        { k: 'guides.pathColor', t: 'color', label: '颜色' },
        { k: 'guides.pathWidth', t: 'select', label: '粗细', options: [[0.5, '0.5 像素'], [1, '1 像素'], [2, '2 像素'], [3, '3 像素']] },
      ] },
    ],
    plugins: [
      { title: '增效工具', rows: [
        n('增效工具（UXP / C++ 插件、Generator、远程连接、增效工具市场）需要 PS 的原生插件宿主与 Adobe 账号，浏览器里没有。整页置灰。'),
        { k: 'plugins.generator', t: 'check', label: '启用 Generator', disabled: '需要 PS 原生插件宿主' },
        { k: 'plugins.remoteConnections', t: 'check', label: '启用远程连接', disabled: '需要 PS 原生插件宿主' },
        { k: 'plugins.legacyPanels', t: 'check', label: '载入扩展面板', disabled: '需要 CEP 扩展宿主' },
      ] },
    ],
    type: [
      { title: '文字选项', rows: [
        { k: 'type.smartQuotes', t: 'check', label: '使用智能引号' },
        { k: 'type.missingGlyph', t: 'check', label: '启用缺失字形保护', disabled: '浏览器排字时自动做字体回退（等同开着），页面关不掉' },
        { k: 'type.englishFontNames', t: 'check', label: '以英文显示字体名称' },
        { k: 'type.enableMatchFont', t: 'check', label: '启用「匹配字体」中的语言检测', disabled: '「匹配字体」是 Adobe 的云端识别服务' },
        { k: 'type.fontPreview', t: 'select', label: '字体预览大小', options: [['none', '无'], ['small', '小'], ['medium', '中'], ['large', '大'], ['xl', '特大'], ['xxl', '超大']] },
      ] },
      { title: '选取文本引擎选项', rows: [
        { k: 'type.engine', t: 'radio', label: '', options: [['eastAsian', '东亚'], ['worldReady', '全球通用布局（Unicode World-Ready）']], disabled: '还没接：文字引擎按图层自身的 EngineData 走' },
        n('东亚引擎：新建文字层按东亚排版规则（避头尾、标点挤压）写 EngineData；全球通用：按 Unicode 双向文本 / 复杂文字规则。'),
      ] },
    ],
    enhancedControls: [
      { title: 'Touch Bar', rows: [
        { k: '_touchBarPropertyFeedback', t: 'check', label: '显示 Touch Bar 属性调整', disabled: '浏览器没有 macOS Touch Bar 控制接口' },
      ] },
    ],
    productImprovement: [
      { title: 'Photoshop 改进计划', rows: [
        n('此页对应本地 Photoshop 的 Adobe 产品改进计划。本编辑器未连接该计划。'),
        { k: '_productImprovement', t: 'check', label: '是，我愿意参与', disabled: '需要 Adobe 产品改进服务' },
        { k: '_generativeTraining', t: 'check', label: '授予 Adobe 使用图像和关联数据来训练生成式图层模型的权限', disabled: '需要 Adobe 产品改进服务' },
      ] },
    ],
    tech: [
      { title: '技术预览', rows: [
        n('选项按本机 Photoshop 2026 核对。JPEG 图层选项对下一次打开生效；其余项的可用性取决于本编辑器支持的显示和处理能力。'),
        { k: 'tech.preserveDetails2', t: 'check', label: '启用保留细节 2.0 放大', disabled: '本编辑器没有对应的实验实现' },
        { k: 'tech.contentAwareTracing', t: 'check', label: '启用内容感知描摹工具', disabled: '尚未实现 Photoshop 的内容感知描摹工具' },
        { k: 'tech.preciseHDR', t: 'check', label: '精确管理 HDR 显示屏的颜色', disabled: '画布目前使用 SDR 输出，没有对应的 HDR 显示管理开关' },
        { k: 'tech.precise16Preview', t: 'check', label: '16 位文档的精确预览', disabled: '16 位原始数据已保留，画布预览仍为 8 位显示；尚未实现可切换的 16 位预览' },
        { k: 'tech.openJpegWithoutBackground', t: 'check', label: '打开不带背景图层的 JPEG 文档' },
        { k: 'tech.modernUI', t: 'check', label: '启用现代用户界面', disabled: '本编辑器仅有当前界面，没有可切换的旧版原生控件' },
      ] },
    ],
  };
}

let dlgStyleDone = false;
function ensureDlgStyle() {
  if (dlgStyleDone || typeof document === 'undefined') return; dlgStyleDone = true;
  const s = document.createElement('style');
  s.textContent = `
  dialog.fp-dlg.fp-prefs { width: min(860px, 94vw); max-width: none; height: min(600px, 88vh); padding: 0; }
  .fp-prefs .pf-wrap { display: grid; grid-template-columns: 190px 1fr 120px; height: 100%; }
  .fp-prefs .pf-nav { border-right: 1px solid var(--ps-line); overflow: auto; padding: 8px 0; background: var(--ps-bg-2); }
  .fp-prefs .pf-nav button { display: block; width: 100%; text-align: left; border: 0; border-radius: 0; background: transparent; height: 24px; padding: 0 12px; color: var(--ps-text); }
  .fp-prefs .pf-nav button.on { background: var(--ps-accent); color: #fff; }
  .fp-prefs .pf-body { overflow: auto; padding: 12px 16px; }
  .fp-prefs .pf-body h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
  .fp-prefs fieldset { border: 1px solid var(--ps-line-2); border-radius: 3px; margin: 0 0 12px; padding: 8px 10px; }
  .fp-prefs legend { padding: 0 4px; color: var(--ps-muted); }
  .fp-prefs .pf-row { display: flex; align-items: center; gap: 8px; min-height: 24px; }
  .fp-prefs .pf-row > .pf-lab { width: 150px; flex: none; }
  .fp-prefs .pf-row.chk > .pf-lab { width: auto; }
  .fp-prefs .pf-row.dis { opacity: .45; }
  .fp-prefs .pf-note { color: var(--ps-muted); font-size: 11px; line-height: 1.6; margin: 4px 0; }
  .fp-prefs .pf-radio { display: flex; flex-direction: column; gap: 3px; }
  .fp-prefs .pf-radio.h { flex-direction: row; flex-wrap: wrap; gap: 12px; }
  .fp-prefs .pf-sw { display: flex; gap: 8px; }
  .fp-prefs .pf-sw button { width: 34px; height: 26px; border: 2px solid transparent; padding: 0; }
  .fp-prefs .pf-sw button.on { border-color: var(--ps-accent); }
  .fp-prefs .pf-side { border-left: 1px solid var(--ps-line); padding: 12px 10px; display: flex; flex-direction: column; gap: 8px; }
  .fp-prefs .pf-side button { width: 100%; }
  .fp-prefs .pf-grid { display: grid; grid-template-columns: 150px 1fr 1fr; gap: 6px 8px; align-items: center; }
  .fp-prefs .pf-checker { width: 120px; height: 60px; border: 1px solid var(--ps-line-2); background: var(--fp-checker-preview); }
  .fp-prefs .pf-curprev { width: 44px; height: 44px; border: 1px solid var(--ps-line-2); background: #fff; }
  `;
  document.head.appendChild(s);
}

const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) { if (!t[k] || typeof t[k] !== 'object') t[k] = {}; t = t[k]; } t[ks[ks.length - 1]] = v; };
const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

let openDlg = null;




export function openPreferencesDialog(page = 'general', ctx = {}) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (openDlg) openDlg.prefCancel();
  ensureDlgStyle();
  const work = clone(all());
  const C = {
    resetWarnings: () => { try { for (const k of Object.keys(localStorage)) if (/dontShow|noWarn|skipWarn|warned/i.test(k)) localStorage.removeItem(k); } catch {} if (ctx.resetWarnings) ctx.resetWarnings(); flash('已复位所有警告对话框'); },
    resetPrefs: () => { if (!confirm('要把全部首选项恢复成默认值吗？（不影响文档）')) return; const d = clone(DEFAULTS); for (const k of Object.keys(work)) delete work[k]; Object.assign(work, d); render(); },
    saveHistoryLog: () => ctx.saveHistoryLog && ctx.saveHistoryLog(),
    setPerf: (states, levels, tile) => { setPath(work, 'history.states', states); setPath(work, 'performance.cacheLevels', levels); setPath(work, 'performance.cacheTile', tile); render(); },
    gpuName: ctx.gpuName || (() => '（未知）'),
    storageQuota: ctx.storageQuota || (() => '（未知）'),
    restoreWorkspace: ctx.restoreWorkspace || (() => import('./actions.js').then(({ actions }) => actions.run('window.workspace.reset'))),
  };
  const S = schema(C);
  const d = document.createElement('dialog'); d.className = 'fp-dlg fp-prefs'; openDlg = d;
  const wrap = document.createElement('div'); wrap.className = 'pf-wrap';
  const nav = document.createElement('div'); nav.className = 'pf-nav';
  const body = document.createElement('div'); body.className = 'pf-body';
  const side = document.createElement('div'); side.className = 'pf-side';
  wrap.append(nav, body, side); d.append(wrap);
  let cur = S[page] ? page : 'general';
  let flashEl = null;
  function flash(msg) { if (!flashEl) return; flashEl.textContent = msg; setTimeout(() => { if (flashEl) flashEl.textContent = ''; }, 2500); }
  for (const [id, label] of PAGES) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.page = id;
    b.onclick = () => { cur = id; render(); };
    nav.append(b);
  }
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  function field(r) {
    const row = mk('div', { className: 'pf-row' });
    const dis = !!r.disabled || (r.enabled && !r.enabled(work));
    if (dis) { row.classList.add('dis'); if (r.disabled) row.title = r.disabled; }
    const val = r.k ? getPath(work, r.k) : undefined;
    const put = v => { if (r.k && !r.k.startsWith('_')) setPath(work, r.k, v); render(true); };
    if (r.t === 'note') { const p = mk('div', { className: 'pf-note', textContent: r.label }); return p; }
    if (r.t === 'check') {
      row.classList.add('chk');
      const cb = mk('input', { type: 'checkbox', checked: !!val, disabled: dis }); cb.dataset.k = r.k;
      cb.onchange = () => put(cb.checked);
      const lab = mk('label', { className: 'pf-lab' }); lab.append(cb, document.createTextNode(' ' + r.label));
      row.append(lab); return row;
    }
    if (r.t === 'button') { const b = mk('button', { type: 'button', textContent: r.label }); b.onclick = () => r.run && r.run(); row.append(b); return row; }
    if (r.t === 'buttons') { for (const [l, fn] of r.items) { const b = mk('button', { type: 'button', textContent: l }); b.onclick = fn; row.append(b); } return row; }
    if (r.t === 'checker') {
      const box = mk('div', { className: 'pf-checker' });
      const T = work.transparency;
      const cols = T.gridColors === 'custom' ? [T.color1, T.color2] : (CHECKER_COLORS[T.gridColors] || CHECKER_COLORS.light);
      const px = CHECKER_PX[T.gridSize] ?? 8;
      box.style.background = px ? `repeating-conic-gradient(${cols[0]} 0% 25%, ${cols[1]} 0% 50%) 0 0 / ${px * 2}px ${px * 2}px` : cols[0];
      row.append(mk('span', { className: 'pf-lab', textContent: '预览' }), box); return row;
    }
    row.append(mk('span', { className: 'pf-lab', textContent: r.label || '' }));
    let el;
    if (r.t === 'info') {
      el = mk('span', { textContent: '…' });
      Promise.resolve().then(() => r.value()).then(v => { el.textContent = v; }).catch(() => { el.textContent = '（未知）'; });
    } else if (r.t === 'select') {
      el = mk('select', { disabled: dis });
      for (const [v, l] of r.options) el.append(mk('option', { value: String(v), textContent: l }));
      el.value = String(val ?? r.options[0][0]);
      el.onchange = () => { const o = r.options.find(x => String(x[0]) === el.value); put(o ? o[0] : el.value); };
    } else if (r.t === 'radio') {
      el = mk('div', { className: 'pf-radio' + (r.options.length > 3 || r.preview ? '' : ' h') });
      const name = 'pf_' + r.k.replace(/\./g, '_');
      for (const [v, l] of r.options) {
        const lab = mk('label'); const rb = mk('input', { type: 'radio', name, value: v, checked: val === v, disabled: dis });
        rb.dataset.k = r.k;
        rb.onchange = () => { if (rb.checked) put(v); };
        lab.append(rb, document.createTextNode(' ' + l)); el.append(lab);
      }
      if (r.preview === 'paint') {
        const cv = mk('canvas', { className: 'pf-curprev', width: 44, height: 44 });
        drawCursorPreview(cv, work.cursors);
        const holder = mk('div', { style: 'display:flex;gap:16px;align-items:center' }); holder.append(el, cv);
        row.append(holder); return row;
      }
    } else if (r.t === 'number') {
      el = mk('input', { type: 'number', value: val, min: r.min ?? '', max: r.max ?? '', disabled: dis, style: 'width:80px' }); el.dataset.k = r.k;
      el.onchange = () => { let v = +el.value; if (!Number.isFinite(v)) v = val; if (r.min != null) v = Math.max(r.min, v); if (r.max != null) v = Math.min(r.max, v); el.value = v; put(v); };
      row.append(el);
      if (r.unit2) {
        const u = mk('select'); for (const [v, l] of UNIT_OPTS) u.append(mk('option', { value: v, textContent: l }));
        u.value = getPath(work, r.unit2) || 'px'; u.onchange = () => { setPath(work, r.unit2, u.value); render(true); };
        row.append(u);
      }
      if (r.unit) row.append(mk('span', { textContent: r.unit, style: 'opacity:.7' }));
      return row;
    } else if (r.t === 'range') {
      el = mk('input', { type: 'range', min: r.min, max: r.max, value: val, disabled: dis }); el.dataset.k = r.k;
      const amount = mk('span', { textContent: val + (r.unit || '') });
      el.oninput = () => { setPath(work, r.k, +el.value); amount.textContent = el.value + (r.unit || ''); };
      el.onchange = () => render(true);
      row.append(el, amount); return row;
    } else if (r.t === 'color') {
      el = mk('input', { type: 'color', value: val || '#000000', disabled: dis }); el.oninput = () => { setPath(work, r.k, el.value); };
      el.onchange = () => put(el.value);
    } else if (r.t === 'colorName') {
      
      el = mk('span', { style: 'display:inline-flex;gap:6px;align-items:center' });
      const sel = mk('select');
      const named = COLOR_NAMES.find(c => c[0].toLowerCase() === String(val).toLowerCase());
      for (const [v, l] of COLOR_NAMES) sel.append(mk('option', { value: v, textContent: l }));
      sel.append(mk('option', { value: 'custom', textContent: '自定…' }));
      sel.value = named ? named[0] : 'custom';
      const cp = mk('input', { type: 'color', value: val || '#000000' });
      sel.onchange = () => { if (sel.value === 'custom') { cp.click(); return; } put(sel.value); };
      cp.onchange = () => put(cp.value);
      el.append(sel, cp);
      if (r.style) {
        const st = mk('select'); const opts = [['lines', '直线'], ['dashed', '虚线']].concat(r.dots ? [['dots', '网点']] : []);
        for (const [v, l] of opts) st.append(mk('option', { value: v, textContent: l }));
        st.value = getPath(work, r.style) || 'lines'; st.onchange = () => { setPath(work, r.style, st.value); render(true); };
        el.append(st);
      }
    } else if (r.t === 'swatches') {
      el = mk('div', { className: 'pf-sw' });
      for (const [v, l, bg] of r.options) {
        const b = mk('button', { type: 'button', title: l, className: val === v ? 'on' : '' }); b.style.background = bg;
        b.dataset.theme = v;
        b.onclick = () => put(v); el.append(b);
      }
    } else if (r.t === 'pair') {
      const [ck, bk] = r.keys;
      const c = mk('select'); for (const [v, l] of [['default', '默认'], ['black', '黑色'], ['darkGray', '深灰'], ['mediumGray', '中灰'], ['lightGray', '浅灰'], ['custom', '自定']]) c.append(mk('option', { value: v, textContent: l }));
      c.value = getPath(work, ck); c.onchange = () => { setPath(work, ck, c.value); render(true); };
      const b = mk('select'); for (const [v, l] of [['shadow', '投影'], ['line', '直线'], ['none', '无']]) b.append(mk('option', { value: v, textContent: l }));
      if (r.disabledBorder) { b.disabled = true; b.title = r.disabledBorder; }
      b.value = getPath(work, bk); b.onchange = () => { setPath(work, bk, b.value); render(true); };
      const g = mk('span', { style: 'display:inline-flex;gap:6px' }); g.append(c, b); row.append(g); return row;
    }
    if (el) { if (r.k) el.dataset.k = r.k; row.append(el); }
    return row;
  }
  function render(keepScroll) {
    const st = body.scrollTop;
    const focusKey = keepScroll && body.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    const focusValue = focusKey && document.activeElement.type === 'radio' ? document.activeElement.value : null;
    for (const b of nav.children) b.classList.toggle('on', b.dataset.page === cur);
    body.replaceChildren();
    body.dataset.page = cur;
    body.append(mk('h4', { textContent: (PAGES.find(p => p[0] === cur) || [])[1] || '' }));
    for (const blk of S[cur] || []) {
      const fs = mk('fieldset'); if (blk.title) fs.append(mk('legend', { textContent: blk.title }));
      if (blk.head) { const h = mk('div', { className: 'pf-row', style: 'color:var(--ps-muted)' }); h.append(mk('span', { className: 'pf-lab' })); for (const t of blk.head.slice(1)) h.append(mk('span', { textContent: t, style: 'width:86px' })); fs.append(h); }
      for (const r of blk.rows) { if (r.show && !r.show(work)) continue; fs.append(field(r)); }
      body.append(fs);
    }
    if (keepScroll) {
      if (focusKey) for (const el of body.querySelectorAll('[data-k]')) if (el.dataset.k === focusKey && (focusValue == null || el.value === focusValue)) { el.focus({ preventScroll: true }); break; }
      body.scrollTop = st;
    }
  }
  const btn = (t, fn, cls = '') => { const b = mk('button', { type: 'button', textContent: t, className: cls }); b.onclick = fn; side.append(b); return b; };
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; try { d.close(); } catch {} d.remove(); if (openDlg === d) openDlg = null; resolve(v); };
    d.prefCancel = () => finish(null);
    btn('确定', () => { const changed = set(work); finish(changed); }, 'primary');
    btn('取消', () => finish(null));
    btn('上一个', () => { const i = PAGES.findIndex(p => p[0] === cur); cur = PAGES[(i - 1 + PAGES.length) % PAGES.length][0]; render(); });
    btn('下一个', () => { const i = PAGES.findIndex(p => p[0] === cur); cur = PAGES[(i + 1) % PAGES.length][0]; render(); });
    flashEl = mk('div', { className: 'pf-note' }); side.append(flashEl);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    d.addEventListener('close', () => finish(null));
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); side.querySelector('.primary').click(); } });
    (document.body || document.documentElement).appendChild(d);
    render();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
  });
}

function drawCursorPreview(cv, c) {
  const g = cv.getContext && cv.getContext('2d'); if (!g) return;
  g.clearRect(0, 0, 44, 44);
  const cross = (t) => { g.beginPath(); g.moveTo(22 - t, 22); g.lineTo(22 + t, 22); g.moveTo(22, 22 - t); g.lineTo(22, 22 + t); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); };
  if (c.paint === 'standard') { g.font = '22px sans-serif'; g.fillStyle = '#000'; g.fillText('🖌', 10, 32); return; }
  if (c.paint === 'precise') { cross(8); return; }
  const r = c.paint === 'full' ? 18 : 12;
  g.beginPath(); g.arc(22, 22, r, 0, 7); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  if (c.crosshairInTip) cross(4);
}

