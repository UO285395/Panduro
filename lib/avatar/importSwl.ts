import type { Point3 } from "@/lib/mediapipe/types";
import { assignHands, framesToClip, type CaptureFrame, type CaptureResult } from "./capture";

/** Formato que escribe scripts/swl_lse_export.py. */
type Triple = [number, number, number];
export type SwlFrame = {
  poseWorld: [number, number, number, number][] | null;
  /** Muñecas izquierda y derecha de la pose, en coordenadas de imagen. */
  wrists: [Triple, Triple] | null;
  hands: { image: Triple[]; world: Triple[] }[];
};
export type SwlSample = { sample: string; label: string; frames: SwlFrame[] };
export type SwlExport = {
  source: string;
  license: string;
  doi: string;
  fps: number;
  signs: Record<string, SwlSample[]>;
};

const toPoint = (a: readonly number[]): Point3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });

export function toCaptureFrames(frames: SwlFrame[], fps: number): CaptureFrame[] {
  return frames.map((f, i) => {
    const poseImage: Point3[] = [];
    if (f.wrists) {
      poseImage[15] = toPoint(f.wrists[0]);
      poseImage[16] = toPoint(f.wrists[1]);
    }
    const hands = f.hands.map((h) => ({ image: h.image.map(toPoint), world: h.world.map(toPoint) }));
    return {
      t: (i * 1000) / fps,
      poseWorld: f.poseWorld ? f.poseWorld.map((a) => ({ ...toPoint(a), visibility: a[3] })) : null,
      hands: f.wrists ? assignHands(poseImage, hands) : {},
    };
  });
}

/**
 * Convierte una muestra con la mano que de verdad signa: el corpus tiene signantes zurdos,
 * y en ese caso su mano izquierda anima la derecha del avatar en espejo.
 */
export function convertSample(
  frames: SwlFrame[],
  fps: number,
): { result: CaptureResult; leftHanded: boolean } {
  const capture = toCaptureFrames(frames, fps);
  const right = framesToClip(capture);
  const left = framesToClip(capture, { leftHanded: true });
  if (!right.ok) return left.ok ? { result: left, leftHanded: true } : { result: right, leftHanded: false };
  if (!left.ok) return { result: right, leftHanded: false };
  const activity = (r: typeof right & { ok: true }) => r.stats.durationMs * r.stats.handRate;
  return activity(left) > activity(right) * 1.2
    ? { result: left, leftHanded: true }
    : { result: right, leftHanded: false };
}
