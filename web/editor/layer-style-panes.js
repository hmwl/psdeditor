






const num = (path, label, o = {}) => ({ kind: 'num', path, label, ...o });
const bool = (path, label, o = {}) => ({ kind: 'bool', path, label, ...o });
const enm = (path, label, table, o = {}) => ({ kind: 'enum', path, label, table, ...o });
const color = (path, label, o = {}) => ({ kind: 'color', path, label, ...o });

const blend = (path, label, colorPath) => ({ kind: 'blend', path, label, colorPath });

const angle = (path, label, global) => ({ kind: 'angle', path, label, global });

const contour = (path, label, anti) => ({ kind: 'contour', path, label, anti });

export const ANTI_TIP = '把边缘的过渡按等高线重新采样，细小效果上更干净（PS 同名选项）';


const fillType = inst => { const v = inst.value('PntT'); return v == null ? 'SClr' : v; };

export const PANES = [
  { id: 'blend', label: '混合选项', special: 'blend' },

  { id: 'bevelEmboss', key: 'ebbl', label: '斜面和浮雕', groups: [
    { title: '结构', rows: [
      enm('bvlS', '样式', 'BESl'),
      enm('bvlT', '方法', 'BETE'),
      num('srgR', '深度', { unit: '%', sliderMax: 1000 }),
      enm('bvlD', '方向', 'BESs'),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
      num('Sftn', '软化', { unit: 'px', sliderMax: 16 }),
    ] },
    { title: '阴影', rows: [
      angle('lagl', '角度', 'uglg'),
      num('Lald', '高度', { unit: '°', sliderMax: 90 }),
      contour('MpgS', '光泽等高线', 'antialiasGloss'),
      blend('hglM', '高光模式', 'hglC'),
      num('hglO', '不透明度', { unit: '%', sliderMax: 100 }),
      blend('sdwM', '阴影模式', 'sdwC'),
      num('sdwO', '不透明度', { unit: '%', sliderMax: 100 }),
    ] },
  ] },
  { id: 'bevelContour', key: 'ebbl', parent: 'bevelEmboss', label: '等高线', toggle: 'useShape', groups: [
    { title: '图素', rows: [
      contour('TrnS', '等高线', 'AntA'),
      num('Inpr', '范围', { unit: '%', sliderMax: 100 }),
    ] },
  ] },
  { id: 'bevelTexture', key: 'ebbl', parent: 'bevelEmboss', label: '纹理', toggle: 'useTexture', groups: [
    { title: '图素', rows: [
      { kind: 'pattern', label: '图案' },
      num('Scl ', '缩放', { unit: '%', sliderMax: 1000 }),
      num('textureDepth', '深度', { unit: '%', sliderMax: 1000 }),
      bool('InvT', '反相'),
      bool('Algn', '与图层链接'),
    ] },
  ] },

  { id: 'stroke', key: 'FrFX', label: '描边', groups: [
    { title: '结构', rows: [
      num('Sz  ', '大小', { unit: 'px', sliderMax: 250 }),
      enm('Styl', '位置', 'FStl'),
      blend('Md  ', '混合模式'),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      bool('overprint', '叠印'),
    ] },
    { title: '填充', rows: [
      enm('PntT', '填充类型', 'FrFl'),
      color('Clr ', '颜色', { when: fx => fillType(fx) === 'SClr' }),
      { kind: 'gradient', when: fx => fillType(fx) === 'GrFl' },
      { kind: 'pattern', label: '图案', when: fx => fillType(fx) === 'Ptrn' },
      num('Scl ', '缩放', { unit: '%', sliderMax: 1000, when: fx => fillType(fx) !== 'SClr' }),
    ] },
  ] },

  { id: 'innerShadow', key: 'IrSh', label: '内阴影', groups: [
    { title: '结构', rows: [
      blend('Md  ', '混合模式', 'Clr '),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      angle('lagl', '角度', 'uglg'),
      num('Dstn', '距离', { unit: 'px', sliderMax: 250 }),
      num('Ckmt', '阻塞', { unit: '%', sliderMax: 100 }),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
    ] },
    { title: '品质', rows: [
      contour('TrnS', '等高线', 'AntA'),
      num('Nose', '杂色', { unit: '%', sliderMax: 100 }),
    ] },
  ] },

  { id: 'innerGlow', key: 'IrGl', label: '内发光', groups: [
    { title: '结构', rows: [
      blend('Md  ', '混合模式'),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      num('Nose', '杂色', { unit: '%', sliderMax: 100 }),
      color('Clr ', '颜色'),
    ] },
    { title: '图素', rows: [
      enm('GlwT', '方法', 'BETE'),
      enm('glwS', '源', 'IGSr'),
      num('Ckmt', '阻塞', { unit: '%', sliderMax: 100 }),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
    ] },
    { title: '品质', rows: [
      contour('TrnS', '等高线', 'AntA'),
      num('Inpr', '范围', { unit: '%', sliderMax: 100 }),
      num('ShdN', '抖动', { unit: '%', sliderMax: 100 }),
    ] },
  ] },

  { id: 'satin', key: 'ChFX', label: '光泽', groups: [
    { title: '结构', rows: [
      blend('Md  ', '混合模式', 'Clr '),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      angle('lagl', '角度'),
      num('Dstn', '距离', { unit: 'px', sliderMax: 250 }),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
      contour('MpgS', '等高线', 'AntA'),
      bool('Invr', '反相'),
    ] },
  ] },

  { id: 'colorOverlay', key: 'SoFi', label: '颜色叠加', groups: [
    { title: '颜色', rows: [
      blend('Md  ', '混合模式', 'Clr '),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
    ] },
  ] },

  { id: 'gradientOverlay', key: 'GrFl', label: '渐变叠加', groups: [
    { title: '渐变', rows: [
      blend('Md  ', '混合模式'),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      { kind: 'gradient' },
      bool('Algn', '与图层对齐'),
    ] },
  ] },

  { id: 'patternOverlay', key: 'patternFill', label: '图案叠加', groups: [
    { title: '图案', rows: [
      blend('Md  ', '混合模式'),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      { kind: 'pattern', label: '图案' },
      num('Scl ', '缩放', { unit: '%', sliderMax: 1000 }),
      bool('Algn', '与图层链接'),
    ] },
  ] },

  { id: 'outerGlow', key: 'OrGl', label: '外发光', groups: [
    { title: '结构', rows: [
      blend('Md  ', '混合模式'),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      num('Nose', '杂色', { unit: '%', sliderMax: 100 }),
      color('Clr ', '颜色'),
    ] },
    { title: '图素', rows: [
      enm('GlwT', '方法', 'BETE'),
      enm('glwS', '源', 'IGSr'),
      num('Ckmt', '扩展', { unit: '%', sliderMax: 100 }),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
    ] },
    { title: '品质', rows: [
      contour('TrnS', '等高线', 'AntA'),
      num('Inpr', '范围', { unit: '%', sliderMax: 100 }),
      num('ShdN', '抖动', { unit: '%', sliderMax: 100 }),
    ] },
  ] },

  { id: 'dropShadow', key: 'DrSh', label: '投影', groups: [
    { title: '结构', rows: [
      blend('Md  ', '混合模式', 'Clr '),
      num('Opct', '不透明度', { unit: '%', sliderMax: 100 }),
      angle('lagl', '角度', 'uglg'),
      num('Dstn', '距离', { unit: 'px', sliderMax: 250 }),
      num('Ckmt', '扩展', { unit: '%', sliderMax: 100 }),
      num('blur', '大小', { unit: 'px', sliderMax: 250 }),
    ] },
    { title: '品质', rows: [
      contour('TrnS', '等高线', 'AntA'),
      num('Nose', '杂色', { unit: '%', sliderMax: 100 }),
      bool('layerConceals', '图层挖空投影'),
    ] },
  ] },
];
export const PANE_BY_ID = Object.fromEntries(PANES.map(p => [p.id, p]));
export const UNIT_OF = { '#Prc': '%', '#Pxl': 'px', '#Ang': '°' };


export const FX_PANE_LIST = PANES.filter(p => p.key && !p.parent).map(p => ({ id: p.id, key: p.key, label: p.label }));

export const FX_PANEL_ORDER = FX_PANE_LIST.map(p => p.key);

