import { alertDialog, confirmDialog } from './dialog.js';

export const PRO_WARP_LABELS = {
  warp: '自由变换 · 变形',
  quiltWarp: '自由变换 · 变形',
  perspectiveWarp: '透视变形',
  puppetWarp: '操控变形',
};

export const proWarpLabel = kind => PRO_WARP_LABELS[kind] || '变形';

export async function proWarpNotice(kind) {
  await alertDialog(`「${proWarpLabel(kind)}」为 Pro 版功能，请联系作者。`, { title: 'Pro 版功能', okText: '我知道了' });
  return false;
}

export async function askRasterizeProWarps(items) {
  const list = (items || []).map(it => {
    const kinds = [...new Set((it.kinds || []).map(proWarpLabel))].join(' / ');
    return `「${it.name}」：${kinds}`;
  });
  const msg = `检测到 ${list.length} 个图层使用了 Pro 版变形功能：\n${list.join('\n')}\n\n是否栅格化对应图层？栅格化后这些图层将变为普通像素图层，变形不可再编辑。`;
  return confirmDialog(msg, { title: 'Pro 版变形', okText: '栅格化', cancelText: '暂不', danger: true });
}
