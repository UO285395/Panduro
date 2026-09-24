"use client";

import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Modelo 3D de la mascota, si el usuario ha puesto uno en public/mascot/ (gitignoreado,
 * como el VRM: los modelos de Sketchfab tienen cada uno su licencia). Sin él, la mascota
 * es la mano procedimental. /api/mascot dice qué archivo hay.
 *
 * public/mascot/mascot.json (opcional) ajusta lo que depende de cada modelo:
 *   { "file": "scene.gltf", "rotateY": 180, "animation": true }
 */
export type MascotConfig = {
  file?: string;
  /** Giro en grados para que mire a la cámara. */
  rotateY?: number;
  /** Usar las animaciones que traiga el modelo (si no, solo el movimiento procedimental). */
  animation?: boolean;
};

export type LoadedMascot = { gltf: GLTF; config: MascotConfig };

let cached: Promise<LoadedMascot | null> | null = null;

async function load(): Promise<LoadedMascot | null> {
  let found: { url: string | null; config: MascotConfig };
  try {
    found = await (await fetch("/api/mascot")).json();
  } catch {
    return null;
  }
  if (!found.url) return null;
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  try {
    return { gltf: await new GLTFLoader().loadAsync(found.url), config: found.config ?? {} };
  } catch {
    return null;
  }
}

/** Una sola descarga por página, aunque haya varias mascotas a la vez. */
export function loadMascotModel(): Promise<LoadedMascot | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  cached ??= load();
  return cached;
}
