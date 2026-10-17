
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RELIGHT_MODELS = Object.freeze([
  {
    id: 'depth-anything-v2-small', name: 'Depth Anything V2 Small', role: 'relative inverse depth',
    repository: 'https://huggingface.co/onnx-community/depth-anything-v2-small',
    revision: '4472b7362082ad9968fee890ca0f1e5aca36b93d', license: 'Apache-2.0', precision: 'fp16 weights / float32 input and output',
    filename: 'depth-anything-v2-small-fp16.onnx',
    input: { name: 'pixel_values', dtype: 'float32', layout: 'NCHW', channels: 3, rescale: 1 / 255, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], sizeMultiple: 14, targetSize: 518, keepAspectRatio: true, resample: 'bicubic' },
    output: { name: 'predicted_depth', dtype: 'float32', layout: 'NHW', interpretation: 'Relative inverse depth; larger values are nearer. Do not read metric distances.' },
    onnx: { irVersion: 9, opset: 14 },
  },
  {
    id: 'moge-2-vits-normal', name: 'MoGe-2 ViT-S Normal', role: 'surface normals and geometry validity',
    author: 'Ruicheng Wang et al. / Microsoft', repository: 'https://huggingface.co/Ruicheng/moge-2-vits-normal-onnx',
    revision: 'e50ffda41565591092adea54c6ac83d6212e1e23', license: 'MIT; DINOv2 backbone Apache-2.0', precision: 'fp32',
    filename: 'moge-2-vits-normal.onnx',
    inputs: [{ name: 'image', dtype: 'float32', layout: 'NCHW', channels: 3, range: [0, 1] }, { name: 'num_tokens', dtype: 'int64', shape: [], recommendedRange: [1200, 2500] }],
    outputs: [{ name: 'points', dtype: 'float32', layout: 'NHWC', channels: 3 }, { name: 'normal', dtype: 'float32', layout: 'NHWC', channels: 3 }, { name: 'mask', dtype: 'float32', layout: 'NHW', range: [0, 1] }, { name: 'scale', dtype: 'float32', shape: [1] }],
    coordinates: { input: 'OpenCV camera: x right, y down, z forward', toRelight: ['x', 'y', 'z'] },
    note: 'This ONNX export is the raw forward pass; points are affine before focal/shift recovery and reprojection. The relight pipeline uses the directly predicted normals.',
    onnx: { irVersion: 7, opset: 14 },
  },
  {
    id: 'shadenet', name: 'ShadeNet-3.2-5M', role: 'albedo and original shading',
    author: 'Sachin (singam96)', repository: 'https://huggingface.co/singam96/ShadeNet-3.2-5M',
    revision: '5460d5b88c7279cf18b8d698a62497da27e5c267', license: 'Apache-2.0', precision: 'fp16 weights / float32 input and output',
    filename: 'shadenet-fp16.onnx',
    input: { name: 'input_rgb', dtype: 'float32', layout: 'NCHW', channels: 3, range: [-1, 1], sizeMultiple: 16, trainingResolution: 384 },
    output: { name: 'output', dtype: 'float32', layout: 'NCHW', channels: 8, range: [-1, 1], maps: { albedo: [0, 3], depth: [3, 4], normals: [4, 7], shading: [7, 8] } },
    reconstruction: 'Decode albedo and shading with (value + 1) / 2; the author reconstructs encoded RGB as albedo * shading.',
    onnx: { irVersion: 8, opset: 17 },
  },
]);

export const RELIGHT_FACE_MODEL = Object.freeze({
  id: 'face-landmarker', name: 'MediaPipe Face Landmarker', role: 'face geometry, eye/lip masks and skin material support',
  author: 'Google MediaPipe', revision: 'float16/1', filename: 'face-landmarker.task', license: 'Apache-2.0',
  source: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  modelCard: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf',
  runtime: '@mediapipe/tasks-vision', runtimeVersion: '1.0.1', delegate: 'CPU', runningMode: 'IMAGE', numFaces: 4,
  minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5,
  output: { landmarks: 478, coordinates: 'normalized x/y image coordinates; z relative to face center and scaled like x', blendshapes: false, transformationMatrices: false },
});

const mogeSource = 'https://raw.githubusercontent.com/microsoft/MoGe/74fbce054ebed49800de42d0ad0e83495065719a';
export const RELIGHT_ASSETS = Object.freeze([
  { filename: 'face-landmarker.task', url: RELIGHT_FACE_MODEL.source, bytes: 3758596, sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff' },
  { filename: 'MEDIAPIPE-LICENSE', url: 'https://www.apache.org/licenses/LICENSE-2.0.txt', bytes: 11358, sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
  { filename: 'depth-anything-v2-small-fp16.onnx', url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_fp16.onnx', bytes: 49642442, sha256: '2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04' },
  { filename: 'moge-2-vits-normal.onnx', url: 'https://huggingface.co/Ruicheng/moge-2-vits-normal-onnx/resolve/e50ffda41565591092adea54c6ac83d6212e1e23/model.onnx', bytes: 140852051, sha256: '24eacb5dc7a2c54c7bc98f7de085ffbed79ad006ea5b664c2c2cdc02ff3a52f0' },
  { filename: 'shadenet-fp16.onnx', url: 'https://huggingface.co/singam96/ShadeNet-3.2-5M/resolve/5460d5b88c7279cf18b8d698a62497da27e5c267/onnx/model_fp16.onnx', bytes: 10208498, sha256: '5375b0c34610fb73f0df22b29e03dc3049f69827882f62f4e1fa74f7b40b2b93' },
  { filename: 'DEPTH-PREPROCESSOR.json', url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/raw/4472b7362082ad9968fee890ca0f1e5aca36b93d/preprocessor_config.json', bytes: 461, sha256: '03576db3c13dd0471fdf5f5e1428befcb95de063fe699879150b293dc9e0a2c6' },
  { filename: 'MOGE-LICENSE', url: `${mogeSource}/LICENSE`, bytes: 12500, sha256: 'ad7d951c80c5fc2b2bce035f2041bc0a0dbf9028c8ecc4c9a8e1fba8130b6b59' },
  { filename: 'SHADENET-LICENSE', url: 'https://www.apache.org/licenses/LICENSE-2.0.txt', bytes: 11358, sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
  { filename: 'ORT-LICENSE', url: 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/LICENSE', bytes: 1073, sha256: '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c' },
  { filename: 'ORT-ThirdPartyNotices.txt', url: 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/ThirdPartyNotices.txt', bytes: 338088, sha256: '143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3' },
]);

export function verifyRelightAsset(asset, data) {
  return data.byteLength === asset.bytes && crypto.createHash('sha256').update(data).digest('hex') === asset.sha256;
}

export async function fetchRelightAssets() {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/vendor/relight');
  await fs.mkdir(out, { recursive: true });
  for (const asset of RELIGHT_ASSETS) {
    const target = path.join(out, asset.filename);
    const current = await fs.readFile(target).catch(() => null);
    if (current && verifyRelightAsset(asset, current)) {
      console.log(`已校验：${asset.filename}`);
      continue;
    }
    console.log(`下载：${asset.filename} (${asset.bytes.toLocaleString('en-US')} bytes)`);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status} ${asset.url}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (!verifyRelightAsset(asset, data)) throw new Error(`${asset.filename} 大小或 SHA-256 不符合固定版本；未写入文件。`);
    const temporary = `${target}.download`;
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, target);
    console.log(`已保存并校验：${asset.filename}`);
  }
  console.log('重新打光模型及人脸资源就绪；vendor 同步会生成运行时与清单。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await fetchRelightAssets();
}
