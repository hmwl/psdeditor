
import { prepareRelightWorkingImage, prepareRelightInput, prepareGeometryInput, decodeRelightOutput, assembleRelightMaps, renderRelight } from './relight.js';
import { detectRelightFaces } from './relight-face-infer.js';

export const WORKER_URL = import.meta.url;
const ORT_MODULE_URL = '/vendor/relight/ort.webgpu.min.mjs';
const MODELS = [
  { id: 'depth', name: 'Depth Anything V2 Small', file: 'depth-anything-v2-small-fp16.onnx', revision: '4472b7362082ad9968fee890ca0f1e5aca36b93d', output: 'predicted_depth' },
  { id: 'normals', name: 'MoGe-2 ViT-S Normal', file: 'moge-2-vits-normal.onnx', revision: 'e50ffda41565591092adea54c6ac83d6212e1e23', output: 'normal' },
  { id: 'intrinsics', name: 'ShadeNet 3.2 5M', file: 'shadenet-fp16.onnx', revision: '5460d5b88c7279cf18b8d698a62497da27e5c267', output: 'output' },
];
const sessions = new Map();
let ortPromise, preferredBackendPromise;

async function runtime() {
  if (!ortPromise) ortPromise = import(ORT_MODULE_URL).then(ort => {
    
    ort.env.logLevel = 'error';
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = '/vendor/relight/';
    return ort;
  }).catch(error => { ortPromise = null; throw error; });
  return ortPromise;
}

async function preferredBackend() {
  if (!preferredBackendPromise) preferredBackendPromise = (async () => {
    try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu'; } catch {  }
    return 'wasm';
  })();
  return preferredBackendPromise;
}

