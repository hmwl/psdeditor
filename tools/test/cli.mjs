

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'bin', 'psd_editor.js'), FX = path.join(ROOT, 'tools/test/fixtures/formats');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'fpsd-cli-'));
const env = { ...process.env, PSD_EDITOR_SERVER: '' };
function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env, cwd: T, maxBuffer: 64 << 20 });
  let j = null; try { j = JSON.parse(r.stdout); } catch {  }
  return { code: r.status, j, out: r.stdout, err: r.stderr };
}
let n = 0;
const ok = (c, m, extra) => { assert.ok(c, m + (extra ? '\n' + JSON.stringify(extra).slice(0, 1500) : '')); n++; console.log('✓', m); };

let r = cli('capabilities', '--query', 'mask');
ok(r.code === 0 && r.j.ok && r.j.ops.some(o => o.op === 'addLayerMask'), 'capabilities --query', r);
r = cli('capabilities', '--section', 'filters');
ok(r.j.ok && r.j.items.some(f => f.kind === 'gaussianBlur'), 'capabilities --section filters', r.j);
r = cli('describe', 'applyFilter');
ok(r.j.ok && r.j.fields.some(f => f.name === 'filter') && r.j.example, 'describe', r.j);
ok(cli('describe', '没有这个').code === 1, 'describe 未知 op 失败');

const doc = path.join(T, 'a.psd');
r = cli('new', '--width', '320', '--height', '200', '--background', 'white', '--out', doc);
ok(r.j.ok && r.j.width === 320 && r.j.layers.length === 1 && r.j.revision, 'new', r.j);
const rev0 = r.j.revision;

fs.copyFileSync(path.join(FX, 'base.png'), path.join(T, 'logo.png'));
fs.writeFileSync(path.join(T, 'steps.json'), JSON.stringify([
  { op: 'createLayer', name: 'Logo', as: 'logo' },
  { op: 'replaceLayerPixels', index: { $ref: 'logo.index' }, image: '@logo.png', bounds: { top: 20, left: 30, bottom: 81, right: 127 } },
  { op: 'setLayerProps', index: { $ref: 'logo.index' }, opacity: 200, blendKey: 'mul ' },
  { op: 'addTextLayer', text: '标题', x: 40, y: 150, fontSize: 24, color: '#c03020', as: 't' },
  { op: 'applyFilter', index: 0, filter: 'gaussianBlur', params: { radius: 2 } },
]));
r = cli('batch', doc, '--input', 'steps.json', '--revision', rev0);
ok(r.code === 0 && r.j.ok && r.j.results.length === 5 && r.j.previousRevision === rev0 && r.j.revision !== rev0, 'batch：$ref + @图片 + 文字 + 服务端滤镜（本机）', r);
const rev1 = r.j.revision;
r = cli('inspect', doc);
ok(r.j.ok && r.j.revision === rev1 && r.j.layers.length === 3 && r.j.layers[1].name === 'Logo' && r.j.layers[1].opacity === 200 && r.j.layers[1].blend === 'mul ' && r.j.layers[2].kind === 'text', 'inspect 看到改动', r.j);

r = cli('execute', doc, '--op', 'setOpacity', '--params', '{"index":1,"opacity":10}', '--revision', rev0);
ok(r.code === 3 && r.j.error.code === 'REVISION_CONFLICT' && r.j.error.current === rev1, 'revision 冲突 → 退出码 3、不写文件', r);
ok(cli('inspect', doc).j.revision === rev1, '冲突时文件没被改');
r = cli('execute', doc, '--op', 'setOpacity', '--params', '{"index":99,"opacity":10}', '--out', path.join(T, 'x.psd'));
ok(r.code === 1 && !r.j.ok && !fs.existsSync(path.join(T, 'x.psd')), '坏参数失败且不落盘', r.j);
r = cli('execute', doc, '--op', 'renameLayer', '--params', '{"index":1,"name":"标志"}', '--dry-run');
ok(r.j.ok && r.j.dryRun && cli('inspect', doc).j.layers[1].name === 'Logo', '--dry-run 不写文件', r.j);

