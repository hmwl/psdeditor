import { uiIcon } from './icons.js';
import { colorPanel, rgbHex } from './color-panel.js';


export function colorSafety(getColor, setColor) {
  const root = document.createElement('div'); root.className = 'color-safety';
  const make = (kind, icon, title, correction) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'color-safety-' + kind; button.title = title;
    button.setAttribute('aria-label', title);
    const chip = document.createElement('i'); button.append(uiIcon(icon, 12), chip); root.append(button);
    button.onclick = () => setColor(correction(getColor()));
    return { button, chip, correction };
  };
  const print = make('print', 'gamut-warn', '超出印刷色域：替换为最接近的可打印颜色', c => colorPanel._conv.nearestPrintable(c));
  const web = make('web', 'web-warn', '非 Web 安全色：替换为最接近的 Web 安全颜色', c => c.map(v => Math.round(v / 51) * 51));
  function render() {
    const c = getColor();
    print.button.hidden = !colorPanel._conv.outOfGamut(c);
    web.button.hidden = colorPanel._conv.isWebSafe(c);
    for (const item of [print, web]) if (!item.button.hidden) item.chip.style.background = rgbHex(item.correction(c));
  }
  render(); return { root, render };
}
