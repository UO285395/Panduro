import fingerspellingData from "@/content/signs/fingerspelling.json";
import lexiconData from "@/content/signs/lexicon.json";
import type { Template } from "./knn";
import type { NormalizedLandmark } from "@/lib/mediapipe/types";

/** Formato del JSON de plantillas del alfabeto dactilológico. */
export type FingerspellingJson = {
  version: number;
  letters: Record<
    string,
    {
      translation: string;
      description: string;
      templates: NormalizedLandmark[][];
      templateSource?: "synthetic" | "captured";
    }
  >;
};

type LexiconJson = {
  version: number;
  signs: Record<
    string,
    {
      templates: NormalizedLandmark[][];
      templateSource?: "synthetic" | "captured";
    }
  >;
};

const source = fingerspellingData as FingerspellingJson;
const lexicon = lexiconData as LexiconJson;

/** Metadatos por letra (traducción y descripción). */
export function getLetterMeta(letterId: string) {
  return source.letters[letterId];
}

/** Todas las letras conocidas (A–Z + Ñ), ordenadas alfabéticamente. */
export function listLetters(): string[] {
  return Object.keys(source.letters).sort();
}

/** Plantillas globales cargadas desde el repo: alfabeto + signos léxicos. */
export function loadGlobalTemplates(): Template[] {
  const out: Template[] = [];
  for (const [letter, entry] of Object.entries(source.letters)) {
    for (const landmarks of entry.templates) {
      out.push({ label: letter, features: flatten(landmarks) });
    }
  }
  for (const [signId, entry] of Object.entries(lexicon.signs)) {
    for (const landmarks of entry.templates) {
      out.push({ label: signId, features: flatten(landmarks) });
    }
  }
  return out;
}

/** Nº de plantillas cargadas para una etiqueta (letra o signo). */
export function globalTemplateCount(label: string): number {
  if (source.letters[label]) return source.letters[label]!.templates.length;
  if (lexicon.signs[label]) return lexicon.signs[label]!.templates.length;
  return 0;
}

function flatten(landmarks: NormalizedLandmark[]): number[] {
  const out: number[] = new Array(landmarks.length * 3);
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]!;
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plantillas personales (localStorage). Permiten auto-calibración por usuario.
// ---------------------------------------------------------------------------

const LOCAL_KEY = "panduro:templates";

type LocalStore = {
  version: 1;
  templatesByLetter: Record<string, number[][]>; // features aplanadas
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readLocal(): LocalStore {
  if (!isBrowser()) return { version: 1, templatesByLetter: {} };
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { version: 1, templatesByLetter: {} };
    const parsed = JSON.parse(raw) as LocalStore;
    if (parsed.version !== 1) return { version: 1, templatesByLetter: {} };
    return parsed;
  } catch {
    return { version: 1, templatesByLetter: {} };
  }
}

function writeLocal(store: LocalStore) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
  } catch {
    // localStorage lleno o denegado — ignoramos.
  }
}

export function loadLocalTemplates(): Template[] {
  const store = readLocal();
  const out: Template[] = [];
  for (const [letter, list] of Object.entries(store.templatesByLetter)) {
    for (const features of list) {
      out.push({ label: letter, features });
    }
  }
  return out;
}

export function saveLocalTemplate(letter: string, features: number[]) {
  const store = readLocal();
  const list = store.templatesByLetter[letter] ?? [];
  list.push(features);
  store.templatesByLetter[letter] = list;
  writeLocal(store);
}

export function clearLocalTemplates() {
  if (!isBrowser()) return;
  localStorage.removeItem(LOCAL_KEY);
}

export function localTemplateCounts(): Record<string, number> {
  const store = readLocal();
  const out: Record<string, number> = {};
  for (const [letter, list] of Object.entries(store.templatesByLetter)) {
    out[letter] = list.length;
  }
  return out;
}

/** Exporta todas las plantillas locales a un JSON con la misma forma del semilla. */
export function exportLocalTemplatesAsJson(): FingerspellingJson {
  const store = readLocal();
  const letters: FingerspellingJson["letters"] = {};
  for (const [letter, entry] of Object.entries(source.letters)) {
    const localFlat = store.templatesByLetter[letter] ?? [];
    const localLandmarks: NormalizedLandmark[][] = localFlat.map((flat) => {
      const out: NormalizedLandmark[] = new Array(21);
      for (let i = 0; i < 21; i++) {
        out[i] = { x: flat[i * 3]!, y: flat[i * 3 + 1]!, z: flat[i * 3 + 2]! };
      }
      return out;
    });
    letters[letter] = {
      translation: entry.translation,
      description: entry.description,
      templates: [...entry.templates, ...localLandmarks],
    };
  }
  return { version: source.version, letters };
}
