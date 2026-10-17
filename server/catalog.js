











import { listOps } from '../core/psd-edit.js';
import { listFilters } from '../core/filters.js';
import { listAdjustments } from '../core/adjust.js';
import { listCreatableEffects, listAdjustmentKinds } from '../core/psd-edit-create.js';
import { NEW_DOC_PRESETS, NEW_DOC_MODES } from '../core/psd-new.js';
import { BLEND_KEYS } from '../core/psd-edit.js';
import { CORE_OP_CATALOG } from './catalog-core.js';
import { EXT_OPS, LEGACY_SERVER_OPS } from './server-ops.js';

const BLEND_LABELS = {
  pass: '穿透（仅组）', norm: '正常', diss: '溶解', dark: '变暗', 'mul ': '正片叠底', idiv: '颜色加深', lbrn: '线性加深', dkCl: '深色',
  lite: '变亮', scrn: '滤色', 'div ': '颜色减淡', lddg: '线性减淡', lgCl: '浅色', over: '叠加', sLit: '柔光', hLit: '强光',
  vLit: '亮光', lLit: '线性光', pLit: '点光', hMix: '实色混合', diff: '差值', smud: '排除', fsub: '减去', fdiv: '划分',
  'hue ': '色相', 'sat ': '饱和度', colr: '颜色', 'lum ': '明度',
};

let CACHE = null;


export function checkCatalog() {
  const have = new Set(CORE_OP_CATALOG.filter(o => !o.aliasOf).map(o => o.op));
  const want = listOps();
  const missing = want.filter(o => !have.has(o)), extra = [...have].filter(o => !want.includes(o));
  return { ok: !missing.length && !extra.length, missing, extra };
}


export function buildCatalog() {
  if (CACHE) return CACHE;
  const ops = [
    ...CORE_OP_CATALOG.map(o => ({ ...o, kind: 'core', locate: 'index' })),
    ...Object.entries(EXT_OPS).map(([op, s]) => ({ op, kind: 'server', locate: 'index|target', category: s.category,
      summary: s.summary, structural: !!s.structural, fields: s.fields, ...(s.notes ? { notes: s.notes } : {}), example: s.example })),
    ...LEGACY_SERVER_OPS.map(o => ({ ...o, kind: 'server', locate: 'target' })),
  ].map(o => ({ ...o, feature: 'op.' + o.op }));
  let effects = [], adjustmentLayerKinds = [];
  try { effects = listCreatableEffects(); } catch { effects = []; }
  try { adjustmentLayerKinds = listAdjustmentKinds(); } catch { adjustmentLayerKinds = []; }
  CACHE = {
    version: 1,
    entitlements: { plans: '/api/plans', account: '/api/account', note: '每个 op / 端点 / MCP 工具都有功能 id（op.<名> · api.<路径> · mcp.tool.<名>），档位决定哪些可用及频率；不在档位时 403，超频 429' },
    ops,
    opNames: ops.map(o => o.op).sort(),
    filters: listFilters(),
    adjustments: listAdjustments(),
    adjustmentLayerKinds,
    layerEffects: effects,
    blendModes: [...BLEND_KEYS].map(k => ({ key: k, label: BLEND_LABELS[k] || k })),
    newDocument: { modes: NEW_DOC_MODES, presets: NEW_DOC_PRESETS, backgrounds: ['white', 'black', 'transparent', 'color'] },
    selection: {
      shapes: ['rect', 'ellipse', 'polygon', 'all'], modes: ['replace', 'add', 'subtract', 'intersect', 'xor'],
      example: [{ type: 'rect', x: 10, y: 10, width: 200, height: 100, feather: 4 }, { type: 'ellipse', x: 60, y: 30, width: 80, height: 80, mode: 'subtract' }],
    },
    outputs: { psd: true, bitmap: ['png', 'jpg', 'webp', 'tiff'], source: ['layers', 'composite'], artboard: true },
  };
  return CACHE;
}
