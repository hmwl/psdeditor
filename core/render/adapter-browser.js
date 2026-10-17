



import { createGLBackend } from './gl.js';

let canvas = null, gl = null, isGL2 = false;

const provider = {
  acquire(w, h) {
    if (!canvas) {
      canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(4, 4) : document.createElement('canvas');
      gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true });
      isGL2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
      if (!gl) throw new Error('WebGL 不可用');
    }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return {
      gl, isGL2,
      
      
      read: out => {
        const row = w * 4;
        const tmp = new Uint8Array(out.length);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
        for (let y = 0; y < h; y++) out.set(tmp.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      }
    };
  }
};

export function createBrowserGLBackend() { return createGLBackend(provider); }
export function glSourceCanvas() { return canvas; }





export function blitToCanvas(canvas2d, docW, docH) {
  canvas2d.width = docW; canvas2d.height = docH;
  const ctx = canvas2d.getContext('2d');
  ctx.clearRect(0, 0, docW, docH);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, docW, docH);
  return canvas2d;
}
