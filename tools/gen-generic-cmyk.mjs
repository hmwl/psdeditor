

import fs from 'node:fs';
import { buildGenericCmykBytes } from '../core/icc.js';
const bytes = buildGenericCmykBytes(21, 9);
const b64 = Buffer.from(bytes).toString('base64');
fs.writeFileSync(new URL('../core/icc-cmyk-data.js', import.meta.url),
  `// 自动生成（tools/gen-generic-cmyk.mjs）：PSD Editor「通用 CMYK」ICC（${bytes.length} 字节，lut16，公开模型计算，无厂商数据）\nexport default '${b64}';\n`);
console.log('ok', bytes.length);
