
export const puppetPinKey = p => `${p.j}:${p.i}`;
export const puppetPinMode = p => p?.rotationMode === 'fixed' ? 'fixed' : 'auto';
export function puppetSelect(selection, ref, shift, preserve = false) {
  const key = puppetPinKey(ref), found = selection.some(p => puppetPinKey(p) === key);
  if (shift) return found ? selection.filter(p => puppetPinKey(p) !== key) : [...selection, { ...ref }];
  return preserve && found ? selection : [{ ...ref }];
}
export function movePuppetSelection(deform, base, refs, anchor, to) {
  const start = base.shapes[anchor.j]?.pins[anchor.i]?.pos;
  if (!start) return [];
  const dx = to.x - start.x, dy = to.y - start.y, changed = new Set();
  for (const { j, i } of refs) {
    const pin = deform.shapes[j]?.pins[i], before = base.shapes[j]?.pins[i];
    if (!pin || !before) continue;
    pin.pos = { x: before.pos.x + dx, y: before.pos.y + dy }; changed.add(j);
  }
  return [...changed];
}
export function rotatePuppetSelection(deform, base, refs, degrees) {
  const changed = new Set();
  for (const { j, i } of refs) {
    const pin = deform.shapes[j]?.pins[i], before = base.shapes[j]?.pins[i];
    if (!pin || !before) continue;
    pin.rotationMode = 'fixed';
    pin.rot = (Number(before.rot) || 0) - degrees;
    changed.add(j);
  }
  return [...changed];
}
export function puppetAngleDelta(center, from, to) {
  let delta = Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta * 180 / Math.PI;
}

export function setPuppetPinRotation(pin, mode, angle) {
  pin.rotationMode = mode === 'fixed' ? 'fixed' : 'auto';
  if (pin.rotationMode === 'fixed') pin.rot = Number.isFinite(Number(angle)) ? Number(angle) : 0;
  return pin;
}

export const puppetModeFromRigidity = value => ({ 1: 'rigid', 2: 'similarity', 3: 'affine' })[value] || null;
export const puppetRigidityFromMode = mode => ({ rigid: 1, similarity: 2, affine: 3 })[mode] || 2;
