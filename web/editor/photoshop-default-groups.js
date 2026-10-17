
export const DEFAULT_GROUP_LAYOUT = 1;
export const DEFAULT_PANEL_PACKS = new Set(['default-swatches', 'default-gradients', 'default-patterns']);
export function defaultPresetGroup(packId, index, name) {
  if (packId === 'default-swatches') {
    const groups = [['RGB', 6], ['CMYK', 12], ['灰度', 32], ['蜡笔', 48], ['浅色', 64], ['纯净', 80], ['黑色', 96], ['较暗', 112], ['淡色', 122]];
    return groups.find(([, end]) => index < end)?.[0] || '其他';
  }
  if (packId === 'default-gradients') {
    if (index < 3) return '基础';
    const prefix = name.split('_')[0];
    return { Blue: '蓝色', Purple: '紫色', Pink: '粉色', Red: '红色', Orange: '橙色', Green: '绿色', Gray: '灰色', Cloud: '云彩', Iridescent: '彩虹色', Pastels: '粉彩', 'Off white': '中性色', Sand: '中性色' }[prefix] || '其他';
  }
  if (packId === 'default-patterns') return index < 4 ? '树' : index < 7 ? '草' : '水滴';
  return null;
}
