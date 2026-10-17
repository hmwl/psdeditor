

const RUNTIME_VERSION = '1.0.1';
const MODULE_URL = new URL(import.meta.url);
const staticUrl = path => MODULE_URL.protocol === 'http:' || MODULE_URL.protocol === 'https:' ? new URL(path, MODULE_URL).href : path;
const RUNTIME_ROOT = staticUrl(`/vendor/relight/mediapipe/${RUNTIME_VERSION}/`);
const MODEL_REVISION = 'float16/1';
const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const MODEL_URL = staticUrl(`/vendor/relight/face-landmarker.task?revision=float16-1&sha256=${MODEL_SHA256.slice(0, 12)}`);
const MODEL_BYTES = 3758596;
const XNNPACK_INITIALIZATION = 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.';
let landmarkerPromise = null;
let activeLandmarker = null;
let epoch = 0;

function notify(onProgress, value) {
  try { onProgress?.({ model: 'faces', label: 'MediaPipe Face Landmarker', ...value }); } catch {  }
}

async function validModel(bytes) {
  if (bytes.length !== MODEL_BYTES || !globalThis.crypto?.subtle) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('') === MODEL_SHA256;
}

async function modelBytes(onProgress) {
  let cache, response;
  try {
    if (typeof caches !== 'undefined') {
      cache = await caches.open('image-models-relight-faces-v1');
      response = await cache.match(MODEL_URL);
    }
  } catch {  }
  if (response) {
    const stored = new Uint8Array(await response.arrayBuffer());
    if (await validModel(stored)) {
      notify(onProgress, { stage: 'model', progress: 1, cached: true });
      return stored;
    }
    try { await cache?.delete(MODEL_URL); } catch {  }
  }
  notify(onProgress, { stage: 'model', progress: 0, cached: false });
  response = await fetch(MODEL_URL, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`人脸模型加载失败（HTTP ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!await validModel(bytes)) throw new Error('人脸模型大小或 SHA-256 校验失败');
  try { await cache?.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })); } catch {  }
  notify(onProgress, { stage: 'model', progress: 1, cached: false });
  return bytes;
}

async function getLandmarker(onProgress) {
  if (!landmarkerPromise) {
    const generation = epoch;
    const requested = (async () => {
      const [{ FaceLandmarker }, bytes] = await Promise.all([import(RUNTIME_ROOT + 'vision_bundle.mjs'), modelBytes(onProgress)]);
      if (generation !== epoch) throw new Error('人脸分析已取消');
      
      
      const { default: createModule } = await import(RUNTIME_ROOT + 'vision_wasm_module_internal.js');
      const previousFactory = globalThis.ModuleFactory;
      const configuredFactory = options => {
        const forward = typeof options?.printErr === 'function' ? options.printErr : (...values) => console.error(...values);
        return createModule({ ...options, printErr: (...values) => {
          if (values.length === 1 && typeof values[0] === 'string' && values[0].trim() === XNNPACK_INITIALIZATION) return;
          forward(...values);
        } });
      };
      globalThis.ModuleFactory = configuredFactory;
      let instance;
      try { instance = await FaceLandmarker.createFromOptions({
        wasmLoaderPath: RUNTIME_ROOT + 'vision_wasm_module_internal.js',
        wasmBinaryPath: RUNTIME_ROOT + 'vision_wasm_module_internal.wasm',
      }, {
        baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 4,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      }); } finally {
        
        if (globalThis.ModuleFactory === configuredFactory) globalThis.ModuleFactory = previousFactory;
      }
      if (generation !== epoch) { instance.close(); throw new Error('人脸分析已取消'); }
      activeLandmarker = instance;
      return instance;
    })();
    landmarkerPromise = requested;
    requested.catch(() => { if (landmarkerPromise === requested) landmarkerPromise = null; });
  }
  return landmarkerPromise;
}


export async function detectRelightFaces(rgba, width, height, onProgress) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba?.length !== width * height * 4) throw new Error('人脸分析图像尺寸不正确');
  if (typeof ImageData === 'undefined') throw new Error('人脸分析需要浏览器 ImageData 与 Web Worker');
  const generation = epoch, loadedAt = performance.now();
  const landmarker = await getLandmarker(onProgress);
  if (generation !== epoch) throw new Error('人脸分析已取消');
  const pixels = new Uint8ClampedArray(rgba.length);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    if (rgba[offset + 3] > 0) {
      pixels[offset] = rgba[offset]; pixels[offset + 1] = rgba[offset + 1]; pixels[offset + 2] = rgba[offset + 2];
    }
    pixels[offset + 3] = 255;
  }
  notify(onProgress, { stage: 'analyze', progress: 0, backend: 'cpu' });
  const started = performance.now();
  const output = landmarker.detect(new ImageData(pixels, width, height));
  const runMs = Math.round(performance.now() - started), faces = [];
  for (const face of output.faceLandmarks || []) {
    if (face.length < 468) continue;
    const count = Math.min(478, face.length), landmarks = new Float32Array(count * 3);
    for (let point = 0; point < count; point++) {
      const value = face[point];
      if (![value.x, value.y, value.z].every(Number.isFinite)) throw new Error('人脸模型返回无效坐标');
      landmarks[point * 3] = value.x; landmarks[point * 3 + 1] = value.y; landmarks[point * 3 + 2] = value.z;
    }
    faces.push({ landmarks, normalized: true });
  }
  notify(onProgress, { stage: 'analyze', progress: 1, backend: 'cpu', faceCount: faces.length });
  return {
    faces,
    metadata: {
      id: 'face-landmarker', name: 'MediaPipe Face Landmarker', backend: 'cpu', delegate: 'CPU', runningMode: 'IMAGE',
      runtimeVersion: RUNTIME_VERSION, modelRevision: MODEL_REVISION, modelUrl: MODEL_URL, sha256: MODEL_SHA256,
      faceCount: faces.length, runMs, loadAndRunMs: Math.round(performance.now() - loadedAt),
      inputShape: [height, width, 4], outputShape: [faces.length, faces[0]?.landmarks.length / 3 || 0, 3],
    },
  };
}

export function disposeRelightFaces() {
  epoch++;
  activeLandmarker?.close(); activeLandmarker = null; landmarkerPromise = null;
}
