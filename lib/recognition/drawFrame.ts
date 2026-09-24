import {
  ARM_CONNECTIONS,
  isVisible,
  TORSO_CONNECTIONS,
} from "@/lib/esku/domain/landmarks/value-objects/BodyLandmarks";
import { HAND_CONNECTIONS, type Landmark } from "@/lib/esku/domain/landmarks/value-objects/Landmark";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";

/** Pinta torso, brazos y manos del fotograma sobre un canvas del tamaño del vídeo. */
export function drawFrame(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  frame: LandmarkFrame | null,
) {
  if (!canvas || !video) return;
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const { width: w, height: h } = canvas;
  // MediaPipe rellena `visibility` a 0 en las manos: solo la pose la mide de verdad.
  const line = (
    pts: readonly Landmark[],
    pairs: readonly (readonly [number, number])[],
    checkVisibility: boolean,
  ) => {
    ctx.beginPath();
    for (const [a, b] of pairs) {
      const A = pts[a];
      const B = pts[b];
      if (!A || !B || (checkVisibility && (!isVisible(A) || !isVisible(B)))) continue;
      ctx.moveTo(A.x * w, A.y * h);
      ctx.lineTo(B.x * w, B.y * h);
    }
    ctx.stroke();
  };
  ctx.lineWidth = Math.max(2, w / 300);
  if (frame.pose) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    line(frame.pose.points, [...TORSO_CONNECTIONS, ...ARM_CONNECTIONS], true);
  }
  ctx.strokeStyle = "#f97316";
  for (const hand of frame.hands) line(hand.points, HAND_CONNECTIONS, false);
}
