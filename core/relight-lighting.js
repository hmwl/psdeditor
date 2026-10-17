


import { buildRelightRenderState, relightSampleRotation } from './relight.js';
import { buildRelightMaterials } from './relight-materials.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function relightPassQuality(w, h, params = {}) {
  const quality = params.quality || (Math.max(w, h) <= 512 ? 'idle' : 'final');
  const preset = quality === 'drag' ? { shadowScale: 0.25, areaSamples: 2, shadowSteps: 12, spillSamples: 24 } : quality === 'final' ?
    { shadowScale: 1, areaSamples: 16, shadowSteps: 64, spillSamples: 64 } : { shadowScale: 0.5, areaSamples: 6, shadowSteps: 32, spillSamples: 48 };
  const integer = (value, fallback, lo, hi) => clamp(Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback, lo, hi);
  return { ...preset, areaSamples: integer(params.areaSamples ?? preset.areaSamples, preset.areaSamples, 1, 16), shadowSteps: integer(params.shadowSteps ?? preset.shadowSteps, preset.shadowSteps, 4, 64),
    spillSamples: integer(params.spillSamples ?? preset.spillSamples, preset.spillSamples, 1, 64) };
}

export function relightPenumbraSigma(radius, scale, width, height, shadowScale, blocker = -1) {
  const base = 0.03 * Math.max(width, height) * Math.sqrt(clamp(radius / Math.max(0.8 * scale, 1e-6), 0, 1)) * shadowScale;
  return base * (blocker < 0 ? 1 : clamp(1 + blocker / 0.5, 1, 1.6));
}


export function diffuseRelightIrradiance(rgb, depth, w, h, radius, channelScale = [1, 0.5, 0.25], validity = null) {
  if (rgb.length !== w * h * 3 || depth.length !== w * h) throw new Error('重新打光：扩散图尺寸不正确');
  let current = new Float32Array(rgb);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const out = new Float32Array(rgb.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (validity && validity[i] <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const sigma = Math.max(0.2, radius * channelScale[c]), step = Math.max(1, Math.ceil(radius * 2.5 / 12)), taps = Math.min(12, Math.ceil(radius * 2.5 / step));
        let sum = 0, weight = 0;
        for (let k = -taps; k <= taps; k++) {
          const xx = clamp(x + dx * k * step, 0, w - 1), yy = clamp(y + dy * k * step, 0, h - 1), j = yy * w + xx;
          if (validity && validity[j] <= 0) continue;
          const a = Math.exp(-0.5 * (k * step / sigma) ** 2) * Math.exp(-Math.abs(depth[j] - depth[i]) / Math.max(0.05 * depth[i], 1e-6));
          sum += current[j * 3 + c] * a; weight += a;
        }
        out[i * 3 + c] = sum / Math.max(weight, 1e-6);
      }
    }
    current = out;
  }
  return current;
}


