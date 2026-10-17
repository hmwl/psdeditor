






const I = (k, label, min, max, def) => ({ k, label, type: 'int', min, max, def });
const E = (k, label, enumType, def, options) => ({ k, label, type: 'enum', enumType, def, options });
const Bo = (k, label, def) => ({ k, label, type: 'bool', def });
const C = (k, label, def) => ({ k, label, type: 'color', def });


const LIGHT_OPTS = [['LDBt', '下'], ['LDBL', '左下'], ['LDLf', '左'], ['LDTL', '左上'], ['LDTp', '上'], ['LDTR', '右上'], ['LDRg', '右'], ['LDBR', '右下']];

export const TEXTURE_OPTS = [['TxBr', '砖形'], ['TxBu', '粗麻布'], ['TxCa', '画布'], ['TxSt', '砂岩']];
const texParams = (scl, rlf, light) => [
  E('TxtT', '纹理', 'TxtT', 'TxCa', TEXTURE_OPTS), I('Scln', '缩放', 50, 200, scl), I('Rlf ', '凸现', 0, 50, rlf),
  E('LghD', '光照', 'LghD', light, LIGHT_OPTS), Bo('InvT', '反相', false),
];
const STROKE_DIR = [['SDRD', '右对角线'], ['SDHz', '水平'], ['SDLD', '左对角线'], ['SDVt', '垂直']];


