import type { NormalizedLandmark } from "@/lib/mediapipe/types";

/**
 * Aplana 21 landmarks {x,y,z} a un vector de 63 features.
 * Requiere landmarks ya normalizados por `normalizeLandmarks`.
 */
export function extractFeatures(landmarks: NormalizedLandmark[]): number[] {
  if (landmarks.length !== 21) {
    throw new Error(
      `extractFeatures: se esperan 21 landmarks, llegaron ${landmarks.length}`,
    );
  }
  const out = new Array<number>(63);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i]!;
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

/** Distancia euclídea entre dos vectores del mismo tamaño. */
export function euclidean(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `euclidean: dimensiones distintas (${a.length} vs ${b.length})`,
    );
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}
