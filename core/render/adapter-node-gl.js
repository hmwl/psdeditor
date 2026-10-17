






import { createGLBackend } from './gl.js';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

let createContext = null;
function loadGL() {
  if (createContext) return createContext;
  try { createContext = require_('gl'); }
  catch (e) {
    throw new Error(
      'headless-gl 未安装或加载失败：' + e.message +
      '\n请使用默认 CPU 后端，或由部署方安装并审计兼容的 GL provider。'
    );
  }
  return createContext;
}

let ctx = null, ctxW = 0, ctxH = 0;

const provider = {
  acquire(w, h) {
    const create = loadGL();
    if (!ctx || ctxW !== w || ctxH !== h) {
      if (ctx) { const ext = ctx.getExtension('STACKGL_destroy_context'); if (ext) ext.destroy(); }
      ctx = create(w, h, { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
      if (!ctx) throw new Error(`headless-gl 创建 ${w}×${h} 上下文失败（可能超出最大纹理/渲染缓冲尺寸）`);
      ctxW = w; ctxH = h;
    }
    return {
      gl: ctx, isGL2: false,
      
      read: out => {
        const row = w * 4;
        const tmp = new Uint8Array(out.length);
        ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, tmp);
        for (let y = 0; y < h; y++) out.set(tmp.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      }
    };
  }
};

export function createNodeGLBackend() { return createGLBackend(provider); }


export function nodeGLAvailable() {
  try { loadGL(); const c = createContext(4, 4); if (!c) return false;
        const ext = c.getExtension('STACKGL_destroy_context'); if (ext) ext.destroy(); return true; }
  catch { return false; }
}
