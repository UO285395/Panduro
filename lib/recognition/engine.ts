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

/** Cámara → manos, pose y cara con MediaPipe, con la configuración de Esku. */
export function createLandmarkSource(video: HTMLVideoElement) {
  return new MediaPipeLandmarkSource(video, {
    wasmPath: WASM_BASE_URL,
    handModelPath: HAND_LANDMARKER_MODEL_URL,
    poseModelPath: POSE_LITE_MODEL_URL,
    faceModelPath: FACE_LANDMARKER_MODEL_URL,
    maxHands: 2,
    faceIntervalMs: 1000,
  });
}

export const createAlphabet = () =>
  new CtcAlphabetClassifier("/models/lse-alphabet.json", "/models/lse-alphabet.bin");

export const createVocabulary = () =>
  new VocabularySignClassifier(VOCABULARY_MANIFEST_URL, "/models/lse-vocabulary.bin");

let manifestConcepts: Promise<string[]> | null = null;

/** Glosas que conoce el modelo de vocabulario (se descarga una vez). */
export function vocabularyConcepts(): Promise<string[]> {
  manifestConcepts ??= fetch(VOCABULARY_MANIFEST_URL)
    .then((r) => r.json() as Promise<{ concepts: string[]; abstentionConcept: string | null }>)
    .then((m) => m.concepts.filter((c) => c !== m.abstentionConcept))
    .catch(() => {
      manifestConcepts = null;
      return [];
    });
  return manifestConcepts;
}

/**
 * Motor completo para el traductor: alfabeto CTC por fotograma y vocabulario GRU por signo
 * completo, orquestados por RecognizeSignsUseCase.
 */
export function createRecognizer(video: HTMLVideoElement) {
  const source = createLandmarkSource(video);
  const alphabet = createAlphabet();
  const vocabulary = createVocabulary();
  const classifiers = [alphabet, vocabulary];
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
