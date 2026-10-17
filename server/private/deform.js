




















import { FILTER_IDS } from '../../core/index.js';


function descNum(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }




export function findDeformFilters(descriptor) {
  const fx = descriptor && descriptor['filterFX'];
  const list = fx && fx['filterFXList'];
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((f, at) => {
    const id = f && f.filterID;
    const Fltr = f && f.Fltr;
    if (!Fltr) return;
    const on = f.enab !== false && fx.enab !== false;
    if (id === FILTER_IDS.perspectiveWarp || Fltr.__classID === 'perspectiveWarpTransform')
      out.push({ at, kind: 'perspectiveWarp', filterID: FILTER_IDS.perspectiveWarp,
                 name: f['Nm  '] || '透视变形', enabled: on, Fltr });
    else if (id === FILTER_IDS.puppetWarp || Fltr.__classID === 'rigidTransform')
      out.push({ at, kind: 'puppetWarp', filterID: FILTER_IDS.puppetWarp,
                 name: f['Nm  '] || '操控变形', enabled: on, Fltr });
  });
  return out;
}


export function findDeformFilter(descriptor) { return findDeformFilters(descriptor)[0] || null; }

