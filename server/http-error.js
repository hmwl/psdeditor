















const DEV = () => process.env.PSD_EDITOR_DEV === '1';


function limitMessage(e) {
  switch (e?.code) {
    case 'LIMIT_FILE_SIZE':
      return `上传的文件超过本服务的上限（MAX_UPLOAD_MB=${process.env.MAX_UPLOAD_MB || 200} MB）`;
    case 'LIMIT_FILE_COUNT': return '上传的文件个数超过本服务的上限';
    case 'LIMIT_PART_COUNT': return '上传的表单分段数超过本服务的上限';
    case 'LIMIT_FIELD_KEY': return '表单字段名过长';
    case 'LIMIT_FIELD_VALUE': return '表单字段值过长';
    case 'LIMIT_FIELD_COUNT': return '表单字段数超过本服务的上限';
    case 'LIMIT_UNEXPECTED_FILE': return `不认识的上传字段名${e.field ? `（${e.field}）` : ''}`;
    default: return null;
  }
}


function bodyMessage(e) {
  switch (e?.type) {
    case 'entity.too.large': return '请求体超过本接口的上限';
    case 'entity.parse.failed': return '请求体不是合法 JSON';
    case 'entity.verify.failed': return '请求体校验失败';
    case 'encoding.unsupported': return '不支持的请求体编码';
    case 'request.aborted': return '请求被中断';
    case 'request.size.invalid': return '请求体长度与 Content-Length 不符';
    case 'parameters.too.many': return '请求参数过多';
    default: return null;
  }
}

export function httpStatusOf(e, defaultStatus = 400) {
  const s = e?.status || e?.statusCode;
  if (Number.isInteger(s) && s >= 400 && s <= 599) return s;
  if (e?.code === 'LIMIT_UNEXPECTED_FILE') return 400;
  if (typeof e?.code === 'string' && e.code.startsWith('LIMIT_')) return 413;
  if (e?.type === 'entity.too.large') return 413;
  if (typeof e?.type === 'string' && e.type.startsWith('entity.')) return 400;
  return defaultStatus;
}


export function httpMessageOf(e, status) {
  return limitMessage(e) || bodyMessage(e)
    || (status >= 500 ? '服务端内部错误（详情见服务端日志）' : (e?.message || String(e)));
}









export function failJson(res, e, { defaultStatus = 400, tag = 'api', extraKeys = [] } = {}) {
  if (res.headersSent) { try { res.end(); } catch { } return; }
  const status = httpStatusOf(e, defaultStatus);
  const body = { error: httpMessageOf(e, status) };
  
  if (status < 500) for (const k of extraKeys) if (e && e[k] !== undefined) body[k] = e[k];
  if (status >= 500) console.error(`[${tag}]`, e);
  else console.error(`[${tag}] ${status} ${body.error}`);
  res.status(status).json({ ...body, ...(DEV() ? { stack: e?.stack } : {}) });
}

export default { httpStatusOf, httpMessageOf, failJson };
