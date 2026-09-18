import type { HandFrame, NormalizedLandmark } from "@/lib/mediapipe/types";
import {
  HOLD_MS,
  HOLD_SAMPLE_FRAMES,
  WRIST_VELOCITY_HOLD,
} from "./constants";
import type { SegmentEvent, SegmentPhase, SegmentState } from "./types";

/**
 * Segmentador temporal para signos aislados. Consume `HandFrame | null` en
 * cada tick (30 fps) y emite eventos:
 *
 *   start  → la mano acaba de entrar en cámara / empezar a moverse.
 *   hold   → la mano lleva HOLD_MS con velocidad de muñeca baja: el segmento
 *            está listo para clasificar. Se acompaña de un centroid: la
 *            media de las últimas HOLD_SAMPLE_FRAMES muestras normalizadas.
 *   end    → la mano ha vuelto a moverse o ha salido del cuadro.
 *
 * La máquina de estados es sencilla y determinista para poder testarla.
 */
export class SegmentStream {
  private phase: SegmentPhase = "idle";
  private missingMs = 0;
  private stableMsAccum = 0;
  private lastWrist: NormalizedLandmark | null = null;
  private lastTs = 0;
  private buffer: NormalizedLandmark[][] = [];
  private didFireHoldForCurrent = false;

  push(frame: HandFrame | null, nowMs: number): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    const dt = this.lastTs === 0 ? 0 : nowMs - this.lastTs;
    this.lastTs = nowMs;

    if (!frame) {
      this.missingMs += dt;
      if (this.phase !== "idle") {
        this.reset();
        events.push({ kind: "end", at: nowMs });
      }
      return events;
    }

    // Reset del contador de ausencia.
    this.missingMs = 0;

    const wrist = frame.normalized[0]!;
    const velocity = this.lastWrist ? distance(wrist, this.lastWrist) : Infinity;
    this.lastWrist = wrist;

    if (this.phase === "idle") {
      this.phase = "moving";
      events.push({ kind: "start", at: nowMs });
    }

    const stable = velocity <= WRIST_VELOCITY_HOLD;
    if (stable) {
      this.stableMsAccum += dt;
      // Buffer de últimas N muestras para el centroid.
      this.buffer.push(frame.normalized);
      if (this.buffer.length > HOLD_SAMPLE_FRAMES) this.buffer.shift();

      if (this.stableMsAccum >= HOLD_MS && !this.didFireHoldForCurrent) {
        this.phase = "holding";
        this.didFireHoldForCurrent = true;
        events.push({
          kind: "hold",
          at: nowMs,
          centroid: averageLandmarks(this.buffer),
        });
      }
    } else {
      // La mano se ha vuelto a mover: reset del acumulador y estado.
      if (this.phase === "holding") {
        events.push({ kind: "end", at: nowMs });
      }
      this.phase = "moving";
      this.stableMsAccum = 0;
      this.buffer = [];
      this.didFireHoldForCurrent = false;
    }

    return events;
  }

  state(): SegmentState & { stableMs: number } {
    return { phase: this.phase, lastFrame: null, missingMs: this.missingMs, stableMs: this.stableMsAccum };
  }

  /** Ultimo buffer de landmarks disponible, para "Capturar ahora". */
  lastBuffer(): NormalizedLandmark[][] {
    return this.buffer;
  }

  private reset() {
    this.phase = "idle";
    this.stableMsAccum = 0;
    this.buffer = [];
    this.lastWrist = null;
    this.didFireHoldForCurrent = false;
  }
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function averageLandmarks(frames: NormalizedLandmark[][]): NormalizedLandmark[] {
  if (frames.length === 0) return [];
  const n = frames[0]!.length;
  const out: NormalizedLandmark[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const f of frames) {
      x += f[i]!.x;
      y += f[i]!.y;
      z += f[i]!.z;
    }
    out[i] = { x: x / frames.length, y: y / frames.length, z: z / frames.length };
  }
  return out;
}
