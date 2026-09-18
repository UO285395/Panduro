import type { NormalizedLandmark } from "@/lib/mediapipe/types";

/**
 * Aplana 21 landmarks {x,y,z} a un vector de 63 features, con normalización
 * de rotación: rota el plano XY para que wrist→middle_mcp apunte siempre
 * hacia -Y. Esto hace el clasificador invariante a la inclinación de la mano
 * en la imagen.
 * Requiere landmarks ya normalizados por `normalizeLandmarks`.
 */
export function extractFeatures(landmarks: NormalizedLandmark[]): number[] {
  if (landmarks.length !== 21) {
    throw new Error(
      `extractFeatures: se esperan 21 landmarks, llegaron ${landmarks.length}`,
    );
  }
  // Landmark 9 = middle_finger_mcp; tras normalizeLandmarks apunta hacia (0,-1,0)
  // pero puede haber una inclinación residual en el plano XY → corregir.
  const mcp = landmarks[9]!;
  const angle = Math.atan2(mcp.x, -mcp.y); // ángulo que hay que deshacer
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const out = new Array<number>(63);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i]!;
    out[i * 3]     = p.x * cos - p.y * sin;
    out[i * 3 + 1] = p.x * sin + p.y * cos;
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
