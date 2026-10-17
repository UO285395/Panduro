"use client";

/**
 * Carga el avatar VRM. Intenta en orden:
 *  1. /avatars/panduro.vrm  (el modelo de Panduro, CC0, en public/; ver docs/avatar.md)
 *  2. CDN URLs públicas con modelos CC-BY gratuitos
 */

export const VRM_PATH = "/avatars/panduro.vrm";

// Modelos VRM gratuitos (CC-BY). El browser los prueba en orden.
const CDN_CANDIDATES = [
  // Seed-san — personaje femenino oficial del VRM Consortium (CC-BY, VRM1)
  "https://cdn.jsdelivr.net/gh/vrm-c/vrm-specification@master/samples/Seed-san/vrm1/Seed-san.vrm",
  // VRM1_Constraint_Twist_Sample — fallback técnico de pixiv/three-vrm
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.5.5/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm",
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

  const [THREE, { GLTFLoader }, { VRMLoaderPlugin }] = await Promise.all([
    import("three"),
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
        // Lo recortado (pelo, cejas, pestañas) con el borde suavizado por el antialiasing: con
        // el corte a secas, los mechones salían en escalones. El borde de cada mechón escribe
        // en el lienzo un alfa a medias aunque detrás haya pelo o piel, y el fondo de la página
        // se veía a través en rayitas blancas: el alfa se queda con el mayor (el color, igual).
        gltf.scene.traverse((o) => {
          const mats = (o as { material?: InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[] }).material;
          for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
            if (m.alphaTest <= 0) continue;
            m.alphaToCoverage = true;
            m.blending = THREE.CustomBlending;
            m.blendSrc = THREE.OneFactor;
            m.blendDst = THREE.ZeroFactor;
            m.blendEquation = THREE.AddEquation;
            m.blendSrcAlpha = THREE.OneFactor;
            m.blendDstAlpha = THREE.OneFactor;
            m.blendEquationAlpha = THREE.MaxEquation;
          }
        });
        resolve({ scene: gltf.scene, vrm });
      },
      undefined,
      () => resolve(null),
    );
  });
}
