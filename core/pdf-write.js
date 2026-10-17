















const enc = new TextEncoder();
const num = v => { const r = Math.round(v * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };

function pdfString(s) {
  s = String(s || '');
  if (/^[\x20-\x7e]*$/.test(s)) return '(' + s.replace(/[\\()]/g, m => '\\' + m) + ')';
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return '<' + hex + '>';
}

export function writePdf(pages, opts = {}) {
  const chunks = [], offsets = [];
  let len = 0;
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const objs = [];                         
  const alloc = () => { objs.push(null); return objs.length; };
  const catalog = alloc(), pagesId = alloc(), info = alloc();
  const pageIds = [];
  const plan = pages.map(pg => {
    const pid = alloc(), cid = alloc();
    const imgs = (pg.images || []).map(im => ({ ...im, id: alloc(), sid: im.smask ? alloc() : 0 }));
    pageIds.push(pid);
    return { pg, pid, cid, imgs };
  });
  put('%PDF-1.4\n'); put(new Uint8Array([37, 0xE2, 0xE3, 0xCF, 0xD3, 10]));   
  const begin = id => { offsets[id] = len; put(`${id} 0 obj\n`); };
  const end = () => put('\nendobj\n');
  begin(catalog); put(`<< /Type /Catalog /Pages ${pagesId} 0 R${opts.fullScreen ? ' /PageMode /FullScreen' : ''} >>`); end();
  begin(pagesId); put(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] >>`); end();
  begin(info); put(`<< /Producer (PSD Editor) /Title ${pdfString(opts.title || '')}${opts.author ? ' /Author ' + pdfString(opts.author) : ''} >>`); end();
  for (const { pg, pid, cid, imgs } of plan) {
    const W = pg.width, H = pg.height;
    const xo = imgs.map((im, k) => `/Im${k} ${im.id} 0 R`).join(' ');
    begin(pid);
    const extra = (pg.duration > 0 ? ` /Dur ${num(pg.duration)}` : '') + (pg.transition ? ` /Trans << /Type /Trans /S /${String(pg.transition).replace(/[^A-Za-z]/g, '')} /D 1 >>` : '');
    put(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /XObject << ${xo} >> >> /Contents ${cid} 0 R${extra} >>`);
    end();
    let content = '';
    if (pg.background) content += `${pg.background.map(v => num(v / 255)).join(' ')} rg 0 0 ${num(W)} ${num(H)} re f\n`;
    imgs.forEach((im, k) => { content += `q ${num(im.w)} 0 0 ${num(im.h)} ${num(im.x)} ${num(H - im.y - im.h)} cm /Im${k} Do Q\n`; });
    const cb = enc.encode(content);
    begin(cid); put(`<< /Length ${cb.length} >>\nstream\n`); put(cb); put('\nendstream'); end();
    for (const im of imgs) {
      begin(im.id);
      if (im.flate) {
        put(`<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${im.sid ? ` /SMask ${im.sid} 0 R` : ''} /Length ${im.flate.length} >>\nstream\n`);
        put(im.flate); put('\nendstream'); end();
        if (im.sid) { begin(im.sid); put(`<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.smask.length} >>\nstream\n`); put(im.smask); put('\nendstream'); end(); }
        continue;
      }
      put(`<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
      put(im.jpeg); put('\nendstream'); end();
    }
  }
  const xref = len, n = objs.length + 1;
  let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  put(x);
  put(`trailer\n<< /Size ${n} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