export const GALLERY_GROUPS = [
  { id: 'stylize', name: '风格化', effects: [
    { id: 'glowingEdges', cls: 'GlwE', name: '照亮边缘', en: 'Glowing Edges', params: [I('EdgW', '边缘宽度', 1, 14, 2), I('EdgB', '边缘亮度', 0, 20, 6), I('Smth', '平滑度', 1, 15, 5)] },
  ] },
  { id: 'brushStrokes', name: '画笔描边', effects: [
    { id: 'angledStrokes', cls: 'AngS', name: '成角的线条', en: 'Angled Strokes', params: [I('DrcB', '方向平衡', 0, 100, 50), I('StrL', '描边长度', 3, 50, 15), I('Shrp', '锐化程度', 0, 10, 3)] },
    { id: 'inkOutlines', cls: 'InkO', name: '墨水轮廓', en: 'Ink Outlines', params: [I('StrL', '描边长度', 1, 50, 4), I('DrkI', '深色强度', 0, 50, 20), I('LghI', '光照强度', 0, 50, 10)] },
    { id: 'spatter', cls: 'Spt ', name: '喷溅', en: 'Spatter', params: [I('SprR', '喷色半径', 0, 25, 10), I('Smth', '平滑度', 1, 15, 5)] },
    { id: 'sprayedStrokes', cls: 'SprS', name: '喷色描边', en: 'Sprayed Strokes', params: [I('StrL', '描边长度', 0, 20, 12), I('SprR', '喷色半径', 0, 25, 7), E('SDir', '描边方向', 'StrD', 'SDRD', STROKE_DIR)] },
    { id: 'accentedEdges', cls: 'AccE', name: '强化的边缘', en: 'Accented Edges', params: [I('EdgW', '边缘宽度', 1, 14, 2), I('EdgB', '边缘亮度', 0, 50, 38), I('Smth', '平滑度', 1, 15, 5)] },
    { id: 'darkStrokes', cls: 'DrkS', name: '深色线条', en: 'Dark Strokes', params: [I('Blnc', '平衡', 0, 10, 5), I('BlcI', '黑色强度', 0, 10, 6), I('WhtI', '白色强度', 0, 10, 2)] },
    { id: 'sumie', cls: 'Smie', name: '烟灰墨', en: 'Sumi-e', params: [I('StrW', '描边宽度', 3, 15, 10), I('StrP', '描边压力', 0, 15, 2), I('Cntr', '对比度', 0, 40, 16)] },
    { id: 'crosshatch', cls: 'Crsh', name: '阴影线', en: 'Crosshatch', params: [I('StrL', '描边长度', 3, 50, 9), I('Shrp', '锐化程度', 0, 20, 6), I('Intn', '强度', 1, 3, 1)] },
  ] },
  { id: 'distort', name: '扭曲', effects: [
    { id: 'glass', cls: 'Gls ', name: '玻璃', en: 'Glass', params: [I('Dstr', '扭曲度', 0, 20, 5), I('Smth', '平滑度', 1, 15, 3),
      E('TxtT', '纹理', 'TxtT', 'TxFr', [['Blks', '块状'], ['TxCa', '画布'], ['TxFr', '磨砂'], ['TxTL', '小镜头']]), I('Scln', '缩放', 50, 200, 100), Bo('InvT', '反相', false)] },
    { id: 'oceanRipple', cls: 'OcnR', name: '海洋波纹', en: 'Ocean Ripple', params: [I('RplS', '波纹大小', 1, 15, 9), I('RplM', '波纹幅度', 0, 20, 9)] },
    { id: 'diffuseGlow', cls: 'DfsG', name: '扩散亮光', en: 'Diffuse Glow', params: [I('Grns', '粒度', 0, 10, 6), I('GlwA', '发光量', 0, 20, 10), I('ClrA', '清除数量', 0, 20, 15)] },
  ] },
  { id: 'sketch', name: '素描', effects: [
    { id: 'halftonePattern', cls: 'HlfS', name: '半调图案', en: 'Halftone Pattern', params: [I('Sz  ', '大小', 1, 12, 1), I('Cntr', '对比度', 0, 50, 5), E('ScrT', '图案类型', 'ScrT', 'ScrD', [['ScrC', '圆形'], ['ScrD', '网点'], ['ScrL', '直线']])] },
    { id: 'notePaper', cls: 'NtPr', name: '便条纸', en: 'Note Paper', params: [I('ImgB', '图像平衡', 0, 50, 25), I('Grns', '粒度', 0, 20, 10), I('Rlf ', '凸现', 0, 25, 11)] },
    { id: 'chalkCharcoal', cls: 'ChlC', name: '粉笔和炭笔', en: 'Chalk & Charcoal', params: [I('ChrA', '炭笔区', 0, 20, 6), I('ChlA', '粉笔区', 0, 20, 6), I('StrP', '描边压力', 0, 5, 1)] },
    { id: 'chrome', cls: 'Chrm', name: '铬黄渐变', en: 'Chrome', params: [I('Dtl ', '细节', 0, 10, 4), I('Smth', '平滑度', 0, 10, 7)] },
    { id: 'graphicPen', cls: 'GraP', name: '绘图笔', en: 'Graphic Pen', params: [I('StrL', '描边长度', 1, 15, 15), I('LgDr', '明/暗平衡', 0, 100, 50), E('SDir', '描边方向', 'StrD', 'SDRD', STROKE_DIR)] },
    { id: 'basRelief', cls: 'BsRl', name: '基底凸现', en: 'Bas Relief', params: [I('Dtl ', '细节', 1, 15, 13), I('Smth', '平滑度', 1, 15, 3), E('LghD', '光照', 'LghD', 'LDBt', LIGHT_OPTS)] },
    { id: 'plaster', cls: 'Plst', name: '石膏效果', en: 'Plaster', params: [I('ImgB', '图像平衡', 0, 50, 20), I('Smth', '平滑度', 1, 15, 2), E('LghD', '光照', 'LghD', 'LDTp', LIGHT_OPTS)] },
    { id: 'waterPaper', cls: 'WtrP', name: '水彩画纸', en: 'Water Paper', params: [I('FbrL', '纤维长度', 3, 50, 15), I('Brgh', '亮度', 0, 100, 60), I('Cntr', '对比度', 0, 100, 80)] },
    { id: 'tornEdges', cls: 'TrnE', name: '撕边', en: 'Torn Edges', params: [I('ImgB', '图像平衡', 0, 50, 25), I('Smth', '平滑度', 1, 15, 11), I('Cntr', '对比度', 1, 25, 17)] },
    { id: 'charcoal', cls: 'Chrc', name: '炭笔', en: 'Charcoal', params: [I('ChAm', '炭笔粗细', 1, 7, 1), I('Dtl ', '细节', 0, 5, 5), I('LgDr', '明/暗平衡', 0, 100, 50)] },
    { id: 'conteCrayon', cls: 'CntC', name: '炭精笔', en: 'Conté Crayon', params: [I('FrgL', '前景色阶', 1, 15, 11), I('BckL', '背景色阶', 1, 15, 7), ...texParams(100, 4, 'LDTp')] },
    { id: 'stamp', cls: 'Stmp', name: '图章', en: 'Stamp', params: [I('LgDr', '明/暗平衡', 0, 50, 25), I('Smth', '平滑度', 1, 50, 5)] },
    { id: 'reticulation', cls: 'Rtcl', name: '网状', en: 'Reticulation', params: [I('Dnst', '浓度', 0, 50, 12), I('FrgL', '前景色阶', 0, 50, 40), I('BckL', '背景色阶', 0, 50, 5)] },
    { id: 'photocopy', cls: 'Phtc', name: '影印', en: 'Photocopy', params: [I('Dtl ', '细节', 1, 24, 7), I('Drkn', '暗度', 1, 50, 8)] },
  ] },
  { id: 'texture', name: '纹理', effects: [
    { id: 'craquelure', cls: 'Crql', name: '龟裂缝', en: 'Craquelure', params: [I('CrcS', '裂缝间距', 2, 100, 15), I('CrcD', '裂缝深度', 0, 10, 6), I('CrcB', '裂缝亮度', 0, 10, 9)] },
    { id: 'grain', cls: 'Grn ', name: '颗粒', en: 'Grain', params: [I('Intn', '强度', 0, 100, 40), I('Cntr', '对比度', 0, 100, 50),
      E('Grnt', '颗粒类型', 'Grnt', 'GrnR', [['GrnR', '常规'], ['GrSf', '软化'], ['GrSr', '喷洒'], ['GrnC', '结块'], ['GrCn', '强反差'], ['GrnE', '扩大'], ['GrSt', '点刻'], ['GrnH', '水平'], ['GrnV', '垂直'], ['GrSp', '斑点']])] },
    { id: 'mosaicTiles', cls: 'MscT', name: '马赛克拼贴', en: 'Mosaic Tiles', params: [I('TlSz', '拼贴大小', 2, 100, 12), I('GrtW', '缝隙宽度', 1, 15, 3), I('LghG', '加亮缝隙', 0, 10, 9)] },
    { id: 'patchwork', cls: 'Ptch', name: '拼缀图', en: 'Patchwork', params: [I('SqrS', '方形大小', 0, 10, 4), I('Rlf ', '凸现', 0, 25, 8)] },
    { id: 'stainedGlass', cls: 'StnG', name: '染色玻璃', en: 'Stained Glass', params: [I('ClSz', '单元格大小', 2, 50, 10), I('BrdT', '边框粗细', 1, 20, 4), I('LghI', '光照强度', 0, 10, 3)] },
    { id: 'texturizer', cls: 'Txtz', name: '纹理化', en: 'Texturizer', params: texParams(100, 4, 'LDTp') },
  ] },
  { id: 'artistic', name: '艺术效果', effects: [
    { id: 'fresco', cls: 'Frsc', name: '壁画', en: 'Fresco', params: [I('BrsS', '画笔大小', 0, 10, 2), I('BrsD', '画笔细节', 0, 10, 8), I('Txtr', '纹理', 1, 3, 1)] },
    { id: 'coloredPencil', cls: 'ClrP', name: '彩色铅笔', en: 'Colored Pencil', params: [I('Pncl', '铅笔宽度', 1, 24, 4), I('StrP', '描边压力', 0, 15, 8), I('PprB', '纸张亮度', 0, 50, 25)] },
    { id: 'roughPastels', cls: 'RghP', name: '粗糙蜡笔', en: 'Rough Pastels', params: [I('StrL', '描边长度', 0, 40, 6), I('StDt', '描边细节', 1, 20, 4), ...texParams(100, 20, 'LDBt')] },
    { id: 'underpainting', cls: 'Undr', name: '底纹效果', en: 'Underpainting', params: [I('BrsS', '画笔大小', 0, 40, 6), I('TxtC', '纹理覆盖', 0, 40, 16), ...texParams(100, 4, 'LDTp')] },
    { id: 'dryBrush', cls: 'DryB', name: '干画笔', en: 'Dry Brush', params: [I('BrsS', '画笔大小', 0, 10, 2), I('BrsD', '画笔细节', 0, 10, 8), I('Txtr', '纹理', 1, 3, 1)] },
    { id: 'posterEdges', cls: 'PstE', name: '海报边缘', en: 'Poster Edges', params: [I('EdgT', '边缘厚度', 0, 10, 2), I('EdgI', '边缘强度', 0, 10, 1), I('Pstr', '海报化', 0, 6, 2)] },
    { id: 'sponge', cls: 'Spng', name: '海绵', en: 'Sponge', params: [I('BrsS', '画笔大小', 0, 10, 2), I('Dfnt', '清晰度', 0, 25, 12), I('Smth', '平滑度', 1, 15, 5)] },
    { id: 'paintDaubs', cls: 'PntD', name: '绘画涂抹', en: 'Paint Daubs', params: [I('BrsS', '画笔大小', 1, 50, 8), I('Shrp', '锐化程度', 0, 40, 7),
      E('BrsT', '画笔类型', 'BrsT', 'BrSm', [['BrSm', '简单'], ['BrsL', '未处理光照'], ['BrDR', '未处理深色'], ['BrsW', '宽锐化'], ['BrbW', '宽模糊'], ['BrSp', '火花']])] },
    { id: 'filmGrain', cls: 'FlmG', name: '胶片颗粒', en: 'Film Grain', params: [I('Grn ', '颗粒', 0, 20, 4), I('HghA', '高光区域', 0, 20, 0), I('Intn', '强度', 0, 10, 10)] },
    { id: 'cutout', cls: 'Ct  ', name: '木刻', en: 'Cutout', params: [I('NmbL', '色阶数', 2, 8, 4), I('EdgS', '边缘简化度', 0, 10, 4), I('EdgF', '边缘逼真度', 1, 3, 2)] },
    { id: 'neonGlow', cls: 'NGlw', name: '霓虹灯光', en: 'Neon Glow', params: [I('Sz  ', '发光大小', -24, 24, 5), I('Brgh', '发光亮度', 0, 50, 15), C('Clr ', '发光颜色', [0, 72, 255])] },
    { id: 'watercolor', cls: 'Wtrc', name: '水彩', en: 'Watercolor', params: [I('BrsD', '画笔细节', 1, 14, 9), I('ShdI', '阴影强度', 0, 10, 1), I('Txtr', '纹理', 1, 3, 1)] },
    { id: 'plasticWrap', cls: 'PlsW', name: '塑料包装', en: 'Plastic Wrap', params: [I('HghS', '高光强度', 0, 20, 15), I('Dtl ', '细节', 1, 15, 9), I('Smth', '平滑度', 1, 15, 7)] },
    { id: 'paletteKnife', cls: 'PltK', name: '调色刀', en: 'Palette Knife', params: [I('StrS', '描边大小', 1, 50, 25), I('StDt', '描边细节', 1, 3, 3), I('Sftn', '软化度', 0, 10, 0)] },
    { id: 'smudgeStick', cls: 'SmdS', name: '涂抹棒', en: 'Smudge Stick', params: [I('StrL', '描边长度', 0, 10, 2), I('HghA', '高光区域', 0, 20, 0), I('Intn', '强度', 0, 10, 10)] },
  ] },
];
export const GALLERY_EFFECTS = GALLERY_GROUPS.flatMap(g => g.effects.map(e => ({ ...e, group: g.id, groupName: g.name })));
const BY_ID = Object.fromEntries(GALLERY_EFFECTS.map(e => [e.id, e]));
const BY_CLS = Object.fromEntries(GALLERY_EFFECTS.map(e => [e.cls, e]));
export const effectSpec = id => BY_ID[id] || null;
export const effectByClass = cls => BY_CLS[cls] || null;


