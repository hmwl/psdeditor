
let ctx;
const files = new Map();
let pending = null;
const types = [{ description: 'Photoshop 文档', accept: { 'image/vnd.adobe.photoshop': ['.psd', '.psb'] } }];
export function installDocumentFiles(c) { ctx = c; }
export function bindDocumentFile(handle, uid = ctx.uid()) {
  if (uid != null && handle && /\.ps[db]$/i.test(handle.name)) files.set(uid, handle);
}
export function documentFile(uid = ctx.uid()) { return files.get(uid) || null; }
export function releaseDocumentFile(uid) { files.delete(uid); }
export async function openDocumentFile() {
  if (!globalThis.showOpenFilePicker) { ctx.input().click(); return false; }
  try {
    const handles = await showOpenFilePicker({ multiple: true });
    const files = await Promise.all(handles.map(h => h.getFile()));
    if (files.length > 1) {
      const { queueDeferred } = await import('./documents.js');
      for (let i = 0; i < files.length - 1; i++) { const uid = await queueDeferred(files[i]); bindDocumentFile(handles[i], uid); }
      const last = files.length - 1;
      if (await ctx.open(files[last])) bindDocumentFile(handles[last]);
    } else if (files[0]) {
      if (await ctx.open(files[0])) bindDocumentFile(handles[0]);
    }
    return true;
  } catch (e) { if (e.name !== 'AbortError') ctx.error('打开失败：' + e.message); return false; }
}

export function saveDocumentFile(mode = 'save') {
  if (pending) return pending;
  const inside = ctx.inside();
  if (mode === 'save' && inside) return ctx.saveInside();
  
  
  if (inside) mode = 'copy';
  const uid = ctx.uid();
  let handle = mode === 'save' ? documentFile(uid) : null;
  if (!handle && !globalThis.showSaveFilePicker) {
    ctx.error('此浏览器无法直接保存本机文件。请使用 Chrome / Edge；或通过“导出为”下载副本。');
    return Promise.resolve(false);
  }
  let choice;
  try {
    choice = handle ? (handle.requestPermission ? Promise.resolve(handle.requestPermission({ mode: 'readwrite' })).then(permission => {
      if (permission !== 'granted') throw new DOMException('未获得当前文件的写入权限', 'NotAllowedError');
      return handle;
    }) : Promise.resolve(handle)) : showSaveFilePicker({ suggestedName: ctx.name().replace(/\.[^.]+$/, '') + (ctx.original()&&new DataView(ctx.original()).getUint16(4)===2?'.psb':'.psd'), types });
  } catch (e) { ctx.error('保存失败：' + e.message); return Promise.resolve(false); }
  pending = (async () => {
    let writable, progress;
    try {
      handle = await choice;
      if (ctx.uid() !== uid) throw new Error('活动文档已改变，请重新保存');
      if (!await ctx.settle()) return false;
      if (ctx.uid() !== uid) throw new Error('活动文档已改变，请重新保存');
      progress = ctx.progress?.('save', 0, '正在生成保存文件…', true);
      let signature=ctx.signature();
      const { buf } = await ctx.build({ refreshWarpCaches: true,onSnapshot:()=>{signature=ctx.signature();}, abortSignal:progress?.signal, onProgress:(done,total)=>progress?.set?.(Math.min(90,Math.floor(done*90/Math.max(1,total))),'正在生成保存文件…') });
      if (progress?.signal?.aborted) throw progress.signal.reason;


      const length = buf?.byteLength ?? buf?.length ?? 0;
      const head = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf?.byteOffset || 0, Math.min(26, length));
      if (length < 26 || String.fromCharCode(...head.subarray(0, 4)) !== '8BPS' || ![1, 2].includes(new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(4)))
        throw new Error('生成的保存文件不是有效的 PSD/PSB');
      progress?.set(92, '正在写入原文件…');
      writable = await handle.createWritable();
      if (progress?.signal?.aborted) throw progress.signal.reason;
      await writable.write(buf);
      progress?.set(99, '正在完成写入…');
      await writable.close(); writable = null;
      progress?.set(100, '已保存');
      if (mode !== 'copy') {
        files.set(uid, handle);
        ctx.rename(handle.name, uid);
        ctx.markClean(uid, signature);
      }
      ctx.status(mode === 'copy' ? '已存储副本：' + handle.name : '已保存：' + handle.name);
      return true;
    } catch (e) {
      if (writable) { try { await writable.abort(); } catch {} }
      if (e.name !== 'AbortError') ctx.error('保存失败：' + e.message);
      return false;
    } finally { progress?.end?.(); pending = null; }
  })();
  return pending;
}

export function revertDocumentFile() {
  if (pending || ctx.inside()) return Promise.resolve(false);
  const uid = ctx.uid(), handle = documentFile(uid);
  pending = (async () => {
    try {
      const bytes = handle ? await (await handle.getFile()).arrayBuffer() : ctx.original()?.slice(0);
      if (!bytes) return false;
      if (ctx.uid() !== uid) throw new Error('活动文档已改变，请重新恢复');
      if (!await ctx.settle()) return false;
      if (ctx.uid() !== uid) throw new Error('活动文档已改变，请重新恢复');
      await ctx.reload(bytes, handle?.name || ctx.name());
      ctx.rename(handle?.name || ctx.name(), uid);
      ctx.markClean(uid, ctx.signature());
      ctx.status(handle ? '已恢复到文件最近存储的状态：' + handle.name : '已恢复到载入时的状态');
      return true;
    } catch (e) { ctx.error('恢复失败：' + e.message); return false; }
    finally { pending = null; }
  })();
  return pending;
}
