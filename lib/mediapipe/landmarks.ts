import type { NormalizedLandmark, PerfStats, Point3, RawLandmark } from "./types";
import { MIDDLE_MCP, PERF_WINDOW_FRAMES, WRIST } from "./constants";

/**
 * Distancia euclídea 3D entre dos puntos.
 */
export function distance(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Ángulo (rad) en el vértice `b` del triángulo (a,b,c).
 * Devuelve NaN si alguno de los brazos tiene longitud 0.
 */
export function angleAt(a: Point3, b: Point3, c: Point3): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = a.z - b.z;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = c.z - b.z;

  const dot = bax * bcx + bay * bcy + baz * bcz;
  const lenBa = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const lenBc = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
  if (lenBa === 0 || lenBc === 0) return Number.NaN;
  const cos = Math.max(-1, Math.min(1, dot / (lenBa * lenBc)));
  return Math.acos(cos);
}

/**
 * Normaliza 21 landmarks:
 *  1. Traslada de forma que la muñeca (idx 0) quede en el origen.
 *  2. Escala uniformemente para que |wrist → middle_mcp| = 1.
 *
 * El resultado es invariante a la posición y al tamaño de la mano en la
 * imagen, condición necesaria para un clasificador robusto de configuración.
 */
export function normalizeLandmarks(hand: RawLandmark[]): NormalizedLandmark[] {
  if (hand.length === 0) return [];
  const wrist = hand[WRIST]!;
  const mcp = hand[MIDDLE_MCP] ?? wrist;
  const handLength = distance(wrist, mcp);
  const scale = handLength > 1e-6 ? 1 / handLength : 1;

  return hand.map((p) => ({
    x: (p.x - wrist.x) * scale,
    y: (p.y - wrist.y) * scale,
    z: (p.z - wrist.z) * scale,
  }));
}

/**
 * Contador de rendimiento con ventana móvil. Almacena latencia por frame
 * y timestamps para calcular FPS instantáneo.
 */
export class PerfWindow {
  private latencies: number[] = [];
  private timestamps: number[] = [];
  private capacity: number;

  constructor(capacity = PERF_WINDOW_FRAMES) {
    this.capacity = capacity;
  }

  push(latencyMs: number, timestampMs: number) {
    this.latencies.push(latencyMs);
    this.timestamps.push(timestampMs);
    if (this.latencies.length > this.capacity) {
      this.latencies.shift();
      this.timestamps.shift();
    }
  }

  stats(): PerfStats {
    const n = this.latencies.length;
    if (n === 0) return { fps: 0, p50: 0, p95: 0, samples: 0 };

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(n * 0.5)] ?? 0;
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0;

    let fps = 0;
    if (n >= 2) {
      const first = this.timestamps[0]!;
      const last = this.timestamps[n - 1]!;
      const dtSec = (last - first) / 1000;
      fps = dtSec > 0 ? (n - 1) / dtSec : 0;
    }
    return { fps, p50, p95, samples: n };
  }

  reset() {
    this.latencies = [];
    this.timestamps = [];
  }
}
