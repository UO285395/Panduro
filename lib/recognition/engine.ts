"use client";

import { RecognizeSignsUseCase } from "@/lib/esku/application/use-cases/RecognizeSignsUseCase";
import { TeachCustomSignUseCase } from "@/lib/esku/application/use-cases/TeachCustomSignUseCase";
import { CtcAlphabetClassifier } from "@/lib/esku/infrastructure/recognition/CtcAlphabetClassifier";
import { PrototypeSignClassifier } from "@/lib/esku/infrastructure/recognition/PrototypeSignClassifier";
import { VocabularySignClassifier } from "@/lib/esku/infrastructure/recognition/VocabularySignClassifier";
import { MediaPipeLandmarkSource } from "@/lib/esku/infrastructure/vision/MediaPipeLandmarkSource";
import {
  FACE_LANDMARKER_MODEL_URL,
  HAND_LANDMARKER_MODEL_URL,
  POSE_LITE_MODEL_URL,
  WASM_BASE_URL,
} from "@/lib/mediapipe/constants";
import { IndexedDBCustomSignRepository } from "./customSigns";
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
 * Motor completo para el traductor: alfabeto CTC por fotograma, y por signo completo el
 * vocabulario GRU y los signos que ha enseñado el usuario (prototipos), orquestados por
 * RecognizeSignsUseCase. Cada motor se puede apagar según el modo.
 */
export function createRecognizer(video: HTMLVideoElement, mode: TranslateMode = "signs") {
  const source = createLandmarkSource(video);
  const alphabetEngine = createAlphabet();
  const vocabularyEngine = createVocabulary();
  const alphabet = new SwitchableClassifier(alphabetEngine, () => alphabetEngine.reset());
  const vocabulary = new SwitchableClassifier(vocabularyEngine);
  const repository = new IndexedDBCustomSignRepository();
  const taughtEngine = new PrototypeSignClassifier(repository);
  const taught = new SwitchableClassifier(taughtEngine);
  const recognize = new RecognizeSignsUseCase(source, [alphabet, vocabulary, taught]);

  const recognizer = {
    source,
    alphabet,
    vocabulary,
    recognize,
    repository,
    teach: new TeachCustomSignUseCase(repository),
    /** Tras enseñar o borrar, para que se reconozca ya y no tras recargar. */
    refreshTaught: () => taughtEngine.refresh(),
    /** Descarga modelos y pesos (~20 MB la primera vez; luego los sirve la caché del navegador). */
    async load() {
      // Sin IndexedDB (ventana privada) no hay signos enseñados, pero lo demás funciona.
      await Promise.all([source.load(), alphabet.load(), vocabulary.load(), taught.load().catch(() => {})]);
    },
    setMode(next: TranslateMode) {
      alphabet.enabled = next !== "signs";
      vocabulary.enabled = next !== "letters";
      taught.enabled = next !== "letters";
      alphabet.reset();
    },
  };
  recognizer.setMode(mode);
  return recognizer;
}

export type Recognizer = ReturnType<typeof createRecognizer>;
