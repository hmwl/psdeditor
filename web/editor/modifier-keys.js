








import { IS_MAC } from './shortcuts.js';

const KEYS = [['shift', 'Shift', 'Shift', '⇧ Shift'], ['alt', 'Alt', 'Alt', IS_MAC ? '⌥ Option' : 'Alt'], ['mod', IS_MAC ? 'Meta' : 'Control', IS_MAC ? 'Meta' : 'Control', IS_MAC ? '⌘ Command' : 'Ctrl']];
const state = { shift: 0, alt: 0, mod: 0 };          
let root = null;
const on = k => state[k] > 0;
const any = () => on('shift') || on('alt') || on('mod');

function patch(e) {
  if (!any() || e.__fpMods) return;
  try {
    const def = (k, v) => Object.defineProperty(e, k, { configurable: true, get: () => v });
    if (on('shift')) def('shiftKey', true);
    if (on('alt')) def('altKey', true);
    if (on('mod')) def(IS_MAC ? 'metaKey' : 'ctrlKey', true);
    const orig = e.getModifierState ? e.getModifierState.bind(e) : () => false;
    def('getModifierState', k => (k === 'Shift' && on('shift')) || (k === 'Alt' && on('alt')) || ((k === 'Meta' || k === 'Control') && on('mod') && k === (IS_MAC ? 'Meta' : 'Control')) || orig(k));
    Object.defineProperty(e, '__fpMods', { value: true });
  } catch {}
}
function synth(type, k) {
  const [, key, code] = KEYS.find(x => x[0] === k);
  try { dispatchEvent(new KeyboardEvent(type, { key, code: code === 'Meta' ? 'MetaLeft' : code + 'Left', shiftKey: on('shift'), altKey: on('alt'), metaKey: IS_MAC && on('mod'), ctrlKey: !IS_MAC && on('mod'), bubbles: true })); } catch {}
}
function set(k, v) {
  const was = state[k]; state[k] = v;
  if (!!was !== !!v) synth(v ? 'keydown' : 'keyup', k);
  render();
}
function releaseOneShots() { for (const k of Object.keys(state)) if (state[k] === 1) set(k, 0); }

function render() {
  if (!root) return;
  for (const b of root.querySelectorAll('button[data-mk]')) {
    const v = state[b.dataset.mk];
    b.classList.toggle('on', v > 0); b.classList.toggle('locked', v === 2);
    b.setAttribute('aria-pressed', v > 0 ? 'true' : 'false');
  }
}
export function installModifierKeys() {
  const sec = document.querySelector('.panel[data-panel="modifierKeys"]'); if (!sec) return;
  sec.replaceChildren();
  root = document.createElement('div');
  root.className = 'mk-panel';
  root.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px';
  for (const [k, , , label] of KEYS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.mk = k; b.textContent = label;
    b.style.cssText = 'height:40px;font-size:13px';
    b.title = '点一下：下一次操作视同按住；双击：锁定（再点一下松开）';
    let last = 0;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => {
      e.stopPropagation();
      const now = performance.now();
      if (now - last < 350) { set(k, 2); last = 0; return; }
      last = now;
      set(k, state[k] ? 0 : 1);
    });
    root.append(b);
  }
  const note = document.createElement('div'); note.style.cssText = 'font-size:11px;color:var(--ps-muted);line-height:1.6';
  note.textContent = '给触屏 / 手写笔用：点一下 = 下一次在画布上的操作带上这个修饰键；双击 = 一直按住（高亮描边），再点一下松开。';
  root.append(note);
  const st = document.createElement('style');
  st.textContent = '.mk-panel button.on{background:var(--ps-accent,#2d8ceb);color:#fff}.mk-panel button.locked{outline:2px solid #fff;outline-offset:-4px}';
  root.append(st);
  sec.append(root);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'contextmenu'])
    addEventListener(t, e => { if (e.isTrusted) patch(e); }, true);
  
  addEventListener('pointerup', e => { if (!e.isTrusted) return; if (e.target && e.target.closest && e.target.closest('.mk-panel')) return; setTimeout(releaseOneShots, 0); }, true);
  render();
}
export const modifierKeys = { installModifierKeys, state: () => ({ ...state }), set };
export default modifierKeys;
