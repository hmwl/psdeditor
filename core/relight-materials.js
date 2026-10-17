

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const ramp = (a, b, v) => { const t = clamp((v - a) / Math.max(1e-6, b - a)); return t * t * (3 - 2 * t); };
const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
function mean(src, w, h, radius) {
  const stride = w + 1, integral = new Float64Array(stride * (h + 1)), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1); out[y * w + x] = (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0)); }
  return out;
}
function soften(src, w, h, radius) { let out = src; for (let k = 0; k < 3; k++) out = mean(out, w, h, radius); return out; }
const valueAt = (values, w, h, x, y) => values[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; }
function fit(features, predicate, n, floors, minimum = 200) {
  const index = [], step = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += step) if (predicate(i)) index.push(i);
  if (index.length < minimum) return null;
  const centers = [], scales = [];
  for (let c = 0; c < 3; c++) { const values = index.map(i => features[c][i]), center = median(values); centers.push(center); scales.push(Math.max(floors[c], median(values.map(v => Math.abs(v - center))) * 1.4826)); }
  return { centers, scales, samples: index.length };
}
function affinity(features, prototype, i, lo, hi, lumaScale = 1, chromaScale = 1) {
  if (!prototype) return 0; let sum = 0;
  for (let c = 0; c < 3; c++) sum += ((features[c][i] - prototype.centers[c]) / (prototype.scales[c] * (c === 2 ? lumaScale : chromaScale))) ** 2;
  return 1 - ramp(lo, hi, Math.sqrt(sum));
}
function segmentMask(mask, landmarks, sequence, w, h, radius) {
  for (let k = 0; k < sequence.length - 1; k++) {
    const a = sequence[k] * 3, b = sequence[k + 1] * 3, ax = landmarks[a], ay = landmarks[a + 1], bx = landmarks[b], by = landmarks[b + 1], dx = bx - ax, dy = by - ay, length = Math.max(1e-8, dx * dx + dy * dy);
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - radius * 2)); y < Math.min(h, Math.ceil(Math.max(ay, by) + radius * 2)); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius * 2)); x < Math.min(w, Math.ceil(Math.max(ax, bx) + radius * 2)); x++) { const t = clamp(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / length), distance = Math.hypot(x + 0.5 - ax - dx * t, y + 0.5 - ay - dy * t); mask[y * w + x] = Math.max(mask[y * w + x], 1 - ramp(radius, radius * 2, distance)); }
  }
}

function polygonMask(mask, landmarks, sequence, w, h) {
  const points = sequence.map(i => [landmarks[i * 3], landmarks[i * 3 + 1]]), minX = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])))), maxX = Math.min(w - 1, Math.ceil(Math.max(...points.map(p => p[0])))), minY = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])))), maxY = Math.min(h - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i], b = points[j]; if ((a[1] > y + 0.5) !== (b[1] > y + 0.5) && x + 0.5 < (b[0] - a[0]) * (y + 0.5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } if (inside) mask[y * w + x] = 1; }
}


