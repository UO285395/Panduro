"use client";

import type {
  HandLandmarker,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  DETECTION_CONFIDENCE,
  HAND_LANDMARKER_MODEL_URL,
  WASM_BASE_URL,
} from "./constants";
import { PerfWindow, normalizeLandmarks } from "./landmarks";
import type { HandFrame, Handedness } from "./types";

// TODO(hito-4): mover a Web Worker + OffscreenCanvas para no compartir hilo con la UI.

type DelegateMode = "GPU" | "CPU";

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTimestamp = -1;
  private perf = new PerfWindow();
  private delegate: DelegateMode = "GPU";

  async init(): Promise<{ delegate: DelegateMode }> {
    const { FilesetResolver, HandLandmarker } = await import(
      "@mediapipe/tasks-vision"
    );
    const files = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

    try {
      this.landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL_URL,
          delegate: "GPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
        minHandDetectionConfidence: DETECTION_CONFIDENCE,
        minHandPresenceConfidence: DETECTION_CONFIDENCE,
        minTrackingConfidence: DETECTION_CONFIDENCE,
      });
      this.delegate = "GPU";
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL_URL,
          delegate: "CPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
        minHandDetectionConfidence: DETECTION_CONFIDENCE,
      });
      this.delegate = "CPU";
    }
    return { delegate: this.delegate };
  }

  /**
   * Ejecuta la inferencia sobre el fotograma actual del <video>.
   * Devuelve null si no hay detección o si el frame es idéntico al anterior.
   */
  detect(video: HTMLVideoElement, tsMs: number): HandFrame | null {
    if (!this.landmarker) return null;
    if (video.currentTime === this.lastVideoTimestamp) return null;
    this.lastVideoTimestamp = video.currentTime;

    const t0 = performance.now();
    const result: HandLandmarkerResult = this.landmarker.detectForVideo(
      video,
      tsMs,
    );
    const inferenceMs = performance.now() - t0;
    this.perf.push(inferenceMs, tsMs);

    const landmarks = result.landmarks?.[0];
    const handedness = result.handedness?.[0]?.[0];
    if (!landmarks || landmarks.length !== 21 || !handedness) return null;

    const imageLandmarks = landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const normalized = normalizeLandmarks(imageLandmarks);

    return {
      timestamp: tsMs,
      inferenceMs,
      imageLandmarks,
      normalized,
      handedness: handedness.categoryName as Handedness,
      handednessScore: handedness.score ?? 0,
    };
  }

  stats() {
    return this.perf.stats();
  }

  currentDelegate(): DelegateMode {
    return this.delegate;
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.perf.reset();
  }
}