r = cli('render', doc, '--out', path.join(T, 'p.png'), '--max', '160');
ok(r.j.ok && r.j.width === 160 && r.j.height === 100 && fs.readFileSync(path.join(T, 'p.png')).subarray(1, 4).toString() === 'PNG', 'render --max', r.j);
r = cli('render', doc, '--out', path.join(T, 'only.png'), '--layers', '1');
ok(r.j.ok && r.j.width === 320, 'render --layers', r.j);

for (const ext of ['tga', 'bmp', 'pam', 'exr', 'hdr', 'psd']) {
  r = cli('convert', path.join(FX, 'base.png'), path.join(T, 'c.' + ext));
  ok(r.j.ok && r.j.width === 97 && fs.statSync(path.join(T, 'c.' + ext)).size > 100, 'convert png → ' + ext, r.j);
}
r = cli('convert', path.join(T, 'c.psd'), path.join(T, 'back.png'));
ok(r.j.ok, 'convert psd → png', r.j);
r = cli('convert', path.join(T, 'c.tga'), path.join(T, 'back2.png'));
{
  const { decodePNG } = await import(path.join(ROOT, 'core/formats/png.js'));
  const zlib = await import('node:zlib'), inflate = x => new Uint8Array(zlib.inflateSync(Buffer.from(x)));
  const A = decodePNG(fs.readFileSync(path.join(T, 'back.png')), { inflate }).rgba, B = decodePNG(fs.readFileSync(path.join(T, 'back2.png')), { inflate }).rgba;
  let d = 0; for (let i = 0; i < A.length; i += 4) if (A[i + 3] !== B[i + 3] || (A[i + 3] && (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]))) d++;
  ok(A.length === B.length && d === 0, 'psd / tga 往返像素一致（全透明处的 RGB 不计）', { d });
}

fs.writeFileSync(path.join(T, 'drop.json'), JSON.stringify([{ op: 'setOpacity', index: 0, opacity: 128 }]));
r = cli('droplet', 'create', '--input', 'drop.json', '--name', '半透明', '--format', 'png', '--dir', T);
ok(r.j.ok && r.j.files.length === 2 && fs.statSync(r.j.files[0]).mode & 0o100, 'droplet create', r.j);
if (process.platform !== 'win32') {
  fs.copyFileSync(path.join(FX, 'base.png'), path.join(T, 'in.png'));
  const d = spawnSync('bash', [r.j.files[0], path.join(T, 'in.png')], { encoding: 'utf8', env: { ...env, PATH: path.dirname(process.execPath) + ':' + process.env.PATH } });
  ok(d.status === 0 && fs.existsSync(path.join(T, '半透明', 'in.png')), '运行 droplet', d.stderr);
}

const mcp = spawn(process.execPath, [CLI, 'mcp'], { env, cwd: T });
let buf = '';
const replies = new Map();
mcp.stdout.on('data', d => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 1); try { const m = JSON.parse(line); replies.set(m.id, m); } catch {  } } });
const send = m => mcp.stdin.write(JSON.stringify(m) + '\n');
const wait = async id => { for (let i = 0; i < 300 && !replies.has(id); i++) await new Promise(res => setTimeout(res, 50)); return replies.get(id); };
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'inspect', arguments: { path: doc } } });
send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'render', arguments: { path: doc, out: path.join(T, 'm.png'), max: 64 } } });
send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'batch', arguments: { path: doc, steps: [{ op: 'setVisible', index: 1, visible: false }], revision: 'nope' } } });
const [m1, m2, m3, m4, m5] = [await wait(1), await wait(2), await wait(3), await wait(4), await wait(5)];
mcp.stdin.end();
ok(m1 && m1.result.serverInfo.name === 'psd_editor-local', 'mcp initialize', m1);
ok(m2 && m2.result.tools.some(t => t.name === 'batch'), 'mcp tools/list', m2);
ok(m3 && JSON.parse(m3.result.content[0].text).layers.length === 3, 'mcp inspect', m3);
ok(m4 && m4.result.content[1] && m4.result.content[1].type === 'image', 'mcp render 附图', m4 && m4.result.content.map(c => c.type));
ok(m5 && m5.result.isError && /REVISION_CONFLICT/.test(m5.result.content[0].text), 'mcp batch revision 冲突', m5);

fs.rmSync(T, { recursive: true, force: true });
console.log(`cli ✓ ${n} 项`);
