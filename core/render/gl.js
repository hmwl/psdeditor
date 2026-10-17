












const VS = `attribute vec2 aPos; attribute vec2 aUV; uniform vec2 uDoc; varying vec2 vUV;
void main(){ gl_Position = vec4(aPos.x/uDoc.x*2.0-1.0, 1.0-aPos.y/uDoc.y*2.0, 0.0, 1.0); vUV = aUV; }`;

const FS = `precision highp float;
uniform sampler2D uTex; uniform mat3 uPlace; uniform float uRepeat; uniform vec2 uSize;
varying vec2 vUV;
vec4 texel(vec2 p){
  p = uRepeat > 0.5 ? mod(mod(p,uSize)+uSize,uSize) : clamp(p,vec2(0.0),uSize-1.0);
  vec4 c = texture2D(uTex,(p+0.5)/uSize);
  return vec4(c.rgb*c.a,c.a);
}
void main(){
  vec3 p = uPlace * vec3(vUV, 1.0);
  vec2 uv = p.xy;
  if (uRepeat > 0.5) uv = fract(uv);
  else {
    if (uv.x < -0.0000001 || uv.x > 1.0000001 || uv.y < -0.0000001 || uv.y > 1.0000001) discard;
    uv=clamp(uv,vec2(0.0),vec2(1.0));
  }
  vec2 xy=uv*uSize-0.5, base=floor(xy), f=fract(xy);
  gl_FragColor=mix(mix(texel(base),texel(base+vec2(1.0,0.0)),f.x),
                   mix(texel(base+vec2(0.0,1.0)),texel(base+vec2(1.0,1.0)),f.x),f.y);
}`;

function isPOT(n) { return (n & (n - 1)) === 0; }

export function createGLBackend(provider) {
  let cache = null;   

  function destroyCache(c) {
    if (!c) return;
    try {
      const gl = c.gl;
      if (gl) {
        if (c.posBuf) gl.deleteBuffer(c.posBuf);
        if (c.uvBuf) gl.deleteBuffer(c.uvBuf);
        if (c.idxBuf) gl.deleteBuffer(c.idxBuf);
        if (c.tex) gl.deleteTexture(c.tex);
        if (c.prog) {
          if (c.vs) { gl.detachShader(c.prog, c.vs); gl.deleteShader(c.vs); }
          if (c.fs) { gl.detachShader(c.prog, c.fs); gl.deleteShader(c.fs); }
          gl.deleteProgram(c.prog);
        }
      }
    } catch {  }
    if (c.release) c.release();
  }

  function setup(w, h) {
    const key = w + 'x' + h;
    if (cache && cache.key === key) return cache;
    if (cache) destroyCache(cache);
    const { gl, isGL2, read } = provider.acquire(w, h);
    const sh = (t, s) => {
      const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('着色器编译失败：' + gl.getShaderInfoLog(o));
      return o;
    };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const fs = sh(gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('着色器链接失败：' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    if (!isGL2) gl.getExtension('OES_element_index_uint');
    cache = {
      key, gl, isGL2, prog, vs, fs, read,
      aPos: gl.getAttribLocation(prog, 'aPos'), aUV: gl.getAttribLocation(prog, 'aUV'),
      uDoc: gl.getUniformLocation(prog, 'uDoc'), uTex: gl.getUniformLocation(prog, 'uTex'),
      uPlace: gl.getUniformLocation(prog, 'uPlace'), uRepeat: gl.getUniformLocation(prog, 'uRepeat'), uSize: gl.getUniformLocation(prog, 'uSize'),
      posBuf: gl.createBuffer(), uvBuf: gl.createBuffer(), idxBuf: gl.createBuffer(),
      tex: gl.createTexture(), lastImageKey: null,
      release: provider.release ? () => provider.release() : null
    };
    return cache;
  }

  








  function render(o) {
    const R = setup(o.width, o.height), gl = R.gl;
    gl.useProgram(R.prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, R.posBuf); gl.bufferData(gl.ARRAY_BUFFER, o.mesh.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(R.aPos); gl.vertexAttribPointer(R.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.uvBuf); gl.bufferData(gl.ARRAY_BUFFER, o.mesh.uvs, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(R.aUV); gl.vertexAttribPointer(R.aUV, 2, gl.FLOAT, false, 0, 0);

    let idxType = gl.UNSIGNED_INT, idxArr = o.mesh.indices;
    if (!R.isGL2 && !gl.getExtension('OES_element_index_uint')) {
      
      let maxIdx = 0; for (let i = 0; i < o.mesh.indices.length; i++) if (o.mesh.indices[i] > maxIdx) maxIdx = o.mesh.indices[i];
      if (maxIdx > 0xffff) throw new Error(`网格顶点数超过 65535（最大索引 ${maxIdx}），当前 WebGL1 不支持 32 位索引`);
      idxType = gl.UNSIGNED_SHORT; idxArr = new Uint16Array(o.mesh.indices);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.DYNAMIC_DRAW);

    
    const img = o.image;
    const imgKey = o.imageKey != null ? o.imageKey : img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const canMip = (R.isGL2 || (isPOT(iw) && isPOT(ih)));
    const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const effWrap = (canMip || !o.repeat) ? wrap : gl.CLAMP_TO_EDGE; 
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex);
    if (R.lastImageKey !== imgKey) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      
      
      if (img.data) {
        const src = ArrayBuffer.isView(img.data)
          ? new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength)
          : new Uint8Array(img.data);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, iw, ih, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      R.lastImageKey = imgKey;
      R.lastWrap = null;     
    }
    if (R.lastWrap !== effWrap) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, effWrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, effWrap);
      R.lastWrap = effWrap;
    }

    gl.uniform1i(R.uTex, 0);
    gl.uniform2f(R.uDoc, o.width, o.height);
    
    const m = o.placement;
    gl.uniformMatrix3fv(R.uPlace, false, new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]));
    gl.uniform1f(R.uRepeat, o.repeat ? 1 : 0);
    gl.uniform2f(R.uSize, iw, ih);

    gl.viewport(0, 0, o.width, o.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, o.mesh.indices.length, idxType, 0);
    gl.flush();

    if (o.readback === false) return null;          
    const out = o.out || new Uint8Array(o.width * o.height * 4);
    R.read(out);
    
    for (let i = 0; i < out.length; i += 4) {
      const a = out[i + 3];
      for (let k = 0; k < 3; k++) out[i + k] = a ? Math.min(255, Math.round(out[i + k] * 255 / a)) : 0;
    }
    return out;
  }

  return { name: 'gl', render, destroy: () => destroyCache(cache), get context() { return cache && cache.gl; } };
}
