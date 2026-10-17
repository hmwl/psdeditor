

import { parsePsdDocument, serializePsdDocument } from './psd-document.js';
import { resourceHandler } from './psd-resources.js';
import { writeImageResource } from './psd-write.js';
import { writeAdditionalBlock } from './psd-additional.js';

export function readToolMetadata(buffer) {
  const d = parsePsdDocument(buffer);
  const resource = id => d.imageResources.find(r => r.id === id);
  const sampler = resource(1073) || resource(1038), count = resource(1080);
  const anno = d.globalAdditional.find(b => b.key === 'Anno');
  return {
    samplers: sampler?.data || { version: 3, samplers: [] }, samplerId: sampler?.id || 1073,
    annotations: anno?.model || { major: 2, minor: 1, annotations: [] },
    counts: count?.data || { descriptorVersion: 16, descriptor: { __classID: 'Cnt ', __name: '', Vrsn: 1, __long: { Vrsn: true }, countGroupList: [] } },
    samplerReadOnly: !!sampler && (!Array.isArray(sampler.data?.samplers) || ![1,2,3].includes(sampler.data.version)
      || sampler.data.samplers.some(p=>!p || !Number.isFinite(p.horizontal) || !Number.isFinite(p.vertical))),
    noteReadOnly: !!anno && (!Array.isArray(anno.model?.annotations) || anno.model.major!==2 || anno.model.minor!==1),
    countReadOnly: !!count && (!Array.isArray(count.data?.descriptor?.countGroupList) || count.data.descriptor.Vrsn!==1
      || count.data.descriptor.countGroupList.some(g => !g || !Array.isArray(g.countObjectList)
        || g.countObjectList.some(p => !p || !Number.isFinite(p['X   ']) || !Number.isFinite(p['Y   '])))),
    dirty: {},
  };
}
export function newCountGroup(name = '计数组 1') {
  return { __name: '', __classID: 'countGroup', 'Rd  ': 255, 'Grn ': 170, 'Bl  ': 0,
    'Nm  ': name, 'Rds ': 3, fontSize: 13, __long: { 'Rds ': true, fontSize: true }, Vsbl: true, countObjectList: [] };
}
export function newCountPoint(x, y) { return { __name: '', __classID: 'countObject', 'X   ': x, 'Y   ': y }; }
export function newNote(x, y, text) {
  return { type: 'txtA', dataType: 'txtC', text, _textEnc: { bom: true, le: false }, author: '', name: '', modDate: '',
    iconLocation: { left: x, top: y, right: x + 20, bottom: y + 20 },
    popupLocation: { left: x, top: y, right: x + 240, bottom: y + 160 },
    color: { space: 0, components: [65535, 56000, 0, 0] } };
}



export function mapToolMetadata(state, map) {
  if (!state) return { state, skipped: [] };
  const out = structuredClone(state), skipped = [];
  const update = (kind, readOnly, list, fn) => {
    if (readOnly) { skipped.push(kind); return; }
    if (!list?.length) return;
    for (const p of list) fn(p);
    out.dirty[kind] = true;
  };
  update('samplers', out.samplerReadOnly, out.samplers.samplers, p => {
    [p.horizontal, p.vertical] = map([p.horizontal, p.vertical]);
  });
  update('counts', out.countReadOnly, out.counts.descriptor?.countGroupList, g => {
    for (const p of g.countObjectList) [p['X   '], p['Y   ']] = map([p['X   '], p['Y   ']]);
  });
  update('annotations', out.noteReadOnly, out.annotations.annotations, p => {
    for (const key of ['iconLocation', 'popupLocation']) {
      const r = p[key]; if (!r) continue;
      const [x, y] = map([r.left, r.top]), w = r.right-r.left, h = r.bottom-r.top;
      Object.assign(r, { left: Math.round(x), top: Math.round(y), right: Math.round(x+w), bottom: Math.round(y+h) });
    }
  });
  return { state: out, skipped };
}
export function writeToolMetadata(buffer, state) {
  let out = buffer;
  if (state.dirty.samplers) {
    if (state.samplerReadOnly) throw new Error('颜色取样器资源无法可靠解析');
    out = writeImageResource(out, state.samplerId, resourceHandler(state.samplerId).write(state.samplers));
  }
  if (state.dirty.counts) {
    if (state.countReadOnly) throw new Error('计数资源无法可靠解析');
    out = writeImageResource(out, 1080, resourceHandler(1080).write(state.counts));
  }
  if (state.dirty.annotations) {
    if (state.noteReadOnly) throw new Error('注释块无法可靠解析');
    for (const note of state.annotations.annotations) if(!note._body) for(const field of ['author','name','modDate']) {
      const text=note[field]?.s || '';
      if(text.length>255 || /[^\u0000-\u00ff]/.test(text))throw new Error('注释作者/名称字段超出 PSD 单字节编码范围');
    }
    const d = parsePsdDocument(out);
    const bytes = writeAdditionalBlock('Anno', state.annotations);
    let b = d.globalAdditional.find(b => b.key === 'Anno');
    if (!b) { b = { key: 'Anno', sig: '8BIM', length: 0 }; d.globalAdditional.push(b); }
    b.model = null; b._raw = bytes;
    out = serializePsdDocument(d);
  }
  return out;
}
