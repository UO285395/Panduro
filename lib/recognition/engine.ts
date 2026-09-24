"use client";

import { RecognizeSignsUseCase } from "@/lib/esku/application/use-cases/RecognizeSignsUseCase";
import { CtcAlphabetClassifier } from "@/lib/esku/infrastructure/recognition/CtcAlphabetClassifier";
import { VocabularySignClassifier } from "@/lib/esku/infrastructure/recognition/VocabularySignClassifier";
import { MediaPipeLandmarkSource } from "@/lib/esku/infrastructure/vision/MediaPipeLandmarkSource";
import {
  FACE_LANDMARKER_MODEL_URL,
  HAND_LANDMARKER_MODEL_URL,
  POSE_LITE_MODEL_URL,
  WASM_BASE_URL,
} from "@/lib/mediapipe/constants";

export const VOCABULARY_MANIFEST_URL = "/models/lse-vocabulary.json";

/**
 * Motor de reconocimiento de Esku con las rutas de Panduro: cámara → MediaPipe (manos,
 * pose y cara) → alfabeto CTC por fotograma y vocabulario GRU por signo completo.
 */
export function createRecognizer(video: HTMLVideoElement, opts: { vocabulary?: boolean } = {}) {
  const source = new MediaPipeLandmarkSource(video, {
    wasmPath: WASM_BASE_URL,
    handModelPath: HAND_LANDMARKER_MODEL_URL,
    poseModelPath: POSE_LITE_MODEL_URL,
    faceModelPath: FACE_LANDMARKER_MODEL_URL,
    maxHands: 2,
    faceIntervalMs: 1000,
  });
  const alphabet = new CtcAlphabetClassifier("/models/lse-alphabet.json", "/models/lse-alphabet.bin");
  const vocabulary =
    opts.vocabulary === false
      ? null
      : new VocabularySignClassifier(VOCABULARY_MANIFEST_URL, "/models/lse-vocabulary.bin");
  const classifiers = vocabulary ? [alphabet, vocabulary] : [alphabet];
  const recognize = new RecognizeSignsUseCase(source, classifiers);

  return {
    source,
    alphabet,
    vocabulary,
    recognize,
    /** Descarga modelos y pesos (~20 MB la primera vez; luego los sirve la caché del navegador). */
    async load() {
      await Promise.all([source.load(), ...classifiers.map((c) => c.load())]);
    },
  };
}

export type Recognizer = ReturnType<typeof createRecognizer>;
