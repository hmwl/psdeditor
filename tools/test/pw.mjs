
export async function loadPlaywright() {
  for (const spec of ['playwright', 'playwright-core', process.env.PLAYWRIGHT_MODULE && (process.env.PLAYWRIGHT_MODULE.replace(/\/$/, '') + '/index.mjs')].filter(Boolean)) {
    try { const m = await import(spec); return m.chromium ? m : (m.default || m); } catch {  }
  }
  return null;
}
export const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader'];   
