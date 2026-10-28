"use client";

/**
 * Carga el avatar VRM. Intenta en orden:
 *  1. /avatars/panduro.vrm  (el modelo de Panduro, CC0, en public/; ver docs/avatar.md)
 *  2. CDN URLs públicas con modelos CC-BY gratuitos
 */

export const VRM_PATH = "/avatars/panduro.vrm";

// Modelos VRM gratuitos (CC-BY), por si no está el local. Se prueban en orden.
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

  const [THREE, { GLTFLoader }, { VRMLoaderPlugin }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  // Ruta local primero y luego las de la CDN. Se pide cada modelo directamente (sin una
  // petición HEAD antes): el service worker solo sirve GET desde la caché, y con HEAD el
  // avatar no cargaba sin conexión.
  for (const url of [VRM_PATH, ...CDN_CANDIDATES]) {
    let gltf: Awaited<ReturnType<typeof loader.loadAsync>>;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      continue;
    }
    const vrm = (gltf.userData as { vrm?: unknown }).vrm ?? null;
    if (!vrm) continue;
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
    return { scene: gltf.scene, vrm };
  }
  return null;
}
