

















export const VAR_RESOURCE_ID = 4093;
export const TRAIT = { visibility: 'visibility', text: 'textcontent', pixel: 'fileref' };
const TRAIT_BACK = { visibility: 'visibility', textcontent: 'text', fileref: 'pixel' };


export function validVarName(n) { return /^[A-Za-z_À-￿][\w.\-À-￿]*$/.test(String(n || '')); }



export function parseDelimited(text, delim = 'auto') {
  text = String(text || '').replace(/^﻿/, '');
  if (delim === 'auto') {
    const first = text.split(/\r?\n/, 1)[0] || '';
    delim = (first.match(/\t/g) || []).length >= (first.match(/,/g) || []).length && first.includes('\t') ? '\t' : ',';
  }
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

export function decodeText(bytes, enc = 'auto') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dec = (e, fatal) => new TextDecoder(e, { fatal }).decode(u8);
  if (enc !== 'auto') return dec(enc, false);
  if (u8[0] === 0xff && u8[1] === 0xfe) return dec('utf-16le');
  if (u8[0] === 0xfe && u8[1] === 0xff) return dec('utf-16be');
  if (u8.length > 3 && u8[1] === 0 && u8[3] === 0) return dec('utf-16le');
  if (u8.length > 3 && u8[0] === 0 && u8[2] === 0) return dec('utf-16be');
  try { return dec('utf-8', true); } catch {}
  try { return dec('gb18030', false); } catch {}
  return dec('windows-1252', false);
}





export function rowsToDataSets(rows, vars, { firstColName = false } = {}) {
  if (!rows.length) return { dataSets: [], unknown: [] };
  const head = rows[0].map(s => s.trim());
  const cols = firstColName ? head.slice(1) : head;
  const known = new Map(vars.map(v => [v.name, v]));
  const unknown = cols.filter(n => n && !known.has(n));
  const dataSets = rows.slice(1).map((r, k) => {
    const cells = firstColName ? r.slice(1) : r;
    const values = {};
    cols.forEach((n, j) => {
      const v = known.get(n); if (!v) return;
      let val = cells[j] ?? '';
      if (v.type === 'visibility') val = /^(true|1|yes|y|是|显示|on)$/i.test(String(val).trim());
      values[n] = val;
    });
    return { name: (firstColName ? String(r[0] || '').trim() : '') || `数据组 ${k + 1}`, values };
  });
  return { dataSets, unknown };
}
export function dataSetsToDelimited(vars, dataSets, delim = ',') {
  const esc = s => { s = String(s ?? ''); return /[",\t\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [['数据组', ...vars.map(v => v.name)].map(esc).join(delim)];
  for (const d of dataSets) lines.push([d.name, ...vars.map(v => d.values[v.name] ?? '')].map(esc).join(delim));
  return lines.join('\r\n');
}


const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function varsToXml(vars, dataSets, idOf = () => null) {
  const L = [];
  L.push('<?xml version="1.0" encoding="utf-8"?>');
  L.push('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20001102//EN" "http://www.w3.org/TR/2000/CR-SVG-20001102/DTD/svg-20001102.dtd" [');
  L.push('\t<!ENTITY ns_vars "http://ns.adobe.com/Variables/1.0/">');
  L.push('\t<!ENTITY ns_imrep "http://ns.adobe.com/ImageReplacement/1.0/">');
  L.push('\t<!ENTITY ns_custom "http://ns.adobe.com/GenericCustomNamespace/1.0/">');
  L.push('\t<!ENTITY ns_flows "http://ns.adobe.com/Flows/1.0/">');
  L.push(']>');
  L.push('<svg>');
  L.push('<variableSets  xmlns="&ns_vars;">');
  L.push('\t<variableSet  locked="none" varSetName="binding1">');
  L.push('\t\t<variables>');
  for (const v of vars) {
    const cat = v.type === 'text' ? '&ns_flows;' : v.type === 'pixel' ? '&ns_imrep;' : '&ns_vars;';
    const id = idOf(v);
    L.push(`\t\t\t<variable  varName="${xmlEsc(v.name)}" trait="${TRAIT[v.type]}" category="${cat}"${id != null ? ` docRef="id('${id}')"` : ''}></variable>`);
  }
  L.push('\t\t</variables>');
  L.push('\t\t<v:sampleDataSets  xmlns:v="&ns_vars;" xmlns="&ns_custom;">');
  for (const d of dataSets) {
    L.push(`\t\t\t<v:sampleDataSet  dataSetName="${xmlEsc(d.name)}">`);
    for (const v of vars) {
      if (!(v.name in d.values)) continue;
      const val = d.values[v.name];
      if (v.type === 'text') L.push(`\t\t\t\t<${v.name}>\n\t\t\t\t\t<p>${xmlEsc(val)}</p>\n\t\t\t\t</${v.name}>`);
      else L.push(`\t\t\t\t<${v.name}>${xmlEsc(v.type === 'visibility' ? (val ? 'true' : 'false') : val)}</${v.name}>`);
    }
    L.push('\t\t\t</v:sampleDataSet>');
  }
  L.push('\t\t</v:sampleDataSets>');
  L.push('\t</variableSet>');
  L.push('</variableSets>');
  L.push('</svg>');
  return L.join('\n');
}

export function varsFromXml(xml) {
  if (typeof DOMParser === 'undefined' || !xml) return null;
  
  const ents = {}; String(xml).replace(/<!ENTITY\s+(\w+)\s+"([^"]*)">/g, (_, k, v) => { ents[k] = v; return ''; });
  const clean = String(xml).replace(/<!DOCTYPE[\s\S]*?\]>/, '').replace(/&(ns_\w+);/g, (_, k) => ents[k] || '');
  const dom = new DOMParser().parseFromString(clean, 'application/xml');
  if (dom.getElementsByTagName('parsererror').length) return null;
  const vars = [...dom.getElementsByTagName('variable')].map(el => {
    const ref = el.getAttribute('docRef') || '';
    const m = ref.match(/id\('?(\d+)'?\)/);
    return { name: el.getAttribute('varName') || '', type: TRAIT_BACK[el.getAttribute('trait')] || 'text', layerId: m ? +m[1] : null };
  }).filter(v => v.name);
  const dataSets = [...dom.getElementsByTagNameNS('*', 'sampleDataSet')].map((el, k) => {
    const values = {};
    for (const c of el.children) {
      const v = vars.find(x => x.name === c.localName); if (!v) continue;
      const t = v.type === 'text' ? [...c.getElementsByTagName('p')].map(p => p.textContent).join('\n') || c.textContent.trim() : c.textContent.trim();
      values[v.name] = v.type === 'visibility' ? /^true$/i.test(t) : t;
    }
    return { name: el.getAttribute('dataSetName') || `数据组 ${k + 1}`, values };
  });
  return { vars, dataSets };
}








export function placeImage(box, iw, ih, method = 'fit', align = 'c') {
  let w = iw, h = ih;
  if (method === 'fit' || method === 'fill') {
    const k = method === 'fit' ? Math.min(box.w / iw, box.h / ih) : Math.max(box.w / iw, box.h / ih);
    w = iw * k; h = ih * k;
  } else if (method === 'conform') { w = box.w; h = box.h; }
  const ax = /l$/.test(align) ? 0 : /r$/.test(align) ? 1 : 0.5;
  const ay = /^t/.test(align) ? 0 : /^b/.test(align) ? 1 : 0.5;
  return { x: box.x + (box.w - w) * ax, y: box.y + (box.h - h) * ay, w, h };
}