export function effectDefaults(id) {
  const s = BY_ID[id]; if (!s) throw new Error('滤镜库没有这个效果：' + id);
  const o = {}; for (const p of s.params) o[p.k] = Array.isArray(p.def) ? p.def.slice() : p.def; return o;
}

export function normalizeEffectParams(id, params = {}) {
  const s = BY_ID[id]; if (!s) throw new Error('滤镜库没有这个效果：' + id);
  const o = effectDefaults(id);
  for (const p of s.params) {
    const v = params[p.k]; if (v === undefined || v === null) continue;
    if (p.type === 'int') { const n = Math.round(+v); if (Number.isFinite(n)) o[p.k] = Math.max(p.min, Math.min(p.max, n)); }
    else if (p.type === 'bool') o[p.k] = !!v;
    else if (p.type === 'enum') { if (p.options.some(([k]) => k === v) || (p.k === 'TxtT' && v === 'custom')) o[p.k] = v; }
    else if (p.type === 'color' && Array.isArray(v) && v.length >= 3) o[p.k] = v.slice(0, 3).map(c => Math.max(0, Math.min(255, Math.round(+c || 0))));
  }
  return o;
}




const rgbc = c => ({ __name: '', __classID: 'RGBC', 'Rd  ': c[0], 'Grn ': c[1], 'Bl  ': c[2], __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true } });


