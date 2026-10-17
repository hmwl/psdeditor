










import express from 'express';
import { addUserFonts, listUserFonts, deleteUserFont, userFontUsage, fontOwnerOf, LIMITS } from './user-fonts.js';
import { forgetUserFont } from './text-render.js';
import { failJson } from './http-error.js';

function ownerOr403(req) {
  const o = fontOwnerOf(req.principal);
  if (!o) { const e = new Error('字体库只对 API key 开放；编辑器会话请在 /api/doc/edit 的 multipart 里直接带 font 字段（单次有效）'); e.status = 403; throw e; }
  return o;
}

export function fontsRouter({ upload }) {
  const r = express.Router();
  const fields = upload.fields([{ name: 'font', maxCount: LIMITS.perRequest }]);

  r.get('/', (req, res) => {
    try { const o = ownerOr403(req); res.json({ fonts: listUserFonts(o), usage: userFontUsage(o) }); }
    catch (e) { failJson(res, e, { tag: 'fonts' }); }
  });

  r.post('/', (req, res) => {
    let o;
    try { o = ownerOr403(req); } catch (e) { return failJson(res, e, { tag: 'fonts' }); }
    fields(req, res, err => {
      if (err) return failJson(res, err, { tag: 'fonts' });
      try {
        const files = req.files?.font || [];
        if (!files.length) { const e = new Error('没有收到字体文件：multipart 字段名用 font'); e.status = 400; throw e; }
        const added = [], skipped = [], errors = [];
        for (const f of files) {
          try { const x = addUserFonts(o, f.buffer, f.originalname, { faces: req.body?.faces }); added.push(...x.added); skipped.push(...x.skipped); }
          catch (e) {
            if (files.length === 1 || e.status === 413) throw e;
            errors.push({ file: f.originalname, error: e.message });
          }
        }
        for (const s of skipped) if (/替换/.test(s.reason || '')) forgetUserFont(s.id);
        res.status(added.length ? 201 : 200).json({ added, skipped, ...(errors.length ? { errors } : {}), usage: userFontUsage(o) });
      } catch (e) { failJson(res, e, { tag: 'fonts' }); }
    });
  });

  r.delete('/:id', (req, res) => {
    try {
      const o = ownerOr403(req);
      const m = deleteUserFont(o, String(req.params.id));
      forgetUserFont(m.id);
      res.json({ deleted: m, usage: userFontUsage(o) });
    } catch (e) { failJson(res, e, { tag: 'fonts' }); }
  });

  return r;
}