export function blurRelightShadows(shadow, depth, normals, w, h, sigma) {
  if (shadow.length !== w * h * 4 || depth.length !== w * h || normals.length !== w * h * 3) throw new Error('重新打光：阴影图尺寸不正确');
  let current = new Float32Array(shadow);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const out = new Float32Array(shadow.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, sigmas = Array.isArray(sigma) ? sigma : [sigma, sigma, sigma], max = Math.max(...sigmas), step = Math.max(1, Math.ceil(max * 1.6 * 2.5 / 10)), taps = Math.min(10, Math.ceil(max * 1.6 * 2.5 / step));
      let blocker = current[i * 4 + 3];
      for (let k = -taps; k <= taps; k++) { const j = clamp(y + dy * k * step, 0, h - 1) * w + clamp(x + dx * k * step, 0, w - 1); if (Math.abs(depth[j] - depth[i]) < depth[i] * 0.03) blocker = Math.max(blocker, current[j * 4 + 3]); }
      const factor = blocker < 0 ? 1 : clamp(1 + blocker / 0.5, 1, 1.6);
      const sums = [0, 0, 0], weights = [0, 0, 0];
      for (let k = -taps; k <= taps; k++) {
        const xx = clamp(x + dx * k * step, 0, w - 1), yy = clamp(y + dy * k * step, 0, h - 1), j = yy * w + xx;
        let dot = 0; for (let c = 0; c < 3; c++) dot += normals[i * 3 + c] * normals[j * 3 + c];
        const guide = Math.exp(-Math.abs(depth[j] - depth[i]) / Math.max(0.02 * depth[i], 1e-6)) * Math.max(0.02, Math.max(0, dot) ** 4);
        for (let c = 0; c < 3; c++) { const weight = Math.exp(-0.5 * (k * step) ** 2 / Math.max((sigmas[c] * factor) ** 2, 0.04)) * guide; sums[c] += current[j * 4 + c] * weight; weights[c] += weight; }
      }
      for (let c = 0; c < 3; c++) out[i * 4 + c] = sums[c] / Math.max(weights[c], 1e-6);
      out[i * 4 + 3] = blocker;
    }
    current = out;
  }
  return current;
}
const smooth = (a, b, x) => { const t = clamp((x - a) / Math.max(b - a, 1e-9), 0, 1); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => a.map((v, c) => v + b[c]), sub = (a, b) => a.map((v, c) => v - b[c]), mul = (a, n) => a.map(v => v * n);
const unit = (v, fallback = [0, 0, -1]) => { const d = Math.hypot(...v); return d < 1e-9 ? [...fallback] : mul(v, 1 / d); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const decode = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const encode = v => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
function sample(a, w, h, x, y, channels, channel = 0) {
  const xx = clamp(x, 0, w - 1), yy = clamp(y, 0, h - 1), x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = xx - x0, ty = yy - y0;
  const v = a[(y0 * w + x0) * channels + channel], b = a[(y0 * w + x1) * channels + channel], c = a[(y1 * w + x0) * channels + channel], d = a[(y1 * w + x1) * channels + channel];
  return (v + (b - v) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
const vector = (a, w, h, x, y, channels = 3) => [0, 1, 2].map(c => sample(a, w, h, x, y, channels, c));
const pointAt = (pixel, z, camera) => [(pixel[0] - camera.cx) / camera.fx * z, (pixel[1] - camera.cy) / camera.fy * z, z];
const project = (p, camera) => [p[0] / Math.max(p[2], 1e-6) * camera.fx + camera.cx, p[1] / Math.max(p[2], 1e-6) * camera.fy + camera.cy];
function emitter(light, p, k, count, phase) { if (count < 2) return light.position; const axis = unit(sub(light.position, p)), up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], tangent = unit(cross(up, axis)), bitangent = cross(axis, tangent), angle = k * 2.39996323 + phase, radius = light.radius * Math.sqrt((k + 0.5) / count); return light.position.map((v, c) => v + radius * (tangent[c] * Math.cos(angle) + bitangent[c] * Math.sin(angle))); }
function trace(maps, state, p, normal, lamp, edge, steps, contact = false) {
  if (!maps.depthRaw || !steps) return [1, -1];
  const origin = add(p, mul(normal, 0.002 * p[2])), minimum = state.scene.near * 0.05; let end = lamp;
  if (end[2] < minimum) { if (origin[2] <= minimum) return [1, -1]; const t = (origin[2] - minimum) / (origin[2] - end[2]); end = add(origin, mul(sub(end, origin), t)); }
  const from = project(origin, state.camera), to = project(end, state.camera), span = Math.hypot(to[0] - from[0], to[1] - from[1]); if (span < 1.5) return [1, -1];
  const begin = Math.min((contact ? 1.5 : 6 - 4 * clamp(edge, 0, 1)) / span, 0.5), half = Math.abs(end[2] - origin[2]) / steps * 0.5, thickness = (contact ? 0.025 : 0.35) * state.scene.scale; let occlusion = 0, blocker = -1;
  for (let k = 0; k < steps; k++) { const t = begin + (1 - begin) * (k + 0.5) / steps, q = add(origin, mul(sub(end, origin), t)), px = project(q, state.camera); if (px[0] < 0 || px[1] < 0 || px[0] >= maps.width || px[1] >= maps.height) break;
    const z = sample(maps.depth, maps.width, maps.height, px[0] - 0.5, px[1] - 0.5, 1), confidence = maps.edgeConfidence ? sample(maps.edgeConfidence, maps.width, maps.height, px[0] - 0.5, px[1] - 0.5, 1) : 1, opacity = maps.alpha ? sample(maps.alpha, maps.width, maps.height, px[0] - 0.5, px[1] - 0.5, 1) : 1, dz = q[2] - z, foot = 0.006 * q[2], bias = foot + 2 * half; let amount = 0;
    if (dz > bias && dz < thickness) amount = smooth(bias, bias + 0.03 * q[2], dz); else if (p[2] - z > 0.2 * state.scene.scale && dz + half > foot && dz - half < thickness) amount = smooth(foot, foot + 0.03 * q[2], Math.min(dz + half, thickness));
    amount *= (0.15 + 0.85 * clamp(confidence, 0, 1)) * opacity * (contact ? (1 - t) ** 2 : 1); if (amount > occlusion) { occlusion = amount; blocker = t / Math.max(1 - t, 0.05); } if (occlusion > 0.98) break;
  } return occlusion <= 0.02 ? [1, -1] : [1 - occlusion, blocker];
}
function contactVisibility(maps, state, p, normal, light) { const delta = sub(light.position, p), distance = Math.hypot(...delta), direction = unit(delta); if (dot(normal, direction) <= 0) return 1; const extent = Math.min(0.015 * Math.max(maps.width, maps.height) * p[2] / state.camera.fx, distance * 0.9), raw = trace(maps, state, p, normal, add(p, mul(direction, extent)), 1, 8, true)[0]; return 1 - (1 - raw) * 0.92 * (1 - 0.3 * state.originalGain) * (1 - 0.75 * smooth(0.05, 0.6, light.radius / Math.max(distance, 1e-6))); }
function lightingSample(maps, state, material, pixel) {
  const x = pixel[0] - 0.5, y = pixel[1] - 0.5, depth = sample(maps.depth, maps.width, maps.height, x, y, 1), point = pointAt(pixel, depth, state.camera), normal = unit(vector(maps.normals, maps.width, maps.height, x, y));
  const region = Array.from({ length: 4 }, (_, c) => sample(material.regions, maps.width, maps.height, x, y, 4, c)), surface = Array.from({ length: 4 }, (_, c) => sample(material.surface, maps.width, maps.height, x, y, 4, c));
  return { x, y, depth, point, normal, region, surface, ao: maps.ao ? sample(maps.ao, maps.width, maps.height, x, y, 1) : 1, backdrop: maps.backdropGate ? sample(maps.backdropGate, maps.width, maps.height, x, y, 1) : smooth(1.3, 2.4, depth / state.scene.referenceDepth) };
}
function incident(state, surface, light, k, count, phase) { const position = emitter(light, surface.point, k, count, phase), delta = sub(position, surface.point), d2 = Math.max(1e-8, dot(delta, delta)), distance = Math.sqrt(d2), direction = mul(delta, 1 / distance), back = clamp(dot(direction, unit(surface.point, [0, 0, 1])), 0, 1), baseWrap = (0.3 + 2.5 * light.radius / distance) * (1 - back), wrap = [1, 0.5, 0.25].map(v => Math.min(0.9, baseWrap + v * surface.region[0] * Math.max(surface.surface[2], 0.25))), angular = wrap.map(v => clamp((dot(surface.normal, direction) + v) / (1 + v), 0, 1) ** ((1 + v) * (1 + 2 * back))), aim = sub([0, 0, state.scene.referenceDepth], light.position), emission = 1 + (Math.max(0, dot(unit(aim, [0, 0, 1]), unit(sub(surface.point, position), [0, 0, 1]))) ** 4 - 1) * smooth(0, 1, dot(aim, aim) / (0.25 * state.referenceDistance2)), attenuation = (1 - 0.75 * surface.backdrop) * state.referenceDistance2 / Math.max(d2 + light.radius ** 2 * 0.5, state.referenceDistance2 * 0.01) * emission; return { position, direction, distance, attenuation, angular }; }
function passSample(pass, pw, ph, maps, pixel, channel = 0) { return sample(pass, pw, ph, pixel[0] / maps.width * pw - 0.5, pixel[1] / maps.height * ph - 0.5, 4, channel); }
function guidedShadow(pass, sw, sh, maps, pixel, surface) {
  const rx = sw / maps.width, ry = sh / maps.height, fx = pixel[0] * rx - 2, fy = pixel[1] * ry - 2, bx = Math.floor(fx), by = Math.floor(fy), tx = fx - bx, ty = fy - by, out = [0, 0, 0, 0]; let total = 0;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const qx = clamp(bx + x, 0, sw - 1), qy = clamp(by + y, 0, sh - 1), px = (qx + 0.5) / rx - 0.5, py = (qy + 0.5) / ry - 0.5, z = sample(maps.depth, maps.width, maps.height, px, py, 1), n = vector(maps.normals, maps.width, maps.height, px, py), wx = x === 0 ? 1 - tx : x === 4 ? tx : 1, wy = y === 0 ? 1 - ty : y === 4 ? ty : 1, weight = wx * wy * Math.exp(-Math.abs(z - surface.depth) / Math.max(0.02 * surface.depth, 1e-6)) * Math.max(Math.max(dot(n, surface.normal), 0) ** 8, 0.02) + 1e-6; for (let c = 0; c < 4; c++) out[c] += pass[(qy * sw + qx) * 4 + c] * weight; total += weight; }
  return out.map(v => v / Math.max(total, 1e-6));
}

export function prepareRelightLightingPasses(rgba, w, h, maps, params = {}) {
  const state = buildRelightRenderState(rgba, w, h, maps, params), quality = relightPassQuality(w, h, params), material = maps.materials || buildRelightMaterials(maps);
  const sw = Math.max(1, Math.ceil(maps.width * quality.shadowScale)), sh = Math.max(1, Math.ceil(maps.height * quality.shadowScale)), bw = Math.max(1, Math.ceil(maps.width / 4)), bh = Math.max(1, Math.ceil(maps.height / 4)), raw = new Float32Array(sw * sh * 4), depths = new Float32Array(sw * sh), normals = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = y * sw + x, pixel = [(x + 0.5) * maps.width / sw, (y + 0.5) * maps.height / sh], surface = lightingSample(maps, state, material, pixel); depths[i] = surface.depth; normals.set(surface.normal, i * 3); raw.set([1, 1, 1, -1], i * 4);
    if (maps.alpha && sample(maps.alpha, maps.width, maps.height, surface.x, surface.y, 1) <= 0) continue;
    for (let li = 0; li < state.lights.length; li++) { const light = state.lights[li]; if (dot(surface.normal, sub(light.position, surface.point)) < -light.radius) continue; const count = light.radius <= state.scene.scale * 0.004 ? 1 : quality.areaSamples; let sum = 0, gap = 0, blocked = 0;
      const confidence = maps.edgeConfidence ? sample(maps.edgeConfidence, maps.width, maps.height, surface.x, surface.y, 1) : 1;
      for (let k = 0; k < count; k++) { const value = trace(maps, state, surface.point, surface.normal, emitter(light, surface.point, k, count, relightSampleRotation(x, y)), confidence, quality.shadowSteps); sum += value[0]; if (value[1] >= 0) { gap += value[1] * (1 - value[0]); blocked += 1 - value[0]; } }
      raw[i * 4 + li] = 1 - (1 - sum / count) * 0.92 * (1 - 0.3 * state.originalGain); if (blocked) raw[i * 4 + 3] = Math.max(raw[i * 4 + 3], gap / blocked);
    }
  }
  const sigmas = Array.from({ length: 3 }, (_, i) => i < state.lights.length ? relightPenumbraSigma(state.lights[i].radius, state.scene.scale, maps.width, maps.height, sw / maps.width) : 0), shadow = blurRelightShadows(raw, depths, normals, sw, sh, sigmas), irradiation = new Float32Array(sw * sh * 3), validity = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = y * sw + x, pixel = [(x + 0.5) * maps.width / sw, (y + 0.5) * maps.height / sh], surface = lightingSample(maps, state, material, pixel), phase = relightSampleRotation(...pixel);
    if ((maps.alpha && sample(maps.alpha, maps.width, maps.height, surface.x, surface.y, 1) <= 0) || (maps.farField && sample(maps.farField, maps.width, maps.height, surface.x, surface.y, 1) > 0.5)) continue;
    validity[i] = 1;
    for (let li = 0; li < state.lights.length; li++) { const light = state.lights[li], centerDistance = Math.hypot(...sub(light.position, surface.point)), ao = 1 + (surface.ao - 1) * 0.6 * (0.35 + 0.65 * smooth(0.05, 0.6, light.radius / centerDistance));
      for (let k = 0; k < quality.areaSamples; k++) { const incoming = incident(state, surface, light, k, quality.areaSamples, phase); for (let c = 0; c < 3; c++) irradiation[i * 3 + c] += light.radiance[c] * incoming.angular[c] * incoming.attenuation / quality.areaSamples * 0.55 * ao * shadow[i * 4 + li]; }
    }
  }
  const scattered = diffuseRelightIrradiance(irradiation, depths, sw, sh, material.scatterPx * sw / maps.width, [1, 0.5, 0.25], validity), irradiance = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) { irradiance.set(scattered.subarray(i * 3, i * 3 + 3), i * 4); irradiance[i * 4 + 3] = validity[i]; }
  const levels = [], sourceRadiance = new Float32Array(bw * bh * 4);
  for (let y=0;y<bh;y++)for(let x=0;x<bw;x++){const i=y*bw+x,pixel=[(x+0.5)*maps.width/bw,(y+0.5)*maps.height/bh],surface=lightingSample(maps,state,material,pixel),far=maps.farField?sample(maps.farField,maps.width,maps.height,surface.x,surface.y,1):0;
    if((maps.alpha&&sample(maps.alpha,maps.width,maps.height,surface.x,surface.y,1)<=0)||far>0.5)continue;const irradiance=[0,0,0];
    for(let li=0;li<state.lights.length;li++){const light=state.lights[li],delta=sub(light.position,surface.point),d2=Math.max(dot(delta,delta),1e-8),ld=unit(delta),back=clamp(dot(ld,unit(surface.point,[0,0,1])),0,1),wrap=0.3*(1-back),response=clamp((dot(surface.normal,ld)+wrap)/(1+wrap),0,1)**((1+wrap)*(1+2*back)),aim=sub([0,0,state.scene.referenceDepth],light.position),emission=1+(Math.max(dot(unit(aim,[0,0,1]),mul(ld,-1)),0)**4-1)*smooth(0,1,dot(aim,aim)/(0.25*state.referenceDistance2)),attenuation=(1-0.75*surface.backdrop)*state.referenceDistance2/Math.max(d2+light.radius**2*0.5,state.referenceDistance2*0.01)*emission,visible=passSample(shadow,sw,sh,maps,pixel,li);for(let c=0;c<3;c++)irradiance[c]+=light.radiance[c]*response*attenuation*visible*0.55;}
    for(let c=0;c<3;c++)sourceRadiance[i*4+c]=sample(maps.albedo,maps.width,maps.height,surface.x,surface.y,3,c)*irradiance[c]*(1-far);sourceRadiance[i*4+3]=1;
  }
  levels.push({width:bw,height:bh,data:sourceRadiance});
  while(levels.at(-1).width>1||levels.at(-1).height>1){const previous=levels.at(-1),width=Math.max(1,previous.width>>1),height=Math.max(1,previous.height>>1),data=new Float32Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++){let value=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const px=Math.min(previous.width-1,x*2+dx),py=Math.min(previous.height-1,y*2+dy);value+=previous.data[(py*previous.width+px)*4+c];}data[(y*width+x)*4+c]=value*0.25;}levels.push({width,height,data});}
  const bounce=new Float32Array(bw*bh*4),radius=0.3*Math.max(bw,bh),sampleArea=Math.PI*radius*radius/quality.spillSamples,lod=clamp(Math.log2(Math.max(Math.sqrt(sampleArea),1)),0,levels.length-1),low=Math.floor(lod),high=Math.min(low+1,levels.length-1);
  const radiance=(pixel,c)=>{const a=levels[low],b=levels[high],v=passSample(a.data,a.width,a.height,maps,pixel,c),u=passSample(b.data,b.width,b.height,maps,pixel,c);return v+(u-v)*(lod-low);};
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const i=y*bw+x,pixel=[(x+0.5)*maps.width/bw,(y+0.5)*maps.height/bh],surface=lightingSample(maps,state,material,pixel);
    for(let k=0;k<quality.spillSamples;k++){const angle=k*2.39996323,r=radius*Math.sqrt((k+0.5)/quality.spillSamples),q=[pixel[0]+Math.cos(angle)*r*maps.width/bw,pixel[1]+Math.sin(angle)*r*maps.height/bh];if(q[0]<0||q[1]<0||q[0]>=maps.width||q[1]>=maps.height)continue;const alpha=radiance(q,3);if(alpha<=0.001)continue;const donor=lightingSample(maps,state,material,q),delta=sub(donor.point,surface.point),d2=Math.max(dot(delta,delta),1e-6),direction=unit(delta),worldPixel=donor.depth*(maps.width/bw)/state.camera.fx,area=sampleArea*worldPixel*worldPixel,weight=Math.max(dot(surface.normal,direction),0)*Math.max(-dot(donor.normal,direction),0)*area/(Math.PI*d2+area);for(let c=0;c<3;c++)bounce[i*4+c]+=radiance(q,c)/alpha*weight;
    }bounce[i*4+3]=1;
  }
  return { state, material, quality, sw, sh, bw, bh, shadow, irradiance, bounce };
}
function ggx(normal, light, view, radius, distance, likelihood, skinRough = 0, detail = 0) {
  const nl = dot(normal, light); if (nl <= 0) return 0;
  const half = unit(add(light, view), [0, 0, 0]), nv = Math.max(dot(normal, view), 0.001), nh = Math.max(dot(normal, half), 0), vh = Math.max(dot(view, half), 0), widen = radius / (3 * Math.max(distance, 1e-6));
  if (skinRough) { const a1 = skinRough ** 2 * 0.5625, a2 = skinRough ** 2 * 1.69, e1 = clamp(a1 + widen, 0.01, 1), e2 = clamp(a2 + widen, 0.01, 1), distribution = 0.85 * a1 ** 2 / (Math.PI * (nh * nh * (e1 * e1 - 1) + 1) ** 2) + 0.15 * a2 ** 2 / (Math.PI * (nh * nh * (e2 * e2 - 1) + 1) ** 2), masking = 0.5 / Math.max(nl * Math.sqrt(nv * nv * (1 - e1) + e1) + nv * Math.sqrt(nl * nl * (1 - e1) + e1), 1e-5); return Math.min(6, distribution * masking * nl * (0.028 + 0.972 * (1 - vh) ** 5)) * clamp(1 + 0.4 * detail, 0.2, 1.6); }
  const rough = 0.55 - 0.25 * likelihood, alpha = clamp(rough * rough + widen, 0.01, 1), a2 = alpha * alpha, distribution = a2 / (Math.PI * (nh * nh * (a2 - 1) + 1) ** 2), masking = 0.5 / Math.max(nl * Math.sqrt(nv * nv * (1 - a2) + a2) + nv * Math.sqrt(nl * nl * (1 - a2) + a2), 1e-5);
  return Math.min(6, distribution * masking * (0.04 + 0.96 * (1 - vh) ** 5) * nl * rough ** 4 / a2) * 0.6 * (0.4 + 0.6 * likelihood);
}
function hairResponse(normal, light, view, angle, radius, distance, detail, albedo) {
  const t0 = [Math.cos(angle), Math.sin(angle), 0], tangent = unit(sub(t0, mul(normal, dot(t0, normal))), [0, 1, 0]), half = unit(add(light, view), [0, 0, 0]), jitter = clamp(detail, -0.3, 0.3) * 0.4;
  const t1 = unit(add(tangent, mul(normal, 0.05 + jitter)), tangent), t2 = unit(sub(tangent, mul(normal, 0.075 - jitter)), tangent), exponent = 140 + (16 - 140) * clamp(radius / Math.max(distance, 1e-6), 0, 1), a = Math.max(0, 1 - dot(t1, half) ** 2) ** (exponent * 0.5), b = Math.max(0, 1 - dot(t2, half) ** 2) ** (exponent * 0.175), weight = 0.025 * smooth(-0.1, 0.4, dot(normal, light)) * clamp(1 + 6 * detail, 0, 2);
  return albedo.map(value => (a + value * 1.5 * b) * weight);
}
function eyeResponse(pixel, open, albedo, visibility, state, material) {
  const sum = [0, 0, 0]; if (open <= 0) return sum;
  for (const eye of material.eyes) { const offset = [pixel[0] - eye.x, pixel[1] - eye.y], rr = Math.hypot(...offset); if (rr >= eye.r) continue; const rc = 1.35 * eye.r, uv = offset.map(v => v / Math.max(rc, 0.001)), normal = [uv[0], uv[1], -Math.sqrt(Math.max(0, 1 - uv[0] ** 2 - uv[1] ** 2))], p = pointAt([eye.x, eye.y], eye.z, state.camera), view = unit(mul(p, -1)), incident = mul(view, -1), reflected = sub(incident, mul(normal, 2 * dot(incident, normal))), rim = 1 - smooth(eye.r - 1, eye.r, rr);
    for (let li = 0; li < state.lights.length; li++) { const light = state.lights[li], delta = sub(light.position, p), distance = Math.max(Math.hypot(...delta), 1e-6), direction = mul(delta, 1 / distance), sinA = clamp(light.radius / distance, 0, 0.9), aperture = Math.max(Math.asin(sinA), 2.4 / Math.max(rc, 0.001)), edge = 2 / Math.max(rc, 0.001), angle = Math.acos(clamp(dot(reflected, direction), -1, 1)), disk = 1 - smooth(aperture - edge * 0.5, aperture + edge * 0.5, angle), f = 0.025 + 0.975 * (1 - Math.max(dot(normal, view), 0)) ** 5, attenuation = state.referenceDistance2 / Math.max(distance ** 2 + light.radius ** 2 * 0.5, state.referenceDistance2 * 0.01), emission = smooth(0, 1, Math.max(dot(direction, view), 0));
      for (let c = 0; c < 3; c++) sum[c] += light.radiance[c] * disk * Math.min(f / (Math.PI * Math.max(sinA * sinA, 0.004)), 3) * attenuation * emission * 1.5 * visibility[li] * rim;
      const lateral = Math.hypot(direction[0], direction[1]); if (rr > 0.5 && lateral > 0.001) { const far = Math.max((offset[0] * -direction[0] + offset[1] * -direction[1]) / rr / lateral, 0) * smooth(0.25, 0.85, rr / eye.r), front = clamp(dot(direction, view) * 1.5 + 0.3, 0, 1); for (let c = 0; c < 3; c++) sum[c] += albedo[c] * light.radiance[c] * far ** 2 * front * attenuation * 0.35 * visibility[li] * rim; }
    }
  } return mul(sum, open);
}