export function effectDescriptor(id, params) {
  const s = BY_ID[id]; if (!s) throw new Error('滤镜库没有这个效果：' + id);
  const p = normalizeEffectParams(id, params);
  const d = { __name: '', __classID: 'GEfc', GEfk: { __enumType: 'GEft', value: s.cls } };
  const longs = {};
  for (const sp of s.params) {
    const v = p[sp.k];
    if (sp.type === 'int') { d[sp.k] = v; longs[sp.k] = true; }
    else if (sp.type === 'bool') d[sp.k] = !!v;
    else if (sp.type === 'enum') d[sp.k] = { __enumType: sp.enumType, value: v === 'custom' ? 'TxCa' : v };
    else if (sp.type === 'color') d[sp.k] = rgbc(v);
  }
  d.__long = longs;
  return d;
}

export function galleryDescriptor(layers) {
  const live = (layers || []).filter(l => l && l.visible !== false && BY_ID[l.id]);
  return {
    __name: '滤镜库', __classID: 'GEfc',
    'null': { __reference: [{ type: 'Enmr', cls: { name: '', cid: 'Lyr ' }, enumType: 'Ordn', value: 'Trgt' }] },
    GEfs: live.map(l => effectDescriptor(l.id, l.params)),
  };
}

export function decodeGalleryDescriptor(Fltr) {
  if (!Fltr || typeof Fltr !== 'object') return null;
  const items = Array.isArray(Fltr.GEfs) ? Fltr.GEfs : (Fltr.GEfk ? [Fltr] : null);
  if (!items) return null;
  const out = [];
  for (const it of items) {
    const cls = it && it.GEfk && (it.GEfk.value ?? it.GEfk);
    const s = BY_CLS[cls]; if (!s) return null;
    const params = {};
    for (const sp of s.params) {
      const raw = it[sp.k]; if (raw === undefined) continue;
      if (sp.type === 'int') params[sp.k] = +(raw && typeof raw === 'object' ? raw.value : raw);
      else if (sp.type === 'bool') params[sp.k] = !!raw;
      else if (sp.type === 'enum') params[sp.k] = raw && typeof raw === 'object' ? raw.value : raw;
      else if (sp.type === 'color' && raw && typeof raw === 'object') params[sp.k] = [+raw['Rd  '] || 0, +raw['Grn '] || 0, +raw['Bl  '] || 0];
    }
    out.push({ id: s.id, params: normalizeEffectParams(s.id, params), visible: true });
  }
  return out;
}

export function galleryFilterFXEntry(layers, o = {}) {
  const opacity = o.opacity == null ? 100 : Math.max(0, Math.min(100, +o.opacity));
  const fg = o.fg || [0, 0, 0], bg = o.bg || [255, 255, 255];
  return {
    __name: '', __classID: 'filterFX',
    'Nm  ': '滤镜库...',
    blendOptions: { __name: '', __classID: 'blendOptions', Opct: { __unit: '#Prc', value: opacity }, 'Md  ': { __enumType: 'BlnM', value: o.mode || 'normal' } },
    enab: o.enabled !== false, hasoptions: true,
    
    FrgC: rgbc(fg), BckC: rgbc(bg),
    Fltr: galleryDescriptor(layers),
  };
}

