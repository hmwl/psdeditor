










import { actions } from './actions.js';
import { shortcuts } from './shortcuts.js';
import { uiIcon } from './icons.js';

const S = { sep: true };
const it = (label, action, extra) => ({ label, action, ...(extra || {}) });
const sub = (label, items, extra) => ({ label, sub: items, ...(extra || {}) });

const ADJUST_ITEMS = (p) => [
  it('亮度/对比度…', p + 'brightnessContrast'), it('色阶…', p + 'levels'), it('曲线…', p + 'curves'), it('曝光度…', p + 'exposure'), S,
  it('自然饱和度…', p + 'vibrance'), it('色相/饱和度…', p + 'hueSaturation'), it('色彩平衡…', p + 'colorBalance'), it('黑白…', p + 'blackWhite'),
  it('照片滤镜…', p + 'photoFilter'), it('通道混合器…', p + 'channelMixer'), it('颜色查找…', p + 'colorLookup'), S,
  it('反相', p + 'invert'), it('色调分离…', p + 'posterize'), it('阈值…', p + 'threshold'), it('渐变映射…', p + 'gradientMap'), it('可选颜色…', p + 'selectiveColor'),
];
const ALIGN_ITEMS = p => [
  it('顶边', p + 'top'), it('垂直居中', p + 'vcenter'), it('底边', p + 'bottom'), S,
  it('左边', p + 'left'), it('水平居中', p + 'hcenter'), it('右边', p + 'right'),
];

