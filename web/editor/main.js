












import '../../core/app.js';
import '../../core/remaining-brush.js';
import '../../core/brush-engine.js';
import './brushes-panel.js';
import './brush-bar-icons.js';
import './toolfix-icons.js';
import './path-name-codec.js';
import './select-mask-extra.js';
import '../../core/paint-fill.js';
import '../../core/psd-additional.js';
import '../../core/compose.js';
import '../../core/text-warp.js';
import '../../core/text-vpath.js';
import '../../core/text-caret.js';
import '../../core/text-path.js';
import '../../core/glyph-outline.js';
import '../../core/psd-text.js';
import '../../core/psd-raster.js';
import '../../core/live-wire.js';
import '../../core/psd-edit-smart.js';
import '../../core/font-sfnt.js';
import '../../core/homography.js';
import '../../core/psd-channels.js';
import './api-client.js';
import './engine-loader.js';
import './lazy.js';
import './shell.js';
import './actions.js';
import './tools.js';
import './panels.js';
import './property-panel.js';
import './props-ps.js';
import './adjustments-panel.js';
import './shortcuts.js';
import './preferences.js';
import './shortcut-editor.js';
import './workspaces.js';
import './modifier-keys.js';
import './brush-settings-extras.js';
import './menu.js';
import './recent-files.js';
import './ps-panels.js';
import './shapes.js';
import './path-icons.js';
import './icons.js';
import './dialog.js';
import './color-picker.js';
import './layers-more.js';
import './layers-panel.js';
import './chan-path-panels.js';
import './smart-filter-edit.js';
import '../../core/psd-links.js';
import '../../core/filter-gallery-spec.js';
import './history-panel.js';
import './notes-panel.js';
import './content-aware-scale.js';
import './presets-panels.js';
import './toast.js';
import './path-warp.js';
import '../../core/exif.js';
import './documents.js';
import './color-mgmt.js';
import './color-panel.js';
import '../../core/text-styles.js';
import './window-menu.js';
import './layerb.js';
import './app/58-scripting.js';


if (!globalThis.__PSD_EDITOR_DEV__ && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const reg = () => { navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[离线缓存] 注册失败', e)); };
  
  if (document.readyState === 'complete') setTimeout(reg, 1500); else addEventListener('load', reg, { once: true });
}
