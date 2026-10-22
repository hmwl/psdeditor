import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toFoxpsdLayerInfo } from '../../server/private/smart-object.js';
const base={layerName:'fixture',bounds:{left:0,top:0,right:100,bottom:50},originalSize:{width:100,height:50},warp:null};
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/rotation-transform.json',import.meta.url)));
for(const c of fixture.cases){const so={...base,transformQuad:c.transformQuad,nonAffineTransform:c.nonAffineTransform,...(c.warp?{warp:{parameters:{style:'warpCustom'},bounds:{left:0,top:0,right:100,bottom:50}}}: {})};const info=toFoxpsdLayerInfo(so);assert.ok(Math.abs(info.placementRotation-c.expectedRotation)<1e-5,c.name);}
console.log('✓ affine rotation, horizontal mirror, non-affine warp rotation and native ID1266 evidence use BL→BR of nonAffineTransform');
