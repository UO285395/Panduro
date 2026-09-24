"use client";

import type { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { assignHands, type CaptureFrame, type HandSample } from "@/lib/avatar/capture";
import {
  DETECTION_CONFIDENCE,
  HAND_LANDMARKER_MODEL_URL,
  POSE_LANDMARKER_MODEL_URL,
  WASM_BASE_URL,
} from "./constants";
import type { Point3 } from "./types";

export type RecorderOutput = {
  frame: CaptureFrame;
  poseImage: Point3[] | null;
  handsImage: Point3[][];
};

const toPoint = (l: Point3): Point3 => ({ x: l.x, y: l.y, z: l.z });

/** Pose + dos manos por fotograma, para convertir un signo grabado en clip. */
export class SignRecorder {
  private pose: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private lastTs = 0;

  async init(): Promise<void> {
    const { FilesetResolver, PoseLandmarker, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const create = (delegate: "GPU" | "CPU") =>
      Promise.all([
        PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL_URL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
        HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: DETECTION_CONFIDENCE,
          minHandPresenceConfidence: DETECTION_CONFIDENCE,
          minTrackingConfidence: DETECTION_CONFIDENCE,
        }),
      ]);
    try {
      [this.pose, this.hands] = await create("GPU");
    } catch {
      [this.pose, this.hands] = await create("CPU");
    }
  }

  /** `t` es el tiempo del contenido (ms) que se guarda en el fotograma. */
  detect(video: HTMLVideoElement, t: number): RecorderOutput | null {
    if (!this.pose || !this.hands) return null;
    // MediaPipe exige marcas de tiempo crecientes aunque el vídeo se rebobine.
    const ts = Math.max(this.lastTs + 1, performance.now());
    this.lastTs = ts;
    const p = this.pose.detectForVideo(video, ts);
    const h = this.hands.detectForVideo(video, ts);

    const poseImage = p.landmarks?.[0]?.map(toPoint) ?? null;
    const poseWorld =
      p.worldLandmarks?.[0]?.map((l) => ({ ...toPoint(l), visibility: l.visibility })) ?? null;
    const samples: HandSample[] = (h.landmarks ?? [])
      .map((lm, i) => ({ image: lm.map(toPoint), world: (h.worldLandmarks?.[i] ?? []).map(toPoint) }))
      .filter((s) => s.world.length === 21);

    return {
      frame: { t, poseWorld, hands: assignHands(poseImage, samples) },
      poseImage,
      handsImage: samples.map((s) => s.image),
    };
  }

  close() {
    this.pose?.close();
    this.hands?.close();
    this.pose = null;
    this.hands = null;
  }
}
