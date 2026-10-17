










export function lintPsd(buffer) {
  const u8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const N = u8.length;
  const errors = [], warnings = [], sum = {};
  const fail = m => { errors.push(m); };
  const u16 = o => dv.getUint16(o), u32 = o => dv.getUint32(o), i16 = o => dv.getInt16(o), i32 = o => dv.getInt32(o);
  const u64 = o => u32(o) * 0x100000000 + u32(o + 4);
  const key = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  try {
    if (N < 26 || key(0) !== '8BPS') return { ok: false, errors: ['不是 PSD 文件'], warnings, summary: sum };
    const psb = u16(4) === 2;
    const len = o => psb ? u64(o) : u32(o), lenSize = psb ? 8 : 4;
    const channels = u16(12), H = u32(14), W = u32(18), depth = u16(22), mode = u16(24);
    Object.assign(sum, { psb, channels, W, H, depth, mode });
    const bps = depth === 16 ? 2 : depth === 32 ? 4 : 1;
    let o = 26;
    const cmLen = u32(o); o += 4 + cmLen;
    if (o > N) fail('颜色模式数据越界');
    const irLen = u32(o); const irEnd = o + 4 + irLen; o += 4;
    if (irEnd > N) fail('图像资源段越界');
    let nRes = 0;
    while (o + 12 <= irEnd) {
      if (key(o) !== '8BIM' && key(o) !== 'MeSa' && key(o) !== 'AgHg' && key(o) !== 'PHUT' && key(o) !== 'DCSR') { fail(`图像资源 @${o} 签名非法 "${key(o)}"`); break; }
      const id = u16(o + 4); o += 6;
      const nl = u8[o]; o += 1 + nl; if ((1 + nl) % 2) o++;
      const l = u32(o); o += 4 + l; if (l % 2) o++;
      nRes++;
      if (o > irEnd) { fail(`图像资源 id=${id} 超出资源段`); break; }
    }
    if (o !== irEnd) warnings.push(`图像资源段尾部有 ${irEnd - o} 字节未解析`);
    sum.resources = nRes;
    o = irEnd;

    
    const lmiLen = len(o); const lmiStart = o + lenSize; const lmiEnd = lmiStart + lmiLen; o = lmiStart;
    if (lmiEnd > N) fail(`层与蒙版信息段越界（声明到 ${lmiEnd}，文件长 ${N}）`);
    if (lmiLen > 0) {
      const liLen = len(o); const liStart = o + lenSize; const liEnd = liStart + liLen; o = liStart;
      if (liEnd > lmiEnd) fail(`层信息段越界（到 ${liEnd} > ${lmiEnd}）`);
      if (liLen % 2) fail('层信息段长度不是偶数');
      if (liLen % 4) warnings.push('层信息段长度不是 4 的倍数（PS 自己写出的文件都是 4 对齐）');
      const count = Math.abs(i16(o)); o += 2; sum.layers = count;
      const recs = [];
      for (let i = 0; i < count; i++) {
        const top = i32(o), left = i32(o + 4), bottom = i32(o + 8), right = i32(o + 12); o += 16;
        const nch = u16(o); o += 2;
        const chans = [];
        for (let c = 0; c < nch; c++) { chans.push({ id: i16(o), len: len(o + 2) }); o += 2 + lenSize; }
        if (key(o) !== '8BIM') { fail(`图层 ${i} 混合签名非法 @${o}`); break; }
        o += 4 + 4 + 4;
        const extraLen = u32(o); const extraStart = o + 4; const extraEnd = extraStart + extraLen; o = extraStart;
        if (extraEnd > liEnd) { fail(`图层 ${i} 附加数据越界`); break; }
        const maskLen = u32(o); o += 4 + maskLen;
        const brLen = u32(o); o += 4 + brLen;
        const nl = u8[o]; o += 1 + nl; while ((o - extraStart) % 4) o++;
        let name = ''; for (let k = 0; k < nl; k++) name += String.fromCharCode(u8[extraStart + 8 + maskLen + brLen + 1 + k]);
        
        let nb = 0;
        while (o + 12 <= extraEnd) {
          const sig = key(o);
          if (sig !== '8BIM' && sig !== '8B64') { fail(`图层 ${i}「${name}」附加块 @${o} 签名非法 "${sig}"`); break; }
          const k = key(o + 4);
          const big = sig === '8B64' || (psb && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD', 'cinf'].includes(k));
          const bl = big ? u64(o + 8) : u32(o + 8);
          const dataStart = o + 8 + (big ? 8 : 4);
          o = dataStart + bl; if (bl % 2) o++;
          nb++;
          if (o > extraEnd) { fail(`图层 ${i}「${name}」附加块 ${k} 越界（块长 ${bl}）`); break; }
        }
        if (o !== extraEnd) { if (extraEnd - o >= 12) warnings.push(`图层 ${i}「${name}」附加区尾部剩 ${extraEnd - o} 字节`); o = extraEnd; }
        const w = right - left, h = bottom - top;
        recs.push({ name, chans, w, h, blocks: nb });
      }
      
      for (const r of recs) {
        for (const ch of r.chans) {
          if (o + ch.len > liEnd) { fail(`图层「${r.name}」通道 ${ch.id} 数据越界`); break; }
          if (ch.len >= 2) {
            const comp = u16(o);
            if (comp === 0 && r.w > 0 && r.h > 0 && ch.id >= -1 && ch.len - 2 !== r.w * r.h * bps) fail(`图层「${r.name}」通道 ${ch.id} raw 长度 ${ch.len - 2} ≠ ${r.w}×${r.h}×${bps}`);
            if (comp === 1 && r.w > 0 && r.h > 0 && ch.id >= -1) {
              let rows = 0; for (let y = 0; y < r.h; y++) rows += psb ? u32(o + 2 + y * 4) : u16(o + 2 + y * 2);
              const need = 2 + r.h * (psb ? 4 : 2) + rows;
              if (need !== ch.len) fail(`图层「${r.name}」通道 ${ch.id} RLE 长度 ${need} ≠ 声明 ${ch.len}`);
            }
          }
          o += ch.len;
        }
      }
      if (o > liEnd) fail('通道数据超出层信息段');
      else if (liEnd - o > 3) warnings.push(`层信息段尾部有 ${liEnd - o} 字节填充`);
      o = liEnd;
      
      if (o + 4 <= lmiEnd) { const gm = u32(o); o += 4 + gm; if (o > lmiEnd) fail('全局蒙版信息越界'); }
      let ng = 0;
      while (o + 12 <= lmiEnd) {
        const sig = key(o);
        if (sig !== '8BIM' && sig !== '8B64') { fail(`全局附加块 @${o} 签名非法 "${sig}"`); break; }
        const k = key(o + 4);
        const big = sig === '8B64' || (psb && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf'].includes(k));
        const bl = big ? u64(o + 8) : u32(o + 8);
        const dataStart = o + 8 + (big ? 8 : 4), dataEnd = dataStart + bl;
        if (dataEnd > lmiEnd) { fail(`全局附加块 ${k} 越界（块长 ${bl}，到 ${dataEnd} > ${lmiEnd}）`); break; }
        if (k === 'lnk2' || k === 'lnkD' || k === 'lnk3' || k === 'lnkE') {
          let q = dataStart, nrec = 0;
          while (q + 8 <= dataEnd) {
            const size = u64(q); const recEnd = q + 8 + size + ((4 - size % 4) % 4);
            if (size <= 0) break;
            if (key(q + 8) !== 'liFD' && key(q + 8) !== 'liFE' && key(q + 8) !== 'liFA') { fail(`${k} 记录 @${q} 类型非法 "${key(q + 8)}"`); break; }
            if (recEnd > dataEnd + 3) { fail(`${k} 记录 @${q} 越界（size ${size}）`); break; }
            nrec++; q = recEnd;
          }
          sum.linkedFiles = (sum.linkedFiles || 0) + nrec;
        }
        o = dataEnd; while ((o - dataStart) % 4 && o < lmiEnd) o++;   
        if (o > lmiEnd) o = lmiEnd;
        ng++;
      }
      sum.globalBlocks = ng;
    }
    o = lmiEnd;

    
    if (o + 2 > N) fail('缺少合成图数据');
    else {
      const comp = u16(o); o += 2;
      const rows = H * channels;
      if (comp === 0) { if (o + rows * W * bps !== N) fail(`合成图 raw 长度不符：应到 ${o + rows * W * bps}，文件长 ${N}`); }
      else if (comp === 1) {
        if (o + rows * (psb ? 4 : 2) > N) fail('合成图 RLE 行长表越界');
        else {
          let tot = 0; for (let i = 0; i < rows; i++) tot += psb ? u32(o + i * 4) : u16(o + i * 2);
          const end = o + rows * (psb ? 4 : 2) + tot;
          if (end !== N) fail(`合成图 RLE 数据应到 ${end}，文件长 ${N}（${end > N ? '缺 ' + (end - N) : '多 ' + (N - end)} 字节）→ PS 会报「意外地遇到文件尾」`);
        }
      } else warnings.push('合成图压缩方式 ' + comp + ' 未校验');
    }
  } catch (e) { fail('校验时越界读取：' + e.message); }
  return { ok: errors.length === 0, errors, warnings, summary: sum };
}

export default { lintPsd };
