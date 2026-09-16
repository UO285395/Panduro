"use client";

/**
 * Helper para cargar el avatar VRM. El archivo `.vrm` NO está versionado en
 * el repo: cada dev/prod pone un modelo con licencia compatible en
 * `public/avatars/panduro.vrm`. Si no existe, esta función devuelve `null` y
 * `AvatarPlayer` cae al fallback SVG animado.
 *
 * Se importa dinámicamente three + three-vrm para que no engorden el bundle
 * inicial de rutas que no muestran avatar.
 */

export const VRM_PATH = "/avatars/panduro.vrm";

// Tipos mínimos que exponemos hacia arriba (evita filtrar tipos de Three).
export type LoadedVrm = {
  scene: unknown; // THREE.Object3D
  vrm: unknown; // VRM
};

export async function loadPanduroVrm(): Promise<LoadedVrm | null> {
  if (typeof window === "undefined") return null;
  try {
    const head = await fetch(VRM_PATH, { method: "HEAD" });
    if (!head.ok) return null;
  } catch {
    return null;
  }

  const [{ GLTFLoader }, { VRMLoaderPlugin }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise((resolve) => {
    loader.load(
      VRM_PATH,
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
