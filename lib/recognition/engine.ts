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
import { SwitchableClassifier, type TranslateMode } from "./session";

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
 * completo, orquestados por RecognizeSignsUseCase. Cada motor se puede apagar según el modo.
 */
export function createRecognizer(video: HTMLVideoElement, mode: TranslateMode = "signs") {
  const source = createLandmarkSource(video);
  const alphabetEngine = createAlphabet();
  const vocabularyEngine = createVocabulary();
  const alphabet = new SwitchableClassifier(alphabetEngine, () => alphabetEngine.reset());
  const vocabulary = new SwitchableClassifier(vocabularyEngine);
  const recognize = new RecognizeSignsUseCase(source, [alphabet, vocabulary]);

  const recognizer = {
    source,
    alphabet,
    vocabulary,
    recognize,
    /** Descarga modelos y pesos (~20 MB la primera vez; luego los sirve la caché del navegador). */
    async load() {
      await Promise.all([source.load(), alphabet.load(), vocabulary.load()]);
    },
    setMode(next: TranslateMode) {
      alphabet.enabled = next !== "signs";
      vocabulary.enabled = next !== "letters";
      alphabet.reset();
    },
  };
  recognizer.setMode(mode);
  return recognizer;
}

export type Recognizer = ReturnType<typeof createRecognizer>;