export const MENUS = [
  { id: 'file', label: '文件', items: [
    it('新建…', 'file.new'), it('从模板新建…', 'file.newFromTemplate'), it('新建 OpenColorIO…', 'file.newOcio'), it('打开…', 'file.open'), it('在 Bridge 中浏览…', 'file.browse'), it('打开为…', 'file.openAs'), it('打开为 OpenColorIO…', 'file.openAsOcio'), it('打开为智能对象…', 'file.openAsSmartObject'),
    sub('最近打开文件', [it('清除最近的文件列表', 'file.clearRecent')], { id: 'recent' }), S,
    it('关闭', 'file.close'), it('关闭全部', 'file.closeAll'), it('关闭其它', 'file.closeOthers'), it('关闭并转到 Bridge…', 'file.closeToBridge'),
    it('存储', 'file.save'), it('存储为…', 'file.saveAs'), it('存储副本…', 'file.saveCopy'), it('恢复', 'file.revert'), it('颜色设置…', 'edit.colorSettings'), it('首选项', 'edit.preferences'), S,
    it('邀请参与编辑…', 'file.invite'), it('邀请…', 'file.invite'), it('共享以供审阅', 'file.share'), S,
    sub('导出', [
      it('快速导出 PNG', 'file.quickExportPng'), it('导出为…', 'file.exportAs'), it('导出队列', 'file.exportQueue'), it('导出首选项…', 'file.exportPrefs'), it('存储为 Web 所用格式…', 'file.saveForWeb'), it('生成式重构图…', 'file.generativeRecompose'), S,
      it('画板至文件…', 'file.artboardsToFiles'), it('画板至 PDF…', 'file.artboardsToPdf'), it('将图层导出到文件…', 'file.layersToFiles'),
      it('图层复合导出到 PDF…', 'file.layerCompsToPdf'), it('图层复合导出到文件…', 'file.layerCompsToFiles'), it('颜色查找表…', 'file.exportLut'),
      it('数据组作为文件…', 'file.dataSetsAsFiles'), it('渲染视频…', 'file.renderVideo'),
    ]),
    sub('生成', [it('图像资源', 'file.generateAssets', { check: 'check' })]),
    it('搜索 Adobe Stock…', 'file.stock'), it('搜索 Adobe Express 模板…', 'file.expressTemplates'), it('发送到 Firefly 灵感板', 'file.fireflyBoard'), it('置入免费的 Adobe Stock 图像…', 'file.placeFreeStock'), it('置入嵌入对象…', 'file.placeEmbedded'), it('置入链接的智能对象…', 'file.placeLinked'), it('转换为 OpenColorIO…', 'file.convertOcio'), it('OpenColorIO 设置…', 'file.ocioSettings'), it('打包…', 'file.package'), S,
    sub('自动', [it('批处理…', 'file.batch'), it('PDF 演示文稿…', 'file.pdfPresentation'), it('创建快捷批处理…', 'file.droplet'), it('裁剪并修齐照片', 'file.cropAndStraighten'), it('联系表 II…', 'file.contactSheet'), it('Photomerge…', 'file.photomerge'), it('合并到 HDR Pro…', 'file.mergeHdr'), it('镜头校正…', 'file.lensCorrectionBatch')]),
    sub('脚本', [it('图像处理器…', 'file.imageProcessor'), it('删除所有空图层', 'file.deleteEmptyLayers'), it('将图层导出到文件…', 'file.layersToFiles'), it('脚本事件管理器…', 'file.scriptEvents'), it('载入文件到堆栈…', 'file.loadStack'), it('统计…', 'file.statistics'), it('浏览…', 'file.browseScripts')]),
    it('预设管理器…', 'edit.presetManager'), it('导出/导入预设…', 'edit.presetsExportImport'), it('迁移预设', 'edit.presetsMigrate'),
    sub('导入', [it('从 iPhone 或 iPad 导入', 'file.continuity'), it('变量数据组…', 'file.importDataSets'), it('视频帧到图层…', 'file.videoFrames'), it('注释…', 'file.importNotes'), it('WIA 支持…', 'file.wia')]), S,
    it('文件简介…', 'file.info'), S, it('版本历史记录', 'file.versionHistory'), S,
    it('打印…', 'file.print'), it('打印一份', 'file.printOne'), it('退出', 'file.quit'),
  ] },
  { id: 'edit', label: '编辑', items: [
    it('还原', 'edit.undo', { dyn: 'undo' }), it('重做', 'edit.redo', { dyn: 'redo' }), it('后退一步', 'edit.stepBackward'), it('前进一步', 'edit.stepForward'), it('切换最终状态', 'edit.toggleLastState'), S,
    it('渐隐…', 'edit.fade'), S,
    it('剪切', 'edit.cut'), it('拷贝', 'edit.copy'), it('合并拷贝', 'edit.copyMerged'), it('粘贴', 'edit.paste'),
    sub('选择性粘贴', [it('粘贴且不使用任何格式', 'edit.pastePlain'), it('原位粘贴', 'edit.pasteInPlace'), it('贴入', 'edit.pasteInto'), it('外部粘贴', 'edit.pasteOutside')]),
    it('清除', 'edit.clear'), S,
    it('搜索', 'edit.search'), it('拼写检查…', 'edit.spellCheck'), it('查找和替换文本…', 'edit.findReplace'), S,
    it('填充…', 'edit.fill'), it('描边…', 'edit.stroke'), it('内容识别填充…', 'edit.contentAwareFill'), it('生成式填充…', 'edit.generativeFill'), it('生成图像…', 'view.generateImage'), it('生成式工作区…', 'edit.generativeWorkspace'), it('去除反射…', 'edit.removeReflections'), it('对象编辑器…', 'edit.objectEditor'), it('用提示编辑…', 'edit.promptEdit'), it('自定义保存对话框中的文件格式…', 'edit.customFileFormats'), S,
    it('内容识别缩放', 'edit.contentAwareScale'), it('操控变形（Pro）', 'edit.puppetWarp'), it('透视变形（Pro）', 'edit.perspectiveWarp'), it('自由变换', 'edit.freeTransform'), it('旋转对象', 'edit.transform.rotate'), it('编辑旋转对象', 'edit.transform.rotate'),
    sub('变换', [
      it('再次', 'edit.transformAgain'), S, it('缩放', 'edit.transform.scale'), it('旋转', 'edit.transform.rotate'), it('斜切', 'edit.transform.skew'), it('扭曲', 'edit.transform.distort'), it('透视', 'edit.transform.perspective'), it('变形（Pro）', 'edit.transform.warp'),
      sub('拆分变形（Pro）', [it('交叉拆分变形', 'edit.transform.warpSplit.cross'), it('垂直拆分变形', 'edit.transform.warpSplit.vertical'), it('水平拆分变形', 'edit.transform.warpSplit.horizontal'), it('移去变形拆分', 'edit.transform.warpSplit.remove')]), S,
      it('旋转 180 度', 'edit.transform.rotate180'), it('顺时针旋转 90 度', 'edit.transform.rotate90cw'), it('逆时针旋转 90 度', 'edit.transform.rotate90ccw'), S,
      it('水平翻转', 'edit.transform.flipH'), it('垂直翻转', 'edit.transform.flipV'),
    ]),
    it('自动对齐图层…', 'edit.autoAlign'), it('自动混合图层…', 'edit.autoBlend'), S,
    it('天空替换…', 'edit.skyReplacement'), it('新建重光照图层…', 'ai.relight'), it('编辑重光照图层…', 'ai.relight'), S,
    it('定义画笔预设…', 'edit.defineBrush'), it('定义图案…', 'edit.definePattern'), it('定义自定形状…', 'edit.defineShape'), S,
    sub('清理', [it('还原', 'edit.purge.undo'), it('剪贴板', 'edit.purge.clipboard'), it('历史记录', 'edit.purge.histories'), it('全部', 'edit.purge.all'), it('视频高速缓存', 'edit.purge.video')]), S,
    it('Adobe PDF 预设…', 'edit.pdfPresets'),
    sub('预设', [it('预设管理器…', 'edit.presetManager'), it('导出/导入预设…', 'edit.presetsExportImport'), it('迁移预设…', 'edit.presetsMigrate')]),
    it('远程连接…', 'edit.remoteConnections'), S,
    it('颜色设置…', 'edit.colorSettings'), it('指定配置文件…', 'edit.assignProfile'), it('转换为配置文件…', 'edit.convertProfile'), S,
    it('键盘快捷键…', 'edit.keyboardShortcuts'), it('菜单…', 'edit.menus'), it('工具栏…', 'edit.toolbar'), S,
    sub('首选项', [it('常规…', 'edit.preferences'), it('界面…', 'edit.preferences.interface'), it('工作区…', 'edit.preferences.workspace'), it('通知…', 'edit.preferences.notifications'), it('工具…', 'edit.preferences.tools'), it('历史记录和 Content Credentials…', 'edit.preferences.history'), it('文件处理…', 'edit.preferences.fileHandling'), it('导出…', 'edit.preferences.export'), it('性能…', 'edit.preferences.performance'), it('图像处理…', 'edit.preferences.imageProcessing'), it('暂存盘…', 'edit.preferences.scratch'), it('光标…', 'edit.preferences.cursors'), it('透明度与色域…', 'edit.preferences.transparency'), it('单位与标尺…', 'edit.preferences.units'), it('参考线、网格和切片…', 'edit.preferences.guides'), it('增效工具…', 'edit.preferences.plugins'), it('文字…', 'edit.preferences.type'), it('增强型控件…', 'edit.preferences.enhancedControls'), it('技术预览…', 'edit.preferences.techPreview'), it('产品改进…', 'edit.preferences.productImprovement')]),
  ] },
  { id: 'image', label: '图像', items: [
    sub('模式', [
      it('位图', 'image.mode.bitmap', { check: 'radio' }), it('灰度', 'image.mode.grayscale', { check: 'radio' }), it('双色调', 'image.mode.duotone', { check: 'radio' }), it('索引颜色', 'image.mode.indexed', { check: 'radio' }),
      it('RGB 颜色', 'image.mode.rgb', { check: 'radio' }), it('CMYK 颜色', 'image.mode.cmyk', { check: 'radio' }), it('Lab 颜色', 'image.mode.lab', { check: 'radio' }), it('多通道', 'image.mode.multichannel', { check: 'radio' }), S,
      it('8 位/通道', 'image.depth.8', { check: 'radio' }), it('16 位/通道', 'image.depth.16', { check: 'radio' }), it('32 位/通道', 'image.depth.32', { check: 'radio' }), S,
      it('颜色表…', 'image.colorTable'),
    ]), S,
    sub('调整', [...ADJUST_ITEMS('image.adjust.'), S, it('阴影/高光…', 'image.adjust.shadowsHighlights'), it('HDR 色调…', 'image.adjust.hdrToning'), S, it('去色', 'image.adjust.desaturate'), it('匹配颜色…', 'image.adjust.matchColor'), it('替换颜色…', 'image.adjust.replaceColor'), it('色调均化', 'image.adjust.equalize')]), S,
    it('自动色调', 'image.autoTone'), it('自动对比度', 'image.autoContrast'), it('自动颜色', 'image.autoColor'), S,
    it('图像大小…', 'image.size'), it('画布大小…', 'image.canvasSize'), it('生成式放大…', 'image.generativeUpscale'),
    sub('图像旋转', [it('180 度', 'image.rotate180'), it('顺时针 90 度', 'image.rotate90cw'), it('逆时针 90 度', 'image.rotate90ccw'), it('任意角度…', 'image.rotateArbitrary'), S, it('水平翻转画布', 'image.flipH'), it('垂直翻转画布', 'image.flipV')]),
    it('裁剪', 'image.crop'), it('裁切…', 'image.trim'), it('显示全部', 'image.revealAll'), S,
    it('复制…', 'image.duplicate'), it('应用图像…', 'image.applyImage'), it('计算…', 'image.calculations'), it('合并专色通道', 'image.mergeSpotChannels'), S,
    sub('变量', [it('定义…', 'image.variables.define'), it('数据组…', 'image.variables.dataSets')]), it('应用数据组…', 'image.applyDataSet'), S,
    it('陷印…', 'image.trap'), S,
    sub('分析', [it('设置测量比例', 'image.analysis.scale'), it('选择数据点', 'image.analysis.dataPoints'), it('记录测量', 'image.analysis.record'), it('标尺工具', 'tool.ruler'), it('计数工具', 'tool.count'), it('置入比例标记…', 'image.analysis.scaleMarker')]),
  ] },
  { id: 'layer', label: '图层', items: [
    sub('新建', [it('图层…', 'layer.new'), it('新建图层…', 'layer.new'), it('背景图层', 'layer.backgroundFromLayer', { dyn: 'bgLayer' }), it('背景图层…', 'layer.backgroundFromLayer'), it('图层背景', 'layer.backgroundFromLayer'), it('组…', 'layer.newGroup'), it('新建组…', 'layer.newGroup'), it('从图层建立组…', 'layer.groupFromLayers'), it('从图层新建组…', 'layer.groupFromLayers'), it('画板…', 'layer.newArtboard'), it('新建画板…', 'layer.newArtboard'), it('来自图层的画板…', 'layer.artboardFromLayers'), it('来自图层组的画板', 'layer.artboardFromGroup'), it('来自图层的画框…', 'layer.frameFromLayers'), it('来自图层组的画框…', 'layer.frameFromGroup'), it('图框…', 'tool.frame'), it('画框', 'tool.frame'), S, it('通过拷贝的图层', 'layer.viaCopy'), it('通过剪切的图层', 'layer.viaCut')]),
    it('复制 CSS', 'layer.copyCss'), it('复制 SVG', 'layer.copySvg'), it('复制图层…', 'layer.duplicate'), it('复制组…', 'layer.duplicate'), it('复制画板…', 'layer.duplicateArtboard'), it('复制画框…', 'layer.duplicateFrame'),
    sub('删除', [it('图层', 'layer.delete'), it('删除图层', 'layer.delete'), it('画板', 'layer.deleteArtboard'), it('删除画板', 'layer.deleteArtboard'), it('组', 'layer.delete'), it('删除组', 'layer.delete'), it('图框', 'layer.deleteFrame'), it('删除图框', 'layer.deleteFrame'), it('删除隐藏图层', 'layer.deleteHidden')]), S,
    it('快速导出为 PNG', 'layer.quickExportPng'), it('导出为…', 'layer.exportAs'), S,
    it('重命名图层…', 'layer.rename'), it('重命名图层', 'layer.rename'), it('重命名画板…', 'layer.renameArtboard'), it('重命名组…', 'layer.renameGroup'), it('重命名图框', 'layer.renameFrame'),
    sub('图层样式', [
      it('混合选项…', 'layer.style.blendingOptions'), S, it('斜面和浮雕…', 'layer.style.bevel'), it('描边…', 'layer.style.stroke'), it('内阴影…', 'layer.style.innerShadow'), it('内发光…', 'layer.style.innerGlow'),
      it('光泽…', 'layer.style.satin'), it('颜色叠加…', 'layer.style.colorOverlay'), it('渐变叠加…', 'layer.style.gradientOverlay'), it('图案叠加…', 'layer.style.patternOverlay'), it('外发光…', 'layer.style.outerGlow'), it('投影…', 'layer.style.dropShadow'), S,
      it('拷贝图层样式', 'layer.style.copy'), it('粘贴图层样式', 'layer.style.paste'), it('清除图层样式', 'layer.style.clear'), it('清除禁用的图层样式', 'layer.style.clearDisabled'), S,
      it('全局光…', 'layer.style.globalLight'), it('创建图层', 'layer.style.createLayers'), it('隐藏所有效果', 'layer.style.hideAll', { dyn: 'fxHideAll' }), it('缩放效果…', 'layer.style.scale'),
    ]),
    sub('智能滤镜', [it('停用智能滤镜', 'layer.smartFilter.disable'), it('删除滤镜蒙版', 'layer.smartFilter.deleteMask'), it('停用滤镜蒙版', 'layer.smartFilter.disableMask', { dyn: 'sfMask' }), it('清除智能滤镜', 'layer.smartFilter.clear')]), S,
    sub('新建填充图层', [it('纯色…', 'layer.fill.solid'), it('渐变…', 'layer.fill.gradient'), it('图案…', 'layer.fill.pattern')]),
    sub('新建调整图层', ADJUST_ITEMS('layer.adjust.')),
    it('图层内容选项…', 'layer.contentOptions'), it('编辑调整…', 'layer.editAdjustment'), it('新建重光照图层…', 'ai.relight'), S,
    sub('图层蒙版', [it('显示全部', 'layer.mask.revealAll'), it('隐藏全部', 'layer.mask.hideAll'), it('显示选区', 'layer.mask.revealSelection'), it('隐藏选区', 'layer.mask.hideSelection'), it('从透明区域', 'layer.mask.fromTransparency'), S, it('删除', 'layer.mask.delete'), it('应用', 'layer.mask.apply'), S, it('停用', 'layer.mask.toggle', { dyn: 'maskToggle' }), it('取消链接', 'layer.mask.unlink', { dyn: 'maskLink' })]),
    sub('矢量蒙版', [it('显示全部', 'layer.vectorMask.revealAll'), it('隐藏全部', 'layer.vectorMask.hideAll'), it('当前路径', 'layer.vectorMask.currentPath'), S, it('删除', 'layer.vectorMask.delete'), it('停用', 'layer.vectorMask.toggle'), it('取消链接', 'layer.vectorMask.unlink')]),
    it('创建剪贴蒙版', 'layer.clippingMask', { dyn: 'clip' }), it('释放剪贴蒙版', 'layer.releaseClippingMask'), S,
    sub('智能对象', [
      it('转换为智能对象', 'layer.smart.convert'), it('新建链接的智能对象…', 'layer.smart.newLinked'), it('通过拷贝新建智能对象', 'layer.smart.newViaCopy'), S,
      it('在访达中显示', 'layer.smart.reveal'), it('更新修改的内容', 'layer.smart.updateModified'), it('更新所有修改的内容', 'layer.smart.updateAll'), S,
      it('编辑内容', 'layer.smart.editContents'), it('重新链接到文件…', 'layer.smart.relinkFile'), it('重新链接到库图形…', 'layer.smart.relinkLibrary'), it('替换内容…', 'layer.smart.replaceContents'), it('导出内容…', 'layer.smart.exportContents'),
      it('嵌入链接的智能对象', 'layer.smart.embed'), it('嵌入所有链接的智能对象', 'layer.smart.embedAll'), it('转换为链接对象…', 'layer.smart.convertToLinked'), S,
      it('转换为图层', 'layer.smart.convertToLayers'),
      
      sub('堆栈模式', [it('无', 'layer.smart.stack.none'), S, it('熵', 'layer.smart.stack.entropy'), it('峰度', 'layer.smart.stack.kurtosis'), it('最大值', 'layer.smart.stack.max'), it('平均值', 'layer.smart.stack.mean'), it('中间值', 'layer.smart.stack.median'), it('最小值', 'layer.smart.stack.min'), it('范围', 'layer.smart.stack.range'), it('偏度', 'layer.smart.stack.skewness'), it('标准差', 'layer.smart.stack.stdDev'), it('总和', 'layer.smart.stack.sum'), it('方差', 'layer.smart.stack.variance')]),
      it('栅格化', 'layer.smart.rasterize'),
    ]),
    sub('视频图层', [it('从文件新建视频图层…', 'layer.video.newFromFile'), it('新建空白视频图层', 'layer.video.newBlank'), it('插入空白帧', 'layer.video.insertBlank'), it('复制帧', 'layer.video.duplicateFrame'), it('删除帧', 'layer.video.deleteFrame'), it('替换素材…', 'layer.video.replaceFootage'), it('解释素材…', 'layer.video.interpret'), it('隐藏已改变的视频', 'layer.video.hideAltered'), it('恢复帧', 'layer.video.restoreFrame'), it('恢复所有帧', 'layer.video.restoreAll'), it('重新载入帧', 'layer.video.reload'), it('栅格化', 'layer.video.rasterize')]),
    sub('栅格化', [it('文字', 'layer.rasterize.type'), it('形状', 'layer.rasterize.shape'), it('填充内容', 'layer.rasterize.fill'), it('矢量蒙版', 'layer.rasterize.vectorMask'), it('智能对象', 'layer.rasterize.smartObject'), it('视频', 'layer.rasterize.video'), it('3D', 'layer.rasterize.3d'), it('图层样式', 'layer.rasterize.style'), S, it('图层', 'layer.rasterize.layer'), it('所有图层', 'layer.rasterize.all')]), S,
    it('新建基于图层的切片', 'layer.newSliceFromLayer'), S,
    it('图层编组', 'layer.group'), it('取消图层编组', 'layer.ungroup'), it('取消画板编组', 'layer.ungroup'), it('合并形状', 'layer.mergeShapes'), it('折叠所有组', 'layer.collapseAllGroups'), it('隐藏图层', 'layer.hide', { dyn: 'hideLayer' }), it('显示图层', 'layer.show'), it('显示组', 'layer.show'), it('隐藏组', 'layer.hideExplicit'), it('显示画板', 'layer.show'), it('隐藏画板', 'layer.hideExplicit'), S,
    it('自动对齐图层…', 'edit.autoAlign'), it('自动混合图层…', 'edit.autoBlend'), it('图层清理', 'file.deleteEmptyLayers'),
    sub('排列', [it('置为顶层', 'layer.bringToFront'), it('前移一层', 'layer.bringForward'), it('后移一层', 'layer.sendBackward'), it('置为底层', 'layer.sendToBack'), it('反向', 'layer.reverse')]),
    sub('变换', [it('自由变换', 'edit.freeTransform'), it('内容识别缩放', 'edit.contentAwareScale'), it('操控变形（Pro）', 'edit.puppetWarp'), it('透视变形（Pro）', 'edit.perspectiveWarp')]),
    sub('将图层与选区对齐', ALIGN_ITEMS('layer.align.')),
    sub('对齐', ALIGN_ITEMS('layer.align.canvas.')),
    sub('将图层与画布对齐', ALIGN_ITEMS('layer.align.canvas.')),
    sub('将图层与画板对齐', ALIGN_ITEMS('layer.align.artboard.')),
    sub('将图层与图框对齐', ALIGN_ITEMS('layer.align.frame.')),
    sub('分布', [it('顶边', 'layer.distribute.top'), it('垂直居中', 'layer.distribute.vcenter'), it('底边', 'layer.distribute.bottom'), S, it('左边', 'layer.distribute.left'), it('水平居中', 'layer.distribute.hcenter'), it('右边', 'layer.distribute.right')]), S,
    sub('图框', [it('放进图框', 'layer.frame.put'), it('从图层删除图框', 'layer.frame.take'), it('从图层删除画框', 'layer.frame.take')]), S,
    it('锁定图层…', 'layer.lock'), it('锁定组', 'layer.lockGroup'), it('锁定组内的所有图层', 'layer.lockGroupChildren'), it('锁定组内的所有图层…', 'layer.lockGroupChildren'), it('锁定画板中的所有图层…', 'layer.lockArtboardChildren'), it('锁定画框中的图层…', 'layer.lockFrameChildren'), S,
    it('链接图层', 'layer.link', { dyn: 'linkLayers' }), it('取消图层链接', 'layer.link'), it('选择链接图层', 'layer.selectLinked'), S,
    it('合并图层', 'layer.merge', { dyn: 'merge' }), it('向下合并', 'layer.mergeDown'), it('合并可见图层', 'layer.mergeVisible'), it('拼合图像', 'layer.flatten'), S,
    sub('修边', [it('颜色净化…', 'layer.matting.decontaminate'), it('去边…', 'layer.matting.defringe'), it('移去黑色杂边', 'layer.matting.removeBlack'), it('移去白色杂边', 'layer.matting.removeWhite')]), it('筛选选项', 'layer.panelOptions'), it('面板选项…', 'layer.panelOptions'),
  ] },
  { id: 'type', label: '文字', items: [
    it('更多来自 Adobe Fonts…', 'type.adobeFonts'),
    sub('面板', [it('字符面板', 'window.character'), it('段落面板', 'window.paragraph'), it('字形面板', 'window.glyphs'), it('字符样式面板', 'window.characterStyles'), it('段落样式面板', 'window.paragraphStyles')]), S,
    sub('消除锯齿', [it('无', 'type.aa.none', { check: 'radio' }), it('锐利', 'type.aa.sharp', { check: 'radio' }), it('犀利', 'type.aa.crisp', { check: 'radio' }), it('浑厚', 'type.aa.strong', { check: 'radio' }), it('平滑', 'type.aa.smooth', { check: 'radio' }), it('Mac LCD', 'type.aa.macLcd', { check: 'radio', dyn: 'aaLCD' }), it('Mac', 'type.aa.mac', { check: 'radio', dyn: 'aaPlat' })]), S,
    sub('文字排列方向', [it('横排', 'type.orientation.horizontal', { check: 'radio' }), it('直排', 'type.orientation.vertical', { check: 'radio' })]),
    sub('OpenType', [it('标准连字', 'type.opentype.ligatures', { check: 'check' }), it('上下文替代字', 'type.opentype.contextual', { check: 'check' }), it('自由连字', 'type.opentype.discretionary', { check: 'check' }), it('花饰字', 'type.opentype.swash', { check: 'check' }), it('旧式', 'type.opentype.oldstyle', { check: 'check' }), it('文体替代字', 'type.opentype.stylistic', { check: 'check' }), it('标题替代字', 'type.opentype.titling', { check: 'check' }), it('序数字', 'type.opentype.ordinals', { check: 'check' }), it('分数字', 'type.opentype.fractions', { check: 'check' })]), S,
    it('创建工作路径', 'type.createWorkPath'), it('转换为形状', 'type.convertToShape'), S,
    it('栅格化文字图层', 'type.rasterize'), S,
    it('转换为段落文本', 'type.convertToParagraph', { dyn: 'typeKind' }), it('转换为动态文本', 'type.dynamic', { dyn: 'typeDynamic' }), it('文字变形…', 'type.warp'), S,
    it('匹配字体…', 'type.matchFont'),
    sub('字体预览大小', [it('无', 'type.preview.none', { check: 'radio' }), it('小', 'type.preview.small', { check: 'radio' }), it('中', 'type.preview.medium', { check: 'radio' }), it('大', 'type.preview.large', { check: 'radio' }), it('特大', 'type.preview.xl', { check: 'radio' }), it('超大', 'type.preview.xxl', { check: 'radio' })]),
    sub('语言选项', [it('默认功能', 'type.lang.default', { check: 'radio' }), it('东亚功能', 'type.lang.eastAsian', { check: 'radio' }), it('中东功能', 'type.lang.middleEast', { check: 'radio' })]),
    it('更新所有文字图层', 'type.updateAll'), it('替换所有欠缺字体', 'type.replaceMissing'), it('解析欠缺字体…', 'type.resolveMissing'), it('粘贴 Lorem Ipsum', 'type.loremIpsum'),
    it('载入默认文字样式', 'type.loadDefaultStyles'), it('存储默认文字样式', 'type.saveDefaultStyles'),
  ] },
  { id: 'select', label: '选择', items: [
    it('全部', 'select.all'), it('取消选择', 'select.none'), it('重新选择', 'select.reselect'), it('反选', 'select.inverse'), S,
    it('所有图层', 'select.allLayers'), it('取消选择图层', 'select.deselectLayers'), it('查找图层', 'select.findLayers'), it('隔离图层', 'select.isolateLayers', { check: 'check', dyn: 'isolate' }), it('从隔离图层删除', 'select.deIsolateLayers'), S,
    it('颜色范围…', 'select.colorRange'), it('焦点区域…', 'select.focusArea'), it('主体', 'select.subject'), it('背景中的人物', 'select.peopleDistractions'), it('天空', 'select.sky'), it('选择链接图层', 'select.selectLinkedLayers'), S,
    it('选择并遮住…', 'select.selectAndMask'), it('调整蒙版…', 'select.refineMask'), it('调整边缘…', 'select.refineEdge'),
    sub('修改', [it('边界…', 'select.modify.border'), it('平滑…', 'select.modify.smooth'), it('扩展…', 'select.modify.expand'), it('收缩…', 'select.modify.contract'), it('羽化…', 'select.feather')]), S,
    it('扩大选取', 'select.grow'), it('选取相似', 'select.similar'), S,
    it('变换选区', 'select.transform'), S,
    it('在快速蒙版模式下编辑', 'tool.quickMask', { check: 'check' }), S,
    it('载入选区…', 'select.load'), it('存储选区…', 'select.save'),
  ] },
  { id: 'filter', label: '滤镜', items: [
    it('上次滤镜操作', 'filter.last', { dyn: 'lastFilter' }), it('上次滤镜操作（调参数）', 'filter.lastDialog'), S,
    it('转换为智能滤镜', 'filter.convertToSmart'), S,
    it('Neural Filters…', 'filter.neural'), it('滤镜库…', 'filter.gallery'), it('自适应广角…', 'filter.adaptiveWideAngle'), it('Camera Raw 滤镜…', 'filter.cameraRaw'), it('镜头校正…', 'filter.lensCorrection'), it('液化…', 'filter.liquify'), it('消失点…', 'filter.vanishingPoint'), S,
    sub('3D', [it('生成凹凸图…', 'filter.3d.bump'), it('生成法线图…', 'filter.3d.normal')]),
    sub('风格化', [it('查找边缘', 'filter.stylize.findEdges'), it('等高线…', 'filter.stylize.traceContour'), it('风…', 'filter.stylize.wind'), it('浮雕效果…', 'filter.stylize.emboss'), it('扩散…', 'filter.stylize.diffuse'), it('拼贴…', 'filter.stylize.tiles'), it('曝光过度', 'filter.stylize.solarize'), it('凸出…', 'filter.stylize.extrude'), it('油画…', 'filter.stylize.oilPaint')]),
    sub('模糊', [it('表面模糊…', 'filter.blur.surface'), it('动感模糊…', 'filter.blur.motion'), it('方框模糊…', 'filter.blur.box'), it('高斯模糊…', 'filter.blur.gaussian'), it('进一步模糊', 'filter.blur.more'), it('径向模糊…', 'filter.blur.radial'), it('镜头模糊…', 'filter.blur.lens'), it('模糊', 'filter.blur.blur'), it('平均', 'filter.blur.average'), it('特殊模糊…', 'filter.blur.smart'), it('形状模糊…', 'filter.blur.shape')]),
    sub('模糊画廊', [it('场景模糊…', 'filter.blurGallery.field'), it('光圈模糊…', 'filter.blurGallery.iris'), it('移轴模糊…', 'filter.blurGallery.tiltShift'), it('路径模糊…', 'filter.blurGallery.path'), it('旋转模糊…', 'filter.blurGallery.spin')]),
    sub('扭曲', [it('波浪…', 'filter.distort.wave'), it('波纹…', 'filter.distort.ripple'), it('极坐标…', 'filter.distort.polar'), it('挤压…', 'filter.distort.pinch'), it('切变…', 'filter.distort.shear'), it('球面化…', 'filter.distort.spherize'), it('水波…', 'filter.distort.zigzag'), it('旋转扭曲…', 'filter.distort.twirl'), it('置换…', 'filter.distort.displace')]),
    sub('锐化', [it('USM 锐化…', 'filter.sharpen.unsharp'), it('防抖…', 'filter.sharpen.shake'), it('进一步锐化', 'filter.sharpen.more'), it('锐化', 'filter.sharpen.sharpen'), it('锐化边缘', 'filter.sharpen.edges'), it('智能锐化…', 'filter.sharpen.smart')]),
    sub('视频', [it('NTSC 颜色', 'filter.video.ntsc'), it('逐行…', 'filter.video.deinterlace')]),
    sub('像素化', [it('彩块化', 'filter.pixelate.facet'), it('彩色半调…', 'filter.pixelate.halftone'), it('点状化…', 'filter.pixelate.pointillize'), it('晶格化…', 'filter.pixelate.crystallize'), it('马赛克…', 'filter.pixelate.mosaic'), it('碎片', 'filter.pixelate.fragment'), it('铜版雕刻…', 'filter.pixelate.mezzotint')]),
    sub('渲染', [it('火焰…', 'filter.render.flame'), it('图片框…', 'filter.render.pictureFrame'), it('树…', 'filter.render.tree'), S, it('分层云彩', 'filter.render.differenceClouds'), it('光照效果…', 'filter.render.lighting'), it('镜头光晕…', 'filter.render.lensFlare'), it('纤维…', 'filter.render.fibers'), it('云彩', 'filter.render.clouds')]),
    sub('杂色', [it('减少杂色…', 'filter.noise.reduce'), it('蒙尘与划痕…', 'filter.noise.dustScratches'), it('去斑', 'filter.noise.despeckle'), it('添加杂色…', 'filter.noise.add'), it('中间值…', 'filter.noise.median')]),
    sub('其它', [it('HSB/HSL', 'filter.other.hsb'), it('高反差保留…', 'filter.other.highPass'), it('位移…', 'filter.other.offset'), it('自定…', 'filter.other.custom'), it('最大值…', 'filter.other.maximum'), it('最小值…', 'filter.other.minimum')]),
  ] },
  { id: 'view', label: '视图', items: [
    sub('校样设置', [it('自定…', 'view.proof.custom'), S, it('工作中的 CMYK', 'view.proof.cmyk', { check: 'radio' }), it('工作中的青版', 'view.proof.cyan', { check: 'radio' }), it('工作中的洋红版', 'view.proof.magenta', { check: 'radio' }), it('工作中的黄版', 'view.proof.yellow', { check: 'radio' }), it('工作中的黑版', 'view.proof.black', { check: 'radio' }), it('工作中的 CMY 版', 'view.proof.cmy', { check: 'radio' }), S, it('旧版 Macintosh RGB (Gamma 1.8)', 'view.proof.macRgb', { check: 'radio' }), it('Internet 标准 RGB (sRGB)', 'view.proof.srgb', { check: 'radio' }), it('显示器 RGB', 'view.proof.monitor', { check: 'radio' }), S, it('色盲 - 红色盲型', 'view.proof.protanopia', { check: 'radio' }), it('色盲 - 绿色盲型', 'view.proof.deuteranopia', { check: 'radio' })]),
    it('校样颜色', 'view.proofColors', { check: 'check' }), it('色域警告', 'view.gamutWarning', { check: 'check' }),
    sub('像素长宽比', [it('自定像素长宽比…', 'view.par.custom'), it('删除像素长宽比…', 'view.par.delete'), it('复位像素长宽比…', 'view.par.reset'), S, it('方形', 'view.par.square', { check: 'radio' }), it('D1/DV NTSC (0.91)', 'view.par.ntsc', { check: 'radio' }), it('D1/DV PAL (1.09)', 'view.par.pal', { check: 'radio' }), it('D1/DV NTSC 宽银幕 (1.21)', 'view.par.ntscWide', { check: 'radio' }), it('HDV 1080/DVCPRO HD 720 (1.33)', 'view.par.hdv', { check: 'radio' }), it('D1/DV PAL 宽银幕 (1.46)', 'view.par.palWide', { check: 'radio' }), it('变形 2:1 (2)', 'view.par.anamorphic', { check: 'radio' }), it('DVCPRO HD 1080 (1.5)', 'view.par.dvcpro', { check: 'radio' })]),
    it('像素长宽比校正', 'view.parCorrection', { check: 'check' }), it('32 位预览选项…', 'view.preview32'), S,
    it('放大', 'view.zoomIn'), it('缩小', 'view.zoomOut'), it('按屏幕大小缩放', 'view.fitOnScreen'), it('按屏幕大小缩放图层', 'view.fitLayer'), it('按屏幕大小缩放画板', 'view.fitArtboard'), it('100%', 'view.actualPixels'), it('200%', 'view.zoom200'), it('打印尺寸', 'view.printSize'), it('实际大小', 'view.actualSize'), it('水平翻转', 'view.flipH', { check: 'check' }), S,
    sub('屏幕模式', [it('标准屏幕模式', 'view.screenMode.standard', { check: 'radio' }), it('带有菜单栏的全屏模式', 'view.screenMode.fullMenu', { check: 'radio' }), it('全屏模式', 'view.screenMode.full', { check: 'radio' })]), S,
    sub('显示额外内容', [it('显示附加工具', 'view.extras.show', { check: 'check' }), it('隐藏额外内容', 'view.extras.hide', { check: 'check' })]),
    it('叠加', 'view.overlay'), it('图层样式…', 'view.layerStyles'), it('图案预览', 'view.patternPreview'), it('快速比较', 'view.quickCompare'),
    it('从 Adobe Stock 添加', 'view.addStock'), it('从设备添加', 'view.addDevice'), it('添加免费的 Adobe Stock 图像', 'view.addFreeStock'), it('生成图像', 'view.generateImage'),
    sub('显示', [it('图层边缘', 'view.show.layerEdges', { check: 'check' }), it('选区边缘', 'view.show.selectionEdges', { check: 'check' }), it('目标路径', 'view.showTargetPath', { check: 'check' }), sub('网格', [it('显示网格', 'view.grid.show', { check: 'check' }), it('隐藏网格', 'view.grid.hide', { check: 'check' })]), sub('参考线', [it('显示文档参考线', 'view.guides.show', { check: 'check' }), it('隐藏文档参考线', 'view.guides.hide', { check: 'check' }), it('显示画板参考线', 'view.artboardGuides.show', { check: 'check' }), it('隐藏画板参考线', 'view.artboardGuides.hide', { check: 'check' })]), it('计数', 'view.show.count', { check: 'check' }), it('智能参考线', 'view.show.smartGuides', { check: 'check' }), it('切片', 'view.show.slices', { check: 'check' }), it('注释', 'view.show.notes', { check: 'check' }), it('像素网格', 'view.show.pixelGrid', { check: 'check' }), it('画笔预览', 'view.show.brushPreview', { check: 'check' }), it('编辑图钉', 'view.show.editPins', { check: 'check' }), S, it('全部', 'view.show.all'), it('无', 'view.show.none'), S, it('显示额外选项…', 'view.show.options')]), S,
    it('标尺', 'view.rulers', { check: 'check' }),
    sub('标尺单位', [it('像素', 'view.rulerUnit.px', { check: 'radio' }), it('厘米', 'view.rulerUnit.cm', { check: 'radio' }),
      it('毫米', 'view.rulerUnit.mm', { check: 'radio' }), it('英寸', 'view.rulerUnit.in', { check: 'radio' }),
      it('点', 'view.rulerUnit.pt', { check: 'radio' }), it('派卡', 'view.rulerUnit.pc', { check: 'radio' })]), S,
    sub('对齐', [it('启用对齐', 'view.snap.enable', { check: 'check' }), it('禁用对齐', 'view.snap.disable', { check: 'check' })]),
    sub('对齐到', [it('参考线', 'view.snapTo.guides', { check: 'check' }), it('网格', 'view.snapTo.grid', { check: 'check' }), it('图层', 'view.snapTo.layers', { check: 'check' }), it('切片', 'view.snapTo.slices', { check: 'check' }), it('文档边界', 'view.snapTo.documentBounds', { check: 'check' }), S, it('全部', 'view.snapTo.all'), it('无', 'view.snapTo.none')]), S,
    it('锁定参考线', 'view.lockGuides', { check: 'check' }), it('清除参考线', 'view.clearGuides'), it('清除所选画板参考线', 'view.clearArtboardGuides'), it('清除画布参考线', 'view.clearCanvasGuides'), it('新建参考线…', 'view.newGuide'), it('新建参考线版面…', 'view.newGuideLayout'), it('通过形状新建参考线', 'view.guidesFromShape'), S,
    it('锁定切片', 'view.lockSlices', { check: 'check' }), it('切换自动切片', 'view.toggleAutoSlices', { check: 'check' }), it('清除切片', 'view.clearSlices'),
  ] },
  { id: 'plugins', label: '增效工具', items: [
    it('增效工具面板', 'window.plugins'), S, it('浏览增效工具…', 'plugins.browse'), it('管理增效工具…', 'plugins.manage'),
  ] },
  { id: 'window', label: '窗口', items: [
    sub('排列', [it('全部垂直拼贴', 'window.arrange.tileV'), it('全部水平拼贴', 'window.arrange.tileH'), it('双联水平', 'window.arrange.2h'), it('双联垂直', 'window.arrange.2v'), it('三联水平', 'window.arrange.3h'), it('三联垂直', 'window.arrange.3v'), it('三联堆积', 'window.arrange.3s'), it('四联', 'window.arrange.4'), it('六联', 'window.arrange.6'), it('将所有内容合并到选项卡中', 'window.arrange.consolidate'), S, it('层叠', 'window.arrange.cascade'), it('平铺', 'window.arrange.tile'), it('在窗口中浮动', 'window.arrange.float'), it('使所有内容在窗口中浮动', 'window.arrange.floatAll'), S, it('匹配缩放', 'window.arrange.matchZoom'), it('匹配位置', 'window.arrange.matchLocation'), it('匹配旋转', 'window.arrange.matchRotation'), it('全部匹配', 'window.arrange.matchAll'), S, it('为「文档名」新建窗口', 'window.arrange.newWindow', { dyn: 'newWindow' })]),
    sub('工作区', [it('基本功能(默认)', 'window.workspace.essentials', { check: 'radio' }), it('3D', 'window.workspace.3d', { check: 'radio' }), it('图形和 Web', 'window.workspace.graphicWeb', { check: 'radio' }), it('动感', 'window.workspace.motion', { check: 'radio' }), it('绘画', 'window.workspace.painting', { check: 'radio' }), it('摄影', 'window.workspace.photography', { check: 'radio' }), S, it('复位基本功能', 'window.workspace.reset'), it('新建工作区…', 'window.workspace.new'), it('删除工作区…', 'window.workspace.delete'), S, it('键盘快捷键和菜单…', 'edit.keyboardShortcuts'), it('锁定工作区', 'window.workspace.lock', { check: 'check' })]), S,
    it('在 Exchange 上查找扩展…', 'window.exchange'),
    sub('扩展(旧版)', [it('（无）', 'window.legacyExtensions', { disabled: true })]), S,
    it('3D', 'window.3d', { check: 'check' }), it('测量记录', 'window.measurementLog', { check: 'check' }), it('导航器', 'window.navigator', { check: 'check' }), it('动作', 'window.actions', { check: 'check' }),
    it('段落', 'window.paragraph', { check: 'check' }), it('段落面板', 'window.paragraph', { check: 'check' }), it('段落样式', 'window.paragraphStyles', { check: 'check' }), it('段落样式面板', 'window.paragraphStyles', { check: 'check' }), it('工具预设', 'window.toolPresets', { check: 'check' }), it('画笔', 'window.brushes', { check: 'check' }), it('画笔设置', 'window.brushSettings', { check: 'check' }),
    it('历史记录', 'window.history', { check: 'check' }), it('渐变', 'window.gradients', { check: 'check' }), it('路径', 'window.paths', { check: 'check' }), it('内容凭证', 'window.contentCredentials', { check: 'check' }), it('评论', 'window.comments', { check: 'check' }),
    it('色板', 'window.swatches', { check: 'check' }), it('时间轴', 'window.timeline', { check: 'check' }), it('属性', 'window.properties', { check: 'check' }), it('通道', 'window.channels', { check: 'check' }), it('图案', 'window.patterns', { check: 'check' }), it('图层', 'window.layers', { check: 'check' }), it('图层复合', 'window.layerComps', { check: 'check' }),
    it('信息', 'window.info', { check: 'check' }), it('修改键', 'window.modifierKeys', { check: 'check' }), it('颜色', 'window.color', { check: 'check' }), it('高级颜色', 'window.color', { check: 'check' }), it('直方图', 'window.histogram', { check: 'check' }), it('注释', 'window.notes', { check: 'check' }), it('字符', 'window.character', { check: 'check' }), it('字符面板', 'window.character', { check: 'check' }), it('字符样式', 'window.characterStyles', { check: 'check' }), it('字符样式面板', 'window.characterStyles', { check: 'check' }), it('字形', 'window.glyphs', { check: 'check' }), it('字形面板', 'window.glyphs', { check: 'check' }), it('样式', 'window.styles', { check: 'check' }), it('形状', 'window.shapes', { check: 'check' }), it('调整', 'window.adjustments', { check: 'check' }), S,
    it('应用程序框架', 'window.appFrame', { check: 'check' }), it('选项', 'window.options', { check: 'check' }), it('工具', 'window.tools', { check: 'check' }), S,
    { id: 'docs', label: '（无打开的文档）', disabled: true },
  ] },
  { id: 'ai', label: 'Ai', items: [
    it('重新打光…', 'ai.relight'),
  ] },
  { id: 'help', label: '帮助', items: [
    it('键盘快捷键速查…', 'help.shortcuts'), S,
    it('关于 PSD Editor…', 'help.about'), sub('关于增效工具', [it('（无）', 'help.aboutPlugins', { disabled: true })]), S,
    it('系统信息…', 'help.systemInfo'), it('GPU 兼容性…', 'help.gpuCompat'), it('管理我的帐户…', 'help.account'), it('登录…', 'help.signIn'), it('更新…', 'help.updates'),
  ] },
];