export function buildRelightMaterials(maps) {
  const w = maps.width, h = maps.height, n = w * h;
  if (!(w > 0 && h > 0 && maps.albedo?.length === n * 3)) throw new Error('重新打光：材质图尺寸不正确');
  const photo = maps.originalLinear || maps.albedo, regions = new Float32Array(n * 4), surface = new Float32Array(n * 4);
  const faces = (maps.faces || []).filter(face => face.landmarks?.length >= 468 * 3), extent = faces.reduce((v, face) => Math.max(v, face.box[2] - face.box[0], face.box[3] - face.box[1]), 0);
  const scatterPx = faces.length ? 0.02 * extent : 0.004 * Math.max(w, h), radius = Math.max(1, Math.round(0.004 * extent));
  const feature = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], materialLuma = new Float32Array(n), usable = new Uint8Array(n), facePrior = maps.faceMask || new Float32Array(n);
  const brow = new Float32Array(n), forehead = new Float32Array(n), tzone = new Float32Array(n), hairArea = new Float32Array(n), tightEyes = new Float32Array(n), hairSeeds = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const o = i * 3, detail = Math.exp(clamp(maps.detail?.[i] || 0, -1.5, 1.5) * 0.85), r = photo[o] + 0.001, g = photo[o + 1] + 0.001, b = photo[o + 2] + 0.001; materialLuma[i] = (maps.albedo[o] * 0.2126 + maps.albedo[o + 1] * 0.7152 + maps.albedo[o + 2] * 0.0722) * detail; feature[0][i] = Math.log(r / g); feature[1][i] = Math.log(g / b); feature[2][i] = Math.log(materialLuma[i] + 0.001); usable[i] = (maps.alpha?.[i] ?? 1) > 0.5 && (maps.farField?.[i] || 0) <= 0.5 ? 1 : 0; }
  for (const face of faces) {
    for (const sequence of [[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]]) polygonMask(tightEyes, face.landmarks, sequence, w, h);
    for (const sequence of [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]) segmentMask(brow, face.landmarks, sequence, w, h, Math.max(1, extent * 0.006));
    const [x0, y0, x1, y1] = face.box, bw = x1 - x0, bh = y1 - y0;
    for (let y = Math.max(0, Math.floor(y0 - 0.3 * bh)); y < Math.min(h, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) forehead[y * w + x] = 0.6;
    for (let y = Math.max(0, Math.floor(y0 - 0.6 * bh)); y < Math.min(h, y1 + 0.6 * bh); y++) for (let x = Math.max(0, Math.floor(x0 - 0.6 * bw)); x < Math.min(w, x1 + 0.6 * bw); x++) hairArea[y * w + x] = 1;
    const spots = [[151, 0.09, 0.85], [9, 0.07, 0.85], [168, 0.05, 1], [6, 0.05, 1], [197, 0.045, 1], [195, 0.045, 1], [4, 0.05, 1], [1, 0.045, 1], [152, 0.06, 0.55], [199, 0.06, 0.55]];
    for (const [point, fraction, weight] of spots) { const cx = face.landmarks[point * 3], cy = face.landmarks[point * 3 + 1], sigma = Math.max(1, fraction * Math.max(bw, bh)); for (let y = Math.max(0, Math.floor(cy - 3 * sigma)); y < Math.min(h, cy + 3 * sigma); y++) for (let x = Math.max(0, Math.floor(cx - 3 * sigma)); x < Math.min(w, cx + 3 * sigma); x++) tzone[y * w + x] = Math.max(tzone[y * w + x], weight * Math.exp(-((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (2 * sigma * sigma))); }
  }
  const eyeBlur = mean(tightEyes, w, h, 1), eyeMask = Float32Array.from(tightEyes, (v, i) => v ? eyeBlur[i] : 0);
  const skinFit = faces.length ? fit(feature, i => usable[i] && facePrior[i] > 0.9 && brow[i] < 0.05 && eyeBlur[i] < 0.05 && !(maps.lipsMask?.[i] > 0), n, [0.035, 0.035, 0.4]) : null;
  const faceDepths = []; for (let i = 0; i < n; i += 7) if (facePrior[i] > 0.9) faceDepths.push(maps.depth[i]);
  const faceDepth = median(faceDepths) || maps.scene?.referenceDepth || 1, maxSkinDepth = Math.min(1.8, 0.5 * (1 + (maps.scene?.far || faceDepth * 2) / faceDepth));
  const skinAffinity = new Float32Array(n), rawSkin = new Float32Array(n), rawSheen = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!usable[i]) continue;
    if (skinFit) { const prior = Math.max(facePrior[i], forehead[i]), bright = prior > 0 && feature[2][i] > skinFit.centers[2]; skinAffinity[i] = affinity(feature, skinFit, i, 2.2, 4, bright ? 1000 : facePrior[i] > 0 ? 1 + 0.3 * facePrior[i] : 1.5, bright ? 1 + 1.5 * prior : 1); }
    else { const o = i * 3, r = maps.albedo[o], g = maps.albedo[o + 1], b = maps.albedo[o + 2], warm = (r - b) / Math.max(r, 0.0001); skinAffinity[i] = r >= g && g >= b ? ramp(0.12, 0.3, warm) * (1 - ramp(0.8, 0.95, warm)) * ramp(0.015, 0.05, r) : 0; }
  }
  const propagated = soften(skinAffinity, w, h, radius);
  for (let i = 0; i < n; i++) { if (!usable[i]) continue; const depth = maps.depth[i] / faceDepth, depthGate = ramp(0.6, 0.7, depth) * (1 - ramp(maxSkinDepth, maxSkinDepth + 0.15, depth)), lip = maps.lipsMask?.[i] || 0; rawSkin[i] = (skinFit ? Math.max(facePrior[i], depthGate) : 1) * (1 - brow[i]) * (1 - eyeBlur[i]) * Math.max(propagated[i], lip * facePrior[i]); rawSheen[i] = skinFit ? rawSkin[i] : 0; }

  if (skinFit) for (const face of faces) { const [x0,y0,x1,y1] = face.box, bw = x1-x0, bh=y1-y0; for(let y=Math.max(0,Math.floor(y0-0.4*bh));y<Math.min(h,Math.ceil(y0-0.02*bh));y++) for(let x=Math.max(0,Math.floor(x0+0.2*bw));x<Math.min(w,Math.ceil(x0+0.8*bw));x++){const i=y*w+x;if(usable[i]&&feature[2][i]<skinFit.centers[2]-0.5)hairSeeds[i]=1;} }
  const hairFit = skinFit ? fit(feature, i => hairSeeds[i], n, [0.06,0.06,0.35],30) : null;
  const hair = new Float32Array(n), gxx = new Float32Array(n), gyy = new Float32Array(n), gxy = new Float32Array(n), photoLog = Float32Array.from({length:n},(_,i)=>Math.log(photo[i*3]*0.2126+photo[i*3+1]*0.7152+photo[i*3+2]*0.0722+0.001)), candidate=new Float32Array(n);
  for (let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;candidate[i]=usable[i]&&hairArea[i]?affinity(feature,hairFit,i,2.2,3.6):0;const dx=valueAt(photoLog,w,h,x+1,y)-valueAt(photoLog,w,h,x-1,y),dy=valueAt(photoLog,w,h,x,y+1)-valueAt(photoLog,w,h,x,y-1);gxx[i]=dx*dx;gyy[i]=dy*dy;gxy[i]=dx*dy;}
  const tensorRadius=Math.max(1,Math.round(0.02*(extent||Math.max(w,h)))),xx=mean(gxx,w,h,tensorRadius),yy=mean(gyy,w,h,tensorRadius),xy=mean(gxy,w,h,tensorRadius), visited=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0;
  for(let i=0;i<n;i++)if(hairSeeds[i]&&candidate[i]>0.3){visited[i]=1;queue[tail++]=i;}
  while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const qx=x+dx,qy=y+dy;if(qx<0||qy<0||qx>=w||qy>=h)continue;const j=qy*w+qx;if(!visited[j]&&candidate[j]>0.3){visited[j]=1;queue[tail++]=j;}}}
  const skinEnergies=[];for(let i=0;i<n;i+=Math.max(1,Math.floor(n/200000)))if(facePrior[i]>0.9&&brow[i]<0.05&&eyeBlur[i]<0.05)skinEnergies.push(xx[i]+yy[i]);const referenceEnergy=Math.max(1e-6,median(skinEnergies));
  for(let i=0;i<n;i++){if(!visited[i])continue;const relativeDepth=maps.depth[i]/faceDepth,depthGate=ramp(0.7,0.8,relativeDepth)*(1-ramp(1.35,1.55,relativeDepth)),dark=skinFit?1-ramp(skinFit.centers[2]-0.5,skinFit.centers[2]-0.05,feature[2][i]):0,energy=xx[i]+yy[i],coherence=Math.hypot(xx[i]-yy[i],2*xy[i])/Math.max(energy,1e-8);hair[i]=candidate[i]*depthGate*dark*ramp(1.5,4,energy/referenceEnergy)*ramp(0.1,0.4,coherence)*(1-rawSkin[i]);}
  const skin = soften(rawSkin, w, h, Math.max(2, Math.round(scatterPx * 0.5))), sheen = soften(rawSheen, w, h, Math.max(2, Math.round(scatterPx * 0.5))), smoothNormals = [];
  for (let c = 0; c < 3; c++) smoothNormals.push(mean(Float32Array.from({ length: n }, (_, i) => maps.normals[i * 3 + c]), w, h, Math.max(1, Math.round(scatterPx))));
  const eyes = [];
  for (const face of faces) for (const iris of face.irises || []) if (iris.r >= 2.5 && [iris.x, iris.y, iris.r].every(Number.isFinite)) { const x = clamp(iris.x, 0, w - 1), y = clamp(iris.y, 0, h - 1); eyes.push({ x, y, r: iris.r, z: maps.depth[Math.floor(y) * w + Math.floor(x)] }); }
  eyes.sort((a, b) => b.r - a.r); eyes.length = Math.min(4, eyes.length);
  let skinPixels = 0;
  const gradientStep = Math.max(1, Math.round(scatterPx / 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, lip = maps.lipsMask?.[i] || 0, eye = usable[i] ? clamp(eyeMask[i]) : 0, ownSkin = usable[i] && eye < 0.5 ? clamp(skin[i]) : 0;
    regions.set([ownSkin, clamp(hair[i]), usable[i] && eye < 0.5 ? clamp(sheen[i]) : 0, eye], i * 4); if (ownSkin > 0.5) skinPixels++;
    const roughness = (0.5 + (0.36 - 0.5) * tzone[i]) * (1 - lip) + 0.3 * lip, angle = 0.5 * Math.atan2(2 * xy[i], xx[i] - yy[i]) + Math.PI * 0.5;
    let curvature = 0; for (let c = 0; c < 3; c++) { const dx = valueAt(smoothNormals[c], w, h, x + gradientStep, y) - valueAt(smoothNormals[c], w, h, x - gradientStep, y), dy = valueAt(smoothNormals[c], w, h, x, y + gradientStep) - valueAt(smoothNormals[c], w, h, x, y - gradientStep); curvature += dx * dx + dy * dy; }
    let eyeId = 0, best = Infinity; if (eye > 0.01) for (let e = 0; e < eyes.length; e++) { const d = Math.hypot(x - eyes[e].x, y - eyes[e].y) / eyes[e].r; if (d < best) { best = d; eyeId = e + 1; } }
    surface.set([roughness, angle, Math.min(0.9, scatterPx * Math.sqrt(0.5 * curvature) / gradientStep), eyeId], i * 4);
  }
  return { regions, surface, eyes, scatterPx: skin.some(v => v > 0.01) ? scatterPx : 0, skinPixels, tightEyeMask: eyeMask, source: faces.length ? 'face-mad-log-chroma-depth-and-structure' : 'image-colour-and-structure', prototype: skinFit, lightSpace: 'linear' };
}
export const RELIGHT_SKIN_PROFILE = Object.freeze({ share: Object.freeze([0.85, 0.6, 0.4]), radius: Object.freeze([1, 0.5, 0.25]), wrap: Object.freeze([1, 0.5, 0.25]), f0: 0.028 });
export const decodeMaterialByte = value => linear(clamp(value / 255));