export function renderRelightLighting(rgba, w, h, maps, params = {}) {
  const initial = buildRelightRenderState(rgba, w, h, maps, params), out = new Uint8ClampedArray(rgba); if (initial.identity) return out;
  const pass = prepareRelightLightingPasses(rgba, w, h, maps, params), { state, material, quality, sw, sh, bw, bh } = pass;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4; if (!rgba[o + 3]) continue;
    const pixel = [(x + 0.5) * maps.width / w, (y + 0.5) * maps.height / h], surface = lightingSample(maps, state, material, pixel), view = unit(mul(surface.point, -1)), pUnit = unit(surface.point, [0, 0, 1]), detail = maps.detail ? sample(maps.detail, maps.width, maps.height, surface.x, surface.y, 1) : 0;
    const albedo = vector(maps.albedo, maps.width, maps.height, surface.x, surface.y).map(value => Math.max(0, value) * Math.exp(clamp(detail, -1.5, 1.5) * 0.85)), specular = maps.specularLikelihood ? sample(maps.specularLikelihood, maps.width, maps.height, surface.x, surface.y, 1) : 0, phase = relightSampleRotation(...pixel), irradiance = [0, 0, 0], added = [0, 0, 0], visibility = [], soft = guidedShadow(pass.shadow, sw, sh, maps, pixel, surface);
    for (let li = 0; li < state.lights.length; li++) { const light = state.lights[li], diffuse = [0, 0, 0], hair = [0, 0, 0]; let reflection = 0, attenuationSum = 0;
      visibility[li] = Math.min(soft[li], contactVisibility(maps, state, surface.point, surface.normal, light));
      for (let k = 0; k < quality.areaSamples; k++) { const incoming = incident(state, surface, light, k, quality.areaSamples, phase); for (let c = 0; c < 3; c++) diffuse[c] += incoming.angular[c] * incoming.attenuation;
        const basic = ggx(surface.normal, incoming.direction, view, light.radius, incoming.distance, specular), skin = ggx(surface.normal, incoming.direction, view, light.radius, incoming.distance, specular, surface.surface[0], detail); reflection += (basic + (skin - basic) * clamp(surface.region[2], 0, 1)) * incoming.attenuation;
        attenuationSum += incoming.attenuation;
      }
      const delta = sub(light.position, surface.point), distance = Math.max(Math.hypot(...delta), 1e-6), direction = mul(delta, 1 / distance), ao = 1 + (surface.ao - 1) * 0.6 * (0.35 + 0.65 * smooth(0.05, 0.6, light.radius / distance)), nv = clamp(dot(surface.normal, view), 0.001, 1), lateral = Math.hypot(direction[0], direction[1]), side = clamp((surface.normal[0] * direction[0] + surface.normal[1] * direction[1]) / Math.max(lateral, 0.001) * 2, 0, 1), rim = 14 * (1 - nv) ** 4 * clamp(-dot(direction, view) + 0.2, 0, 1) * side * attenuationSum / quality.areaSamples;
      const hairValue = hairResponse(surface.normal, direction, view, surface.surface[1], light.radius, distance, detail, albedo), aim = sub([0, 0, state.scene.referenceDepth], light.position), emission = 1 + (Math.max(dot(unit(aim, [0, 0, 1]), mul(direction, -1)), 0) ** 4 - 1) * smooth(0, 1, dot(aim, aim) / (0.25 * state.referenceDistance2)), attenuation = state.referenceDistance2 / Math.max(distance ** 2 + light.radius ** 2 * 0.5, state.referenceDistance2 * 0.01) * emission * (1 - 0.75 * surface.backdrop), confidence = maps.edgeConfidence ? sample(maps.edgeConfidence, maps.width, maps.height, surface.x, surface.y, 1) : 1;
      for (let c = 0; c < 3; c++) hair[c] = hairValue[c] * surface.region[1] * clamp(confidence, 0, 1) * attenuation * quality.areaSamples;
      for (let c = 0; c < 3; c++) { irradiance[c] += light.radiance[c] * diffuse[c] / quality.areaSamples * 0.55 * ao * visibility[li]; added[c] += light.radiance[c] * (reflection / quality.areaSamples * (0.5 + 0.5 * ao) + hair[c] / quality.areaSamples + albedo[c] * rim) * visibility[li]; }
    }
    const eye = eyeResponse(pixel, surface.region[3], albedo, visibility, state, material), far = maps.farField ? sample(maps.farField, maps.width, maps.height, surface.x, surface.y, 1) : 0;
    for (let c = 0; c < 3; c++) { const share = [0.85, 0.6, 0.4][c] * clamp(surface.region[0], 0, 1), scattered = passSample(pass.irradiance, sw, sh, maps, pixel, c) / Math.max(passSample(pass.irradiance, sw, sh, maps, pixel, 3), 1e-6); added[c] += albedo[c] * (irradiance[c] * (1 - share) + scattered * share) + albedo[c] * passSample(pass.bounce, bw, bh, maps, pixel, c) * 3 * surface.ao + eye[c]; added[c] *= 1 - clamp(far, 0, 1); }
    const original = [0, 1, 2].map(c => decode(rgba[o + c] / 255)), base = mul(original, state.originalGain), largest = Math.max(...irradiance), addedLum = dot(added, [0.2126, 0.7152, 0.0722]), dominance = largest > 1e-6 ? 0.5 * addedLum / (addedLum + dot(base, [0.2126, 0.7152, 0.0722]) + 1e-5) : 0;
    for (let c = 0; c < 3; c++) { const tinted = base[c] * (1 - dominance + (largest > 1e-6 ? irradiance[c] / largest * dominance : 0)), headroom = Math.max(0, 1 - tinted), amount = Math.max(0, added[c]) / Math.max(headroom, 1e-6), shoulder = amount <= 0.6 ? amount : 0.6 + 0.4 * ((amount - 0.6) / 0.4) / (1 + (amount - 0.6) / 0.4), lit = tinted + (headroom <= 1e-6 ? 0 : headroom * shoulder), value = original[c] + (lit - original[c]) * state.blend; if (Number.isFinite(value)) out[o + c] = Math.round(clamp(encode(Math.max(0, value)), 0, 1) * 255); }
  }
  return out;
}