let barEl = null, openTop = -1, dynLabel = () => null, docsProvider = () => [], recentProvider = () => [], itemsHook = null;
const $ = s => document.querySelector(s);

export function setDynamicLabels(fn) { dynLabel = fn; }
export function setDocumentsProvider(fn) { docsProvider = fn; }
export function setRecentProvider(fn) { recentProvider = fn; }

export function setItemsHook(fn) { itemsHook = fn; }


let itemStyle = () => null, showAllOnce = false;
export function setItemStyle(fn) { itemStyle = fn || (() => null); }
const MENU_COLORS = { red: '#b33a3a', orange: '#b8672a', yellow: '#a8952b', green: '#3d8a3d', blue: '#3a67b3', violet: '#7a4bb3', gray: '#666666' };
export function menuColorCss(c) { return MENU_COLORS[c] || ''; }
const styleOf = item => { try { return (item && item.action && itemStyle(item.action)) || null; } catch { return null; } };

let focusBefore = null;
function closeAll() {
  showAllOnce = false;
  if (!barEl) return;
  for (const t of barEl.querySelectorAll('.menu-title.open')) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); }
  const hadFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('.menu-pop');
  for (const p of document.querySelectorAll('.menu-pop')) p.remove();
  openTop = -1;
  barEl.classList.remove('active');
  
  if (hadFocus && focusBefore && focusBefore.isConnected) { try { focusBefore.focus({ preventScroll: true }); } catch {  } }
  focusBefore = null;
}
function itemsFor(menu) {
  const items = menu.items.slice();
  if (menu.id === 'window') {
    const docs = docsProvider() || [];
    const idx = items.findIndex(x => x.id === 'docs');
    if (idx >= 0) items.splice(idx, 1, ...(docs.length ? docs.map(d => ({ label: d.label, action: 'window.document', args: [d.id], check: 'radio', checkedValue: !!d.active })) : [{ label: '（无打开的文档）', disabled: true }]));
  }
  if (itemsHook) { try { return itemsHook(menu.id, items) || items; } catch { return items; } }
  return items;
}
function buildPop(items, level) {
  const pop = document.createElement('div');
  pop.className = 'menu-pop level-' + level;
  pop.setAttribute('role', 'menu');
  

  const hiddenOf = item => !showAllOnce && !item.sep && !item.sub && !!(styleOf(item) || {}).hidden;
  const anyHidden = items.some(hiddenOf) || items.some(x => x.sub && !showAllOnce && x.sub.every(y => y.sep || hiddenOf(y)));
  items = items.filter(x => !hiddenOf(x) && !(x.sub && !showAllOnce && x.sub.length && x.sub.every(y => y.sep || hiddenOf(y))));
  items = items.filter((x, i, a) => !x.sep || (i > 0 && i < a.length - 1 && !a[i - 1].sep));
  if (anyHidden) items = [...items, S, { label: '显示全部菜单项目', showAll: true }];
  for (const item of items) {
    if (item.sep) { const s = document.createElement('div'); s.className = 'menu-sep'; pop.appendChild(s); continue; }
    if (item.showAll) {
      const row = document.createElement('div'); row.className = 'menu-item';
      row.innerHTML = '<span class="menu-mark"></span><span class="menu-label"></span><span class="menu-sc"></span>';
      row.querySelector('.menu-label').textContent = item.label;
      row.addEventListener('click', e => { e.stopPropagation(); const i = openTop; closeAll(); showAllOnce = true; openTopMenu(i); });
      pop.appendChild(row); continue;
    }
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.setAttribute('role', 'menuitem');
    if (item.id === 'recent' || item.id === 'file.recent') {  }
    let label = item.label;
    if (item.dyn) { const dl = dynLabel(item.dyn); if (dl) label = dl; }
    const enabled = item.sub ? true : (item.disabled ? false : actions.enabled(item.action));
    const implemented = item.sub ? true : actions.has(item.action);
    row.classList.toggle('disabled', !enabled);
    row.classList.toggle('todo', !implemented && !item.disabled);
    
    if (!enabled && !item.sub && item.action) { const w = actions.why(item.action); if (w) row.title = w; }
    { const st = styleOf(item); const c = st && st.color && menuColorCss(st.color); if (c) { row.dataset.fpColor = st.color; row.style.background = c + '66'; } }
    if (item.check) {
      const on = item.checkedValue != null ? item.checkedValue : actions.checked(item.action);
      row.classList.add('checkable'); row.classList.toggle('checked', !!on);
    }
    
    const mark = document.createElement('span'); mark.className = 'menu-mark';
    if (row.classList.contains('checked')) mark.appendChild(uiIcon('check', 11));
    row.appendChild(mark);
    const lab = document.createElement('span'); lab.className = 'menu-label'; lab.textContent = label; row.appendChild(lab);
    if (item.sub) {
      const arr = document.createElement('span'); arr.className = 'menu-arrow'; arr.appendChild(uiIcon('chevron-right', 8)); row.appendChild(arr);
      let subItems = item.sub;
      if (item.id === 'recent') { const r = recentProvider() || []; subItems = r.length ? [...r.map(x => ({ label: x.label, action: 'file.openRecent', args: [x.id] })), S, ...item.sub] : [{ label: '（无最近文件）', disabled: true }]; }
      row.addEventListener('pointerenter', () => { openSub(row, subItems, level + 1); });
      row.addEventListener('click', e => { e.stopPropagation(); openSub(row, subItems, level + 1); });
    } else {
      const sc = document.createElement('span'); sc.className = 'menu-sc'; sc.textContent = item.action ? shortcuts.labelFor(item.action) : ''; row.appendChild(sc);
      row.addEventListener('pointerenter', () => { closeSubsFrom(pop); });
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (!enabled) return;
        closeAll();
        actions.run(item.action, ...(item.args || []));
      });
    }
    pop.appendChild(row);
  }
  return pop;
}
function closeSubsFrom(pop) {
  const lvl = +pop.className.match(/level-(\d+)/)[1];
  for (const p of document.querySelectorAll('.menu-pop')) { const l = +p.className.match(/level-(\d+)/)[1]; if (l > lvl) p.remove(); }
  for (const r of pop.querySelectorAll('.menu-item.open')) r.classList.remove('open');
}
function openSub(row, items, level) {
  const parent = row.closest('.menu-pop');
  closeSubsFrom(parent);
  row.classList.add('open');
  const pop = buildPop(items, level);
  document.body.appendChild(pop);
  const r = row.getBoundingClientRect();
  place(pop, r.right - 2, r.top - 4, r.left + 2);
}
function place(pop, x, y, altX) {
  pop.style.left = '0px'; pop.style.top = '0px';
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = x, top = y;
  if (left + w > innerWidth - 4) left = (altX != null ? altX - w : innerWidth - w - 4);
  if (top + h > innerHeight - 4) top = Math.max(4, innerHeight - h - 4);
  pop.style.left = Math.max(0, left) + 'px'; pop.style.top = Math.max(0, top) + 'px';
}
function hoverRow(row) {
  if (!row) return;
  for (const r of row.parentElement.querySelectorAll(':scope > .menu-item.hover')) r.classList.remove('hover');
  row.classList.add('hover');
  if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1');
  try { row.focus({ preventScroll: true }); } catch {  }
  row.scrollIntoView({ block: 'nearest' });
}
function openTopMenu(i, kbd = false) {
  if (!barEl) return;
  const titles = barEl.querySelectorAll('.menu-title');
  if (openTop === i) return;
  for (const p of document.querySelectorAll('.menu-pop')) p.remove();
  for (const t of titles) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); }
  if (openTop < 0 && kbd) focusBefore = document.activeElement;
  openTop = i;
  const t = titles[i]; t.classList.add('open');
  barEl.classList.add('active');
  const pop = buildPop(itemsFor(MENUS[i]), 0);
  document.body.appendChild(pop);
  const r = t.getBoundingClientRect();
  place(pop, r.left, r.bottom);
  t.setAttribute('aria-expanded', 'true');
  if (kbd) hoverRow(pop.querySelector(':scope > .menu-item:not(.disabled)'));
}


