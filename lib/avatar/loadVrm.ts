"use client";

/**
 * Carga el avatar VRM. Intenta en orden:
 *  1. /avatars/panduro.vrm  (archivo local en public/, gitignoreado)
 *  2. CDN URLs públicas con modelos CC-BY gratuitos
 *
 * Para persistir el modelo en el repo: coloca un archivo VRM en
 * public/avatars/panduro.vrm. Si no existe, el browser descarga
 * automáticamente uno de las CDN candidatas.
 */

export const VRM_PATH = "/avatars/panduro.vrm";

// Modelos VRM gratuitos (CC-BY / no-comercial). El browser los prueba en orden.
// VRoid/Alicia: personaje femenino anime-realistic, ideal para lengua de signos.
const CDN_CANDIDATES = [
  // Alicia Solid — modelo canónico VRM0, female, anime-realistic (CC-BY)
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.5.5/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm",
  // Seed-san — muestra oficial VRM1 del consorcio VRM (CC-BY)
  "https://cdn.jsdelivr.net/gh/vrm-c/vrm-specification@master/samples/Seed-san/vrm1/Seed-san.vrm",
];

export type LoadedVrm = {
  scene: unknown; // THREE.Object3D
  vrm: unknown;   // VRM
};

export async function loadPanduroVrm(): Promise<LoadedVrm | null> {
  if (typeof window === "undefined") return null;

  // Intentar ruta local primero, luego CDN en orden
  const urls = [VRM_PATH, ...CDN_CANDIDATES];
  let targetUrl: string | null = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok) { targetUrl = url; break; }
    } catch { continue; }
  }
  if (!targetUrl) return null;

  const [{ GLTFLoader }, { VRMLoaderPlugin }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise((resolve) => {
    loader.load(
      targetUrl!,
      (gltf) => {
        const vrm = (gltf.userData as { vrm?: unknown }).vrm ?? null;
        if (!vrm) return resolve(null);
        resolve({ scene: gltf.scene, vrm });
      },
      undefined,
      () => resolve(null),
    );
  });
}
