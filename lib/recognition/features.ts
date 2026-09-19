import type { NormalizedLandmark } from "@/lib/mediapipe/types";

// Índices MediaPipe Hand Landmarks:
//  0=wrist  4=thumb_tip  8=index_tip  12=middle_tip  16=ring_tip  20=pinky_tip
//  5=index_mcp  9=middle_mcp  13=ring_mcp  17=pinky_mcp
//  6=index_pip  10=middle_pip  14=ring_pip  18=pinky_pip

const TIPS   = [4,  8, 12, 16, 20] as const;
const MCPS   = [2,  5,  9, 13, 17] as const;
const PIPS   = [3,  6, 10, 14, 18] as const;

function dist3(a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/**
 * Extrae un vector de features de 63+15 = 78 dimensiones desde los 21 landmarks:
 *   - 63: coordenadas rotadas wrist-centradas (invariante a inclinación XY)
 *   - 5: distancias punta→palma (dedos doblados vs extendidos)
 *   - 5: apertura entre punta del pulgar y cada dedo (configuración relativa)
 *   - 5: curvatura por dedo (ángulo MCP→PIP→TIP, aprox. mediante dist ratios)
 * Requiere landmarks ya normalizados por `normalizeLandmarks`.
 */
export function extractFeatures(landmarks: NormalizedLandmark[]): number[] {
  if (landmarks.length !== 21) {
    throw new Error(
      `extractFeatures: se esperan 21 landmarks, llegaron ${landmarks.length}`,
    );
  }
  // Rotación en el plano XY: wrist→middle_mcp apunta hacia -Y
  const mcp = landmarks[9]!;
  const angle = Math.atan2(mcp.x, -mcp.y);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  // Rotar todos los landmarks
  const rot: {x:number;y:number;z:number}[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i]!;
    rot[i] = { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: p.z };
  }

  const out: number[] = new Array(63 + 15);

  // Bloque 1: coordenadas planas (63)
  for (let i = 0; i < 21; i++) {
    const p = rot[i]!;
    out[i * 3]     = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }

  // Bloque 2: distancia punta→muñeca para cada dedo (5) — mide extensión
  const wrist = rot[0]!;
  for (let i = 0; i < 5; i++) {
    out[63 + i] = dist3(rot[TIPS[i]]!, wrist);
  }

  // Bloque 3: distancia punta-del-pulgar→cada punta (5) — captura apertura
  const thumbTip = rot[TIPS[0]]!;
  for (let i = 0; i < 5; i++) {
    out[68 + i] = dist3(rot[TIPS[i]]!, thumbTip);
  }

  // Bloque 4: curvatura por dedo = dist(MCP,TIP) / (dist(MCP,PIP)+dist(PIP,TIP)) (5)
  // Ratio ≈1 cuando el dedo está extendido, <1 cuando está curvado
  for (let i = 0; i < 5; i++) {
    const mcpP = rot[MCPS[i]]!;
    const pipP = rot[PIPS[i]]!;
    const tipP = rot[TIPS[i]]!;
    const direct = dist3(mcpP, tipP);
    const via    = dist3(mcpP, pipP) + dist3(pipP, tipP);
    out[73 + i] = via > 1e-5 ? direct / via : 1;
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
