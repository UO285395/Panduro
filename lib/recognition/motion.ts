import type { NormalizedLandmark } from "@/lib/mediapipe/types";

export type MotionGesture = "WAVE_H" | "WAVE_V" | "PUSH_FORWARD" | "NONE";

type Sample = { x: number; y: number; z: number; t: number };

/**
 * Buffers wrist positions over a sliding window and classifies
 * the dominant motion gesture via direction-reversal counting.
 */
export class MotionBuffer {
  private samples: Sample[] = [];
  private readonly windowMs: number;

  constructor(windowMs = 1200) {
    this.windowMs = windowMs;
  }

  /** Push current wrist landmark (index 0 of normalized landmarks). */
  push(wrist: NormalizedLandmark, t: number): void {
    this.samples.push({ x: wrist.x, y: wrist.y, z: wrist.z, t });
    const cutoff = t - this.windowMs;
    let start = 0;
    while (start < this.samples.length && this.samples[start]!.t < cutoff) start++;
    if (start > 0) this.samples = this.samples.slice(start);
  }

  classify(): MotionGesture {
    if (this.samples.length < 8) return "NONE";

    const xs = this.samples.map((s) => s.x);
    const ys = this.samples.map((s) => s.y);
    const zs = this.samples.map((s) => s.z);

    const rangeX = range(xs);
    const rangeY = range(ys);
    const reversalsX = countReversals(xs);
    const reversalsY = countReversals(ys);

    // Horizontal wave: dominant axis X, at least 3 direction changes, range > 0.07
    if (rangeX > 0.07 && reversalsX >= 3 && rangeX > rangeY) return "WAVE_H";

    // Vertical wave: dominant axis Y, at least 3 direction changes, range > 0.07
    if (rangeY > 0.07 && reversalsY >= 3 && rangeY > rangeX) return "WAVE_V";

    // Forward push: net Z displacement > 0.08 in the window (Z decreases toward camera)
    const firstZ = zs.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const lastZ = zs.slice(-3).reduce((s, v) => s + v, 0) / 3;
    if (firstZ - lastZ > 0.08) return "PUSH_FORWARD";

    return "NONE";
  }

  reset(): void {
    this.samples = [];
  }
}

function range(xs: number[]): number {
  let lo = xs[0]!;
  let hi = xs[0]!;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return hi - lo;
}

/** Count direction reversals in a smoothed signal. */
function countReversals(xs: number[]): number {
  if (xs.length < 3) return 0;
  // Smooth with a 3-sample average
  const smoothed: number[] = [];
  for (let i = 1; i < xs.length - 1; i++) {
    smoothed.push((xs[i - 1]! + xs[i]! + xs[i + 1]!) / 3);
  }
  const minDelta = 0.008;
  let reversals = 0;
  let lastDir = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i]! - smoothed[i - 1]!;
    if (Math.abs(delta) < minDelta) continue;
    const dir = delta > 0 ? 1 : -1;
    if (lastDir !== 0 && dir !== lastDir) reversals++;
    lastDir = dir;
  }
  return reversals;
}
