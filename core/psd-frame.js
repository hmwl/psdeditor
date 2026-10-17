
export const FRAME_TYPES = { rect: 1, ellipse: 3 };


export function frameInfoOf(model) {
  const desc = model?.desc || model;
  if (!desc || desc.__classID !== 'framedGroup') return null;
  const r = desc.framedGroupRect;
  if (!r || !['Top ', 'Left', 'Btom', 'Rght'].every(k => Number.isFinite(r[k]))) return null;
  const rect = { x: r.Left, y: r['Top '], w: r.Rght - r.Left, h: r.Btom - r['Top '] };
  if (!(rect.w > 0 && rect.h > 0)) return null;
  const type = desc.framedGroupType;
  return { rect, type, shape: type === 1 ? 'rect' : type === 3 ? 'ellipse' : 'custom',
    lockPPI: !!desc.LockPPI, preferredResolution: desc.PreferredResolution,
    savedIteratedName: desc.SavedIteratedName || '' };
}

export function frameDescriptor(rect, shape = 'rect', base = null) {
  const old = base?.desc || base;
  return { ...(old || { __name: '', __classID: 'framedGroup' }),
    framedGroupRect: { __name: '', __classID: 'classFloatRect',
      'Top ': rect.y, Left: rect.x, Btom: rect.y + rect.h, Rght: rect.x + rect.w,
      __doub: { 'Top ': true, Left: true, Btom: true, Rght: true } },
    framedGroupType: old?.framedGroupType ?? FRAME_TYPES[shape],
    LockPPI: old?.LockPPI ?? false, PreferredResolution: old?.PreferredResolution ?? 300,
    SavedIteratedName: old?.SavedIteratedName ?? '',
    __long: { ...old?.__long, framedGroupType: true },
    __doub: { ...old?.__doub, PreferredResolution: true },
  };
}


export function frameSubpaths(rect, shape = 'rect') {
  const { x, y, w, h } = rect;
  const knot = (anchor, incoming = anchor, outgoing = anchor, linked = false) => ({ anchor, in: incoming, out: outgoing, linked });
  if (shape === 'rect') return [{ closed: true, operation: 1, knots: [
    knot([x, y]), knot([x + w, y]), knot([x + w, y + h]), knot([x, y + h]),
  ] }];
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, k = 0.5522847498307936;
  return [{ closed: true, operation: 1, knots: [
    knot([cx, y], [cx - rx * k, y], [cx + rx * k, y], true),
    knot([x + w, cy], [x + w, cy - ry * k], [x + w, cy + ry * k], true),
    knot([cx, y + h], [cx + rx * k, y + h], [cx - rx * k, y + h], true),
    knot([x, cy], [x, cy + ry * k], [x, cy - ry * k], true),
  ] }];
}