export function openMenuBarByKeyboard(i = 0) { if (barEl && openTop < 0) openTopMenu(i, true); return openTop >= 0; }

export function renderMenuBar(el) {
  barEl = el; el.innerHTML = '';
  el.setAttribute('role', 'menubar');
  MENUS.forEach((m, i) => {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'menu-title'; t.textContent = m.label; t.dataset.menu = m.id;
    t.addEventListener('pointerdown', e => { e.preventDefault(); if (openTop === i) closeAll(); else openTopMenu(i); });
    t.addEventListener('pointerenter', () => { if (openTop >= 0 && openTop !== i) openTopMenu(i); });
    t.addEventListener('click', e => { if (e.detail === 0) { if (openTop === i) closeAll(); else openTopMenu(i, true); } });   
    t.setAttribute('aria-haspopup', 'menu'); t.setAttribute('aria-expanded', 'false');
    el.appendChild(t);
  });
  document.addEventListener('pointerdown', e => { if (openTop >= 0 && !e.target.closest('.menu-pop') && !e.target.closest('.menu-title')) closeAll(); }, true);
  addEventListener('keydown', e => {
    if (openTop < 0) return;
    if (e.key === 'Escape') { closeAll(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    const pops = [...document.querySelectorAll('.menu-pop')];
    
    let depth = pops.length - 1;
    while (depth > 0 && !pops[depth].querySelector(':scope > .menu-item.hover')) depth--;
    const pop = pops[depth];
    const closeDeeper = () => { for (const p of pops.slice(depth + 1)) p.remove(); if (pop) for (const r of pop.querySelectorAll(':scope > .menu-item.open')) r.classList.remove('open'); };
    const rows = pop ? [...pop.querySelectorAll(':scope > .menu-item:not(.disabled)')] : [];
    const cur = rows.findIndex(r => r.classList.contains('hover'));
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowLeft') {
      stop();
      if (depth > 0) {                  
        for (const p of pops.slice(depth)) p.remove();
        const open = pops[depth - 1].querySelector(':scope > .menu-item.open');
        if (open) { open.classList.remove('open'); hoverRow(open); }
      } else openTopMenu((openTop + MENUS.length - 1) % MENUS.length, true);
      return;
    }
    if (e.key === 'ArrowRight') {
      stop();
      if (cur >= 0 && rows[cur].querySelector('.menu-arrow')) {   
        if (!rows[cur].classList.contains('open') || depth === pops.length - 1) rows[cur].click();
        const np = [...document.querySelectorAll('.menu-pop')].pop();
        if (np && np !== pop) hoverRow(np.querySelector(':scope > .menu-item:not(.disabled)'));
      } else openTopMenu((openTop + 1) % MENUS.length, true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      stop(); if (!rows.length) return;
      closeDeeper();
      const n = rows.length;
      const i = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : cur < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (cur + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      hoverRow(rows[i]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      stop();
      if (cur >= 0) { const r = rows[cur]; r.click(); if (r.querySelector('.menu-arrow')) { const np = [...document.querySelectorAll('.menu-pop')].pop(); if (np && np !== pop) hoverRow(np.querySelector(':scope > .menu-item:not(.disabled)')); } }
      return;
    }
    
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && rows.length) {
      const k = e.key.toLowerCase(), n = rows.length;
      for (let d = 1; d <= n; d++) { const r = rows[(cur + d + n) % n]; const t = (r.querySelector('.menu-label') || r).textContent.trim().toLowerCase(); if (t.startsWith(k)) { stop(); hoverRow(r); return; } }
    }
  }, true);
  addEventListener('blur', closeAll);
  addEventListener('resize', closeAll);
}


export function pathOf(actionId) {
  const walk = (items, trail) => { for (const x of items) { if (x.sep) continue; if (x.action === actionId) return [...trail, x.label]; if (x.sub) { const r = walk(x.sub, [...trail, x.label]); if (r) return r; } } return null; };
  for (const m of MENUS) { const r = walk(m.items, [m.label]); if (r) return r; }
  return null;
}
export function allActionIds() {
  const out = new Set();
  const walk = items => { for (const x of items) { if (x.sep) continue; if (x.action) out.add(x.action); if (x.sub) walk(x.sub); } };
  for (const m of MENUS) walk(m.items);
  return [...out];
}
export const menu = { MENUS, renderMenuBar, closeAll, openTopMenu, pathOf, allActionIds, setDynamicLabels, setDocumentsProvider, setRecentProvider, setItemsHook, setItemStyle, menuColorCss };
export default menu;
