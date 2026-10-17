

import { get as getPreference } from './preferences.js';

export function rasterOpenLayerOptions(file, displayName = '') {
  const jpeg = /\.(jpe?g|jpe|jfif)$/i.test(file?.name || '') || /^image\/(jpeg|pjpeg)$/i.test(file?.type || '');
  if (jpeg) return getPreference('tech.openJpegWithoutBackground')
    ? { background: 'transparent', name: '图层 0' }
    : { background: 'white', name: '背景' };
  return { background: 'transparent', name: String(displayName || file?.name || '').replace(/\.[^.]+$/, '') };
}
