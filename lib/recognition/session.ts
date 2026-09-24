import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import type { ISignClassifier } from "@/lib/esku/domain/recognition/services/ISignClassifier";
import type { SignCandidate } from "@/lib/esku/domain/recognition/value-objects/Gloss";
import type { TranscriptEntry } from "@/lib/esku/domain/transcript/entities/Transcript";

/**
 * Qué escucha el traductor. Con los dos motores a la vez, el de letras lee formas de mano
 * a mitad de un signo y el de vocabulario cierra ventanas mientras se deletrea: la mayor
 * fuente de confusiones al encadenar signos o letras.
 */
export type TranslateMode = "signs" | "letters" | "both";

/** Sin mano durante más de esto, el motor de letras olvida lo anterior. */
export const ALPHABET_RESET_MS = 400;

/**
 * Envuelve un motor para poder apagarlo sin reconstruir el caso de uso (que solo pregunta
 * a los motores listos) y para guardar sus últimas respuestas.
 *
 * El alfabeto CTC es una GRU con estado: su documentación pide reiniciarla cuando la mano
 * sale de cuadro, porque el estado de antes de una pausa describe algo que ya no está, y el
 * caso de uso de Esku no lo hace. `reset` se llama aquí tras `ALPHABET_RESET_MS` sin mano.
 */
export class SwitchableClassifier implements ISignClassifier {
  enabled = true;
  private handLostAt: number | null = null;

  constructor(
    private readonly inner: ISignClassifier,
    private readonly resetInner?: () => void,
  ) {}

  get id() {
    return this.inner.id;
  }

  get granularity() {
    return this.inner.granularity;
  }

  get lastScores() {
    return this.inner.lastScores;
  }

  get lastSignatureProfile() {
    return this.inner.lastSignatureProfile;
  }

  get lastAbstained() {
    return this.inner.lastAbstained;
  }

  isReady(): boolean {
    return this.enabled && this.inner.isReady();
  }

  load(): Promise<void> {
    return this.inner.load();
  }

  reset(): void {
    this.handLostAt = null;
    this.resetInner?.();
  }

  async classify(window: readonly LandmarkFrame[]): Promise<readonly SignCandidate[]> {
    const frame = window.at(-1);
    if (this.resetInner && frame) {
      if (frame.hands.length === 0) {
        this.handLostAt ??= frame.timestampMs;
      } else if (this.handLostAt !== null) {
        if (frame.timestampMs - this.handLostAt > ALPHABET_RESET_MS) this.resetInner();
        this.handLostAt = null;
      }
    }
    return this.inner.classify(window);
  }
}

/** Identifica una entrada del transcript (una letra y un signo pueden caer en el mismo fotograma). */
export const entryKey = (e: TranscriptEntry) => `${e.source}@${e.atMs}`;

/** Una pausa así entre dos letras separa palabras al deletrear. */
export const SPELLING_WORD_GAP_MS = 1500;

export type Token = {
  key: string;
  text: string;
  kind: "word" | "spelled";
  /** Entradas que forman el token: una para un signo, varias letras para un deletreo. */
  keys: string[];
};

/**
 * Transcript → palabras, con las correcciones del usuario aplicadas. Las letras seguidas
 * forman una palabra, salvo que medie una pausa larga; una corrección vacía borra el signo.
 */
export function tokenize(entries: readonly TranscriptEntry[], edits: ReadonlyMap<string, string>): Token[] {
  const tokens: Token[] = [];
  let spelled: Token | null = null;
  let lastLetterAt = -Infinity;
  for (const e of entries) {
    const key = entryKey(e);
    const text = edits.get(key) ?? e.text;
    if (e.source === "alphabet") {
      if (!spelled || e.atMs - lastLetterAt > SPELLING_WORD_GAP_MS) {
        spelled = { key, text: "", kind: "spelled", keys: [] };
        tokens.push(spelled);
      }
      spelled.text += text.toLowerCase();
      spelled.keys.push(key);
      lastLetterAt = e.atMs;
      continue;
    }
    spelled = null;
    if (text) tokens.push({ key, text, kind: "word", keys: [key] });
  }
  return tokens.filter((t) => t.text);
}

export function renderTokens(tokens: readonly Token[]): string {
  const sentence = tokens.map((t) => t.text).join(" ").trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Fotogramas por segundo reales de la cámara, sobre los últimos fotogramas. */
export class FpsMeter {
  private readonly stamps: number[] = [];

  push(timestampMs: number): void {
    if (timestampMs <= 0 || timestampMs === this.stamps.at(-1)) return;
    this.stamps.push(timestampMs);
    if (this.stamps.length > 15) this.stamps.shift();
  }

  get fps(): number | null {
    if (this.stamps.length < 3) return null;
    const span = this.stamps.at(-1)! - this.stamps[0]!;
    return span > 0 ? ((this.stamps.length - 1) * 1000) / span : null;
  }

  reset(): void {
    this.stamps.length = 0;
  }
}
