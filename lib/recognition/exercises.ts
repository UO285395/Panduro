import type { SignCandidate } from "@/lib/esku/domain/recognition/value-objects/Gloss";
import { WEAK_LETTERS } from "@/lib/esku/infrastructure/recognition/CtcAlphabetClassifier";
import { type Prediction, type Template, withoutSameHandshape } from "./knn";

/**
 * Cuándo dan por buena la seña los ejercicios de cámara. Aparte de los componentes para que
 * scripts/measure-camera.ts mida con las mismas reglas que la app.
 */

/** El mismo umbral con el que el traductor escribe una letra. */
export const LETTER_ACCEPT = 0.5;
/** Letras que el modelo reconoce peor: basta con que aparezcan entre las 3 primeras. */
export const LETTER_ACCEPT_WEAK = 0.25;

export const isWeakLetter = (letter: string) =>
  WEAK_LETTERS.includes(letter.toLowerCase());

/**
 * Letras que el modelo no reconoce hechas sueltas. Medido con scripts/measure-camera.ts sobre
 * las letras del DILSE y de Spread the Sign: ninguna de las dos personas pasa y la letra no
 * llega al 10 % en ningún fotograma. La Ñ la ve como N (no distingue el movimiento), la Y y la
 * Z como I, y la Q no la ve. En ellas el ejercicio no puede corregir y lo dice quien aprende.
 */
export const UNRECOGNIZED_LETTERS = ["Ñ", "Q", "Y", "Z"];

export const isUnrecognizedLetter = (letter: string) =>
  UNRECOGNIZED_LETTERS.includes(letter.toUpperCase());

/** Lo que dice el modelo de letras en un fotograma, ¿es la letra pedida? */
export function letterAccepted(
  candidates: readonly SignCandidate[],
  letter: string,
): boolean {
  const target = letter.toUpperCase();
  if (isWeakLetter(target)) {
    return candidates.some(
      (c) => c.gloss.text === target && c.confidence >= LETTER_ACCEPT_WEAK,
    );
  }
  const top = candidates[0];
  return top?.gloss.text === target && top.confidence >= LETTER_ACCEPT;
}

/**
 * Lo más lejos que puede estar la mano de la plantilla más parecida para contar como esa forma.
 * Medido entre dos personas con las letras (plantillas del DILSE, manos de Spread the Sign):
 * la misma forma queda por debajo el 83 % de las veces y una forma distinta, el 11 %. Sin este
 * límite, cualquier mano acaba votando por la plantilla menos lejana aunque no se parezca.
 */
export const HANDSHAPE_MAX_DISTANCE = 2.5;

/**
 * Contra qué plantillas se compara la mano en «Signa la palabra»: las del signo pedido y las de
 * los otros signos de la lección. Contra las de todo el curso, una forma de mano compartida
 * por muchos signos acaba ganándola casi siempre otro (medido con Spread the Sign: CÓMO
 * perdía con ESTRATEGIA, QUÉ con ESTUDIAR). Lo que tiene sentido comprobar es si se ha hecho
 * el signo pedido y no los otros que se acaban de aprender con él.
 */
export function lessonTemplates(
  all: Template[],
  target: string,
  lessonSigns: readonly string[],
): Template[] {
  const keep = new Set([target, ...lessonSigns]);
  return withoutSameHandshape(
    lessonSigns.length ? all.filter((t) => keep.has(t.label)) : all,
    target,
  );
}

/** «Signa la palabra» por forma de mano: se da por buena si se mantiene así de segura… */
export const WORD_EARLY_CONFIDENCE = 0.8;
/** …durante este tiempo seguido. */
export const WORD_EARLY_HOLD_MS = 350;

/**
 * La comprobación de «Signa la palabra» cuando el signo no está en el vocabulario del modelo:
 * solo la forma de la mano, fotograma a fotograma contra las plantillas. Vale en cuanto la
 * forma pedida se mantiene segura un momento o, al acabarse el tiempo, si es la más votada.
 */
export class HandshapeVote {
  readonly #votes: { label: string; confidence: number }[] = [];
  #highSince: number | null = null;

  constructor(
    private readonly target: string,
    private readonly minConfidence: number,
  ) {}

  /** Un fotograma con mano clasificado; true si ya se puede dar por bueno. */
  push(
    { label, confidence, distance }: Prediction,
    timestampMs: number,
  ): boolean {
    if (distance > HANDSHAPE_MAX_DISTANCE) {
      this.lost();
      return false;
    }
    this.#votes.push({ label, confidence });
    if (label === this.target && confidence >= WORD_EARLY_CONFIDENCE) {
      this.#highSince ??= timestampMs;
      return timestampMs - this.#highSince >= WORD_EARLY_HOLD_MS;
    }
    this.#highSince = null;
    return false;
  }

  /** Un fotograma sin mano: la forma ya no se está manteniendo. */
  lost(): void {
    this.#highSince = null;
  }

  /** Al acabarse el tiempo: la forma más votada, si es la pedida y con confianza suficiente. */
  verdict(): boolean {
    const counts = new Map<string, { n: number; conf: number }>();
    for (const v of this.#votes) {
      const c = counts.get(v.label) ?? { n: 0, conf: 0 };
      c.n += 1;
      c.conf += v.confidence;
      counts.set(v.label, c);
    }
    let winner = "";
    let best = { n: -1, conf: 0 };
    for (const [label, c] of counts)
      if (c.n > best.n) [winner, best] = [label, c];
    return (
      winner === this.target &&
      best.conf / Math.max(1, best.n) >= this.minConfidence
    );
  }
}
