















export async function loadEngine(api) {
  if (globalThis.__PSD_EDITOR_DEV__) {
    const devPath = '../../core/engine.js';          
    return import(devPath);
  }
  const { bytes, key, sid } = await api.engineBundle();
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'FPE2') throw new Error('引擎包格式错误');
  const iv = bytes.subarray(4, 16), ct = bytes.subarray(16);
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  let gz = null, plain = null, url = null;
  try {
    
    gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(sid) }, k, ct);
    plain = await gunzip(gz);
    url = URL.createObjectURL(new Blob([plain], { type: 'text/javascript' }));
    return await import(url);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (plain) new Uint8Array(plain).fill(0);
    if (gz) new Uint8Array(gz).fill(0);
    bytes.fill(0); key.fill(0);      
  }
}



async function gunzip(buf) {
  if (typeof DecompressionStream !== 'function') throw new Error('浏览器不支持 gzip 解压（请升级浏览器）');
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