async function loadModel(model, progress) {
  const url = `/vendor/relight/${model.file}?revision=${model.revision}`;
  progress({ stage: 'model', progress: 0 });
  let cache, response;
  try {
    if (typeof caches !== 'undefined') { cache = await caches.open('image-models-relight-v2'); response = await cache.match(url); }
  } catch {  }
  const cached = Boolean(response);
  if (!response) response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${model.name} 下载失败（HTTP ${response.status}）`);
  
  const stored = !cached && cache ? cache.put(url, response.clone()).catch(() => {}) : null;
  let bytes;
  if (!response.body?.getReader) bytes = new Uint8Array(await response.arrayBuffer());
  else {
    const length = Number(response.headers.get('content-length')), reader = response.body.getReader(), parts = [];
    let received = 0, last = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); received += value.byteLength;
      if (Date.now() - last >= 100) {
        progress({ stage: 'model', progress: length > 0 ? Math.min(0.95, received / length * 0.95) : 0.2, cached }); last = Date.now();
      }
    }
    bytes = new Uint8Array(received); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  }
  if (stored) await stored;
  return bytes;
}

async function getSession(model, progress, forcedBackend) {
  const backend = forcedBackend || await preferredBackend(), key = `${model.id}:${backend}`;
  if (!sessions.has(key)) {
    const promise = (async () => {
      const ort = await runtime(), bytes = await loadModel(model, progress);
      progress({ stage: 'backend', backend, progress: 0 });
      try {
        const session = await ort.InferenceSession.create(bytes, { executionProviders: backend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
        progress({ stage: 'model', backend, progress: 1 });
        return { session, backend: backend === 'webgpu' ? 'webgpu/wasm' : 'wasm' };
      } catch (error) {
        if (backend !== 'webgpu') throw error;
        const fallbackReason = String(error?.message || error);
        progress({ stage: 'backend', backend: 'wasm', reason: 'gpu-fallback', error: fallbackReason, phase: 'session', progress: 0 });
        const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
        progress({ stage: 'model', backend: 'wasm', progress: 1 });
        return { session, backend: 'wasm', fallbackReason };
      }
    })();
    sessions.set(key, promise);
    promise.catch(() => { if (sessions.get(key) === promise) sessions.delete(key); });
  }
  return sessions.get(key);
}

function checkedFloat32(tensor, name) {
  if (tensor?.type !== 'float32' || !(tensor.data instanceof Float32Array)) throw new Error(`${name} 输出类型不匹配（需要 float32，收到 ${tensor?.type || '空'}）`);
  for (const value of tensor.data) if (!Number.isFinite(value)) throw new Error(`${name} 返回无效数值`);
  return tensor.data;
}

async function runModel(model, input, progress, decode) {
  const ort = await runtime(); let record = await getSession(model, progress);
  const tensor = new ort.Tensor('float32', input.data, [1, 3, input.inputHeight, input.inputWidth]);
  const tokens = model.id === 'normals' ? new ort.Tensor('int64', BigInt64Array.from([1800n]), []) : null;
  let outputs;
  const feeds = model.id === 'normals' ? { image: tensor, num_tokens: tokens } : { [record.session.inputNames[0]]: tensor };
  try {
    progress({ stage: 'analyze', backend: record.backend, progress: 0.05 });
    const started = performance.now();
    try { outputs = await record.session.run(feeds); }
    catch (error) {
      if (!record.backend.startsWith('webgpu')) throw error;
      const fallbackReason = String(error?.message || error);
      progress({ stage: 'backend', backend: 'wasm', reason: 'gpu-fallback', error: fallbackReason, phase: 'run', progress: 0 });
      await record.session.release().catch(() => {});
      sessions.delete(`${model.id}:webgpu`);
      record = await getSession(model, progress, 'wasm');
      record = { ...record, fallbackReason };
      outputs = await record.session.run(feeds);
    }
    const decoded = decode(outputs), output = outputs[model.output];
    const metadata = {
      id: model.id, name: model.name, backend: record.backend, runMs: Math.round(performance.now() - started),
      inputShape: [...tensor.dims], outputShape: [...output.dims], inputType: tensor.type, outputType: output.type,
    };
    if (record.fallbackReason) metadata.fallbackReason = record.fallbackReason;
    if (decoded.mask) metadata.validFraction = decoded.mask.reduce((sum, value) => sum + (value >= 0.5 ? 1 : 0), 0) / decoded.mask.length;
    progress({ stage: 'analyze', backend: record.backend, progress: 1 });
    return { decoded, metadata };
  } finally {
    tensor.dispose?.(); tokens?.dispose?.();
    if (outputs) for (const output of Object.values(outputs)) output.dispose?.();
  }
}

async function analyze(rgba, w, h, emit) {
  const working = prepareRelightWorkingImage(rgba, w, h);
  const intrinsicInput = prepareRelightInput(working.rgba8, working.width, working.height), width = intrinsicInput.width, height = intrinsicInput.height;
  let depth, normals, intrinsic;
  const faceResult = await detectRelightFaces(working.rgba8, working.width, working.height, value => emit({ ...value, model: 'faces', label: '人脸几何', total: 4, completed: 0 }));
  emit({ stage: 'analyze', model: 'faces', label: '人脸几何', progress: 1, total: 4, completed: 1, backend: faceResult.metadata.backend, faceCount: faceResult.faces.length });
  const metadata = [];
  for (const model of MODELS) {
    const progress = value => emit({ ...value, model: model.id, label: model.name, completed: metadata.length + 1, total: 4 });
    const input = model.id === 'intrinsics' ? intrinsicInput : prepareGeometryInput(working.rgba8, working.width, working.height, model.id);
    const result = await runModel(model, input, progress, outputs => {
      if (model.id === 'depth') {
        const output = outputs.predicted_depth;
        if (output?.dims.length !== 3 || output.dims[0] !== 1) throw new Error('Depth Anything 输出格式不正确');
        return { data: new Float32Array(checkedFloat32(output, model.name)), width: output.dims[2], height: output.dims[1] };
      }
      if (model.id === 'normals') {
        const output = outputs.normal, mask = outputs.mask;
        if (output?.dims.length !== 4 || output.dims[0] !== 1 || output.dims[3] !== 3 || mask?.dims.length !== 3 || mask.dims[1] !== output.dims[1] || mask.dims[2] !== output.dims[2]) throw new Error('MoGe 输出格式不正确');
        return { normals: new Float32Array(checkedFloat32(output, model.name)), mask: new Float32Array(checkedFloat32(mask, model.name)), points: new Float32Array(checkedFloat32(outputs.points, model.name)), width: output.dims[2], height: output.dims[1] };
      }
      const output = outputs.output;
      if (output?.dims.length !== 4 || output.dims[0] !== 1 || output.dims[1] !== 8 || output.dims[2] !== input.inputHeight || output.dims[3] !== input.inputWidth) throw new Error('ShadeNet 输出格式不正确');
      return decodeRelightOutput(checkedFloat32(output, model.name), input.inputWidth, input.inputHeight, width, height);
    });
    if (model.id === 'depth') depth = result.decoded;
    else if (model.id === 'normals') normals = result.decoded;
    else intrinsic = result.decoded;
    metadata.push(result.metadata);
    emit({ stage: 'analyze', model: model.id, label: model.name, progress: 1, completed: metadata.length + 1, total: 4, backend: result.metadata.backend });
  }
  
  emit({ stage: 'geometry', label: '融合表面、深度和材质', progress: 0.1, completed: 4, total: 4 });
  const maps = assembleRelightMaps(rgba, w, h, depth, normals, intrinsic, faceResult.faces);
  maps.models = metadata;
  maps.faceInference = faceResult.metadata;
  emit({ stage: 'ready', progress: 1, completed: 4, total: 4 });
  return maps;
}

const inWorker = typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function';
if (inWorker) {
  let queue = Promise.resolve(), activeScene = null, activeSceneId = 0;
  self.onmessage = ev => {
    const message = ev.data || {};
    queue = queue.then(async () => {
      try {
        if (message.type === 'analyze') {
          const maps = await analyze(message.rgba, message.w, message.h, progress => self.postMessage({ job: message.job, progress }));
          activeScene = maps; activeSceneId++; maps.sceneId = activeSceneId;
          
          
          self.postMessage({ job: message.job, maps, sceneId: activeSceneId });
        } else if (message.type === 'render') {
          if (message.maps) { activeScene = message.maps; activeSceneId++; }
          else if (!activeScene || message.sceneId !== activeSceneId) { self.postMessage({ job: message.job, needScene: true }); return; }
          let rgba = null, renderBackend = 'webgpu', renderFallback = null;
          try { const { renderRelightGpu } = await import('./relight-gpu.js'); rgba = await renderRelightGpu(message.rgba, message.w, message.h, activeScene, message.params); }
          catch (error) { renderFallback = String(error?.message || error); }
          if (!rgba) { renderBackend = 'cpu'; rgba = renderRelight(message.rgba, message.w, message.h, activeScene, message.params); }
          self.postMessage({ job: message.job, rgba, sceneId: activeSceneId, backend: renderBackend, renderBackend, renderFallback, renderPasses: rgba.renderPasses }, [rgba.buffer]);
        } else throw new Error('重新打光：未知 Worker 请求');
      } catch (error) { self.postMessage({ job: message.job, error: String(error?.message || error) }); }
    });
  };
  self.postMessage({ ready: true });
}
