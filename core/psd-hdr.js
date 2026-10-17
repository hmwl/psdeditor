



const DEFAULT_HDR = '68647274000000033e6b851f00000002000000037ebf60270000000200020000000000ff00ff010100000000000000004180000000000001000000003f80000068647261000000060000000041a0000041f0000000000000000000003f800000000000000000';
export function defaultHdrColorModeData() { return Uint8Array.from(DEFAULT_HDR.match(/../g), x => parseInt(x,16)); }
export function hasHdrV3Carrier(buffer) {
  const u8=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  return u8.length>=42&&dv.getUint16(22)===32&&dv.getUint32(26)>=8&&dv.getUint32(30)===0x68647274&&dv.getUint32(34)===3;
}
