





import { uiIcon } from './icons.js';
export const LB_ICONS = {
  'CompActivate': 'lb-comp-activate',
  'CompAppearance': 'lb-comp-appearance',
  'CompNew': 'lb-comp-new',
  'CompNext': 'lb-comp-next',
  'CompPosition': 'lb-comp-position',
  'CompPrev': 'lb-comp-prev',
  'CompRecaptureAppearance': 'lb-comp-recapture-appearance',
  'CompRecapturePosition': 'lb-comp-recapture-position',
  'CompRecaptureVisibility': 'lb-comp-recapture-visibility',
  'CompRecaptureLayers': 'lb-comp-recapture-layers',
  'CompVisibility': 'lb-comp-visibility',
  'WarningSmall': '/assets/ui/e7648719db.png',
  'Trashcan': 'lb-trashcan',
  'MeasureDelete': 'lb-measure-delete',
};

export function lbIcon(name, size = 16) {
  const light = document.documentElement.classList.contains('theme-light') || document.body?.classList.contains('light');
  const src = (light && LB_ICONS[name + '_light']) || LB_ICONS[name];
  if (src && !src.startsWith('/')) {
    const im = uiIcon(src, size);
    im.style.display = 'block'; im.style.pointerEvents = 'none';
    if (light) im.style.filter = 'brightness(0)';
    return im;
  }
  const im = document.createElement('img'); im.src = src || ''; im.width = size; im.height = size; im.alt = ''; im.draggable = false;
  im.style.cssText = 'display:block;pointer-events:none';
  return im;
}
