













import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePsdDocument } from '../core/psd-document.js';
import { parseTyShData } from '../core/psd-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'corpus/agpsd/text/point-text.psd');
const OUT = path.join(ROOT, 'core/text-template.js');

const b = fs.readFileSync(SRC);
const doc = parsePsdDocument(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const layer = doc.layers.find(l => (l.additionalBlocks || []).some(x => x.key === 'TySh'));
if (!layer) throw new Error('样本里没有文字图层');
const blk = layer.additionalBlocks.find(x => x.key === 'TySh');
const raw = new Uint8Array(blk._raw);


const parsed = parseTyShData(raw);
if (!parsed.text || parsed.text['Txt '] === undefined) throw new Error('模板 TySh 解析不出文字描述符');
const engine = parsed.text['EngineData'];
if (!engine || !engine.length) throw new Error('模板 TySh 里没有 EngineData');

const b64 = Buffer.from(raw).toString('base64');
const lines = b64.match(/.{1,100}/g).map(s => `  '${s}',`).join('\n');

fs.writeFileSync(OUT, `/*
 * core/text-template.js  —  新建文字图层用的 TySh 模板（**生成物，勿手改**）
 * ---------------------------------------------------------------------------
 * 由 tools/build-text-template.js 从 ${path.relative(ROOT, SRC)} 里那个文字图层
 * 原样摘出来的 TySh 块数据（${raw.length} 字节，Base64）。
 *
 * 为什么要模板：TySh 里的 EngineData 是 PS 文字引擎的私有文档格式（字体集、样式表、
 * 段落表、字形度量…），结构复杂、校验严格 —— 写错一个字段 PS 只回一句「程序错误」，
 * 没有可靠的办法从零合成。所以新建文字图层走的是「拿一份真的当骨架，只替换有明确出口的
 * 字段」这条路：文字内容与段落/样式 run 长度走 buildTyShFromText，字号/颜色/字体走
 * setEngineStyle / setEngineFont，位置走 textTransform 的 tx/ty。
 *
 * 这意味着一件要如实说明的事：**新建的文字层继承模板的字体**（${JSON.stringify(
   (() => { try { const t = parsed.text['Txtt']; return (t && t[0] && t[0]['TxtS'] && (t[0]['TxtS']['FntN'] || t[0]['TxtS'].fontPostScriptName)) || '未知'; } catch { return '未知'; } })())}）
 * 与它的一整套排版默认值；换字体请用字符面板（走 setEngineFont），那条路是有出口的。
 */

const B64 = [
${lines}
].join('');

/** 模板 TySh 块的原始字节（${raw.length} 字节）。 */
export function textTemplateBytes() {
  if (typeof atob === 'function') {
    const s = atob(B64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(B64, 'base64'));
}

/** 模板来源（可核对）。 */
export const TEXT_TEMPLATE_SOURCE = ${JSON.stringify(path.relative(ROOT, SRC))};
export const TEXT_TEMPLATE_BYTES = ${raw.length};

export default { textTemplateBytes, TEXT_TEMPLATE_SOURCE, TEXT_TEMPLATE_BYTES };
`, 'utf8');
console.log(`已生成 ${path.relative(ROOT, OUT)}：模板 ${raw.length} 字节，来源 ${path.relative(ROOT, SRC)}`);
