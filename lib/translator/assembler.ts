import { getSign } from "@/lib/curriculum/loader";
import { getLetterMeta } from "@/lib/recognition/templates";
import { DEDUPE_MS, SENTENCE_PAUSE_MS, SPACE_PAUSE_MS } from "./constants";

export type AssemblerInput = {
  /** Etiqueta cruda del clasificador ("HOLA", "A"…). */
  label: string;
  confidence: number;
  /** Cuándo se consolidó el signo. */
  at: number;
};

export type AssemblerFrame = {
  /** Texto acumulado hasta ahora (con signos anteriores). */
  text: string;
  /** Signo activo (para pintar en el chip). */
  active: {
    label: string;
    display: string;
    confidence: number;
  } | null;
};

type Entry = { label: string; display: string; at: number; kind: "letter" | "word" };

/**
 * Máquina que va construyendo texto a partir de signos reconocidos.
 * Reglas:
 *  - Duplicado del mismo signo dentro de DEDUPE_MS → se ignora (rebote).
 *  - Letras (dactilología) se concatenan sin espacio.
 *  - Espacio si el último signo es una letra y `tick(now)` ve pausa >= SPACE_PAUSE_MS.
 *  - Punto y capitalización si la pausa >= SENTENCE_PAUSE_MS.
 *  - Signos léxicos (HOLA, GRACIAS…) se resuelven a su `translation` y se
 *    escriben con mayúscula inicial + espacio antes.
 */
export class TextAssembler {
  private entries: Entry[] = [];
  private lastSignAt = 0;
  private sentenceEnded = false;
  private lastAppendedSpace = false;

  consume(input: AssemblerInput): void {
    const now = input.at;
    if (
      this.entries.length > 0 &&
      this.entries[this.entries.length - 1]!.label === input.label &&
      now - this.lastSignAt < DEDUPE_MS
    ) {
      return; // rebote
    }
    const isLetter = isFingerspellingLabel(input.label);
    const display = isLetter
      ? getLetterMeta(input.label)?.translation ?? input.label
      : getSign(input.label)?.translation ?? input.label;
    this.entries.push({
      label: input.label,
      display,
      at: now,
      kind: isLetter ? "letter" : "word",
    });
    this.lastSignAt = now;
    this.sentenceEnded = false;
    this.lastAppendedSpace = false;
  }

  /**
   * `tick(now)` sin nueva señal: comprueba si hay que aplicar reglas de pausa.
   * Se llama en cada frame del RAF loop desde la UI.
   */
  tick(now: number): void {
    if (this.entries.length === 0) return;
    const idle = now - this.lastSignAt;
    if (idle >= SENTENCE_PAUSE_MS && !this.sentenceEnded) {
      this.sentenceEnded = true;
      return;
    }
    if (idle >= SPACE_PAUSE_MS && !this.lastAppendedSpace) {
      this.lastAppendedSpace = true;
    }
  }

  currentFrame(now = this.lastSignAt): AssemblerFrame {
    this.tick(now);
    return { text: this.render(), active: this.activeSign() };
  }

  reset(): void {
    this.entries = [];
    this.lastSignAt = 0;
    this.sentenceEnded = false;
    this.lastAppendedSpace = false;
  }

  private render(): string {
    if (this.entries.length === 0) return "";
    let out = "";
    let previousKind: Entry["kind"] | null = null;
    let capitalize = true;

    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      const next = this.entries[i + 1];
      const gapToNext = next ? next.at - e.at : 0;

      const chunk = capitalize
        ? capitalizeFirst(e.display)
        : e.kind === "letter"
          ? e.display
          : e.display.toLowerCase();

      if (previousKind === "letter" && e.kind === "letter") {
        // Concatena letras salvo que la pausa fuera >= SPACE_PAUSE_MS
        if (gapFromPrev(this.entries, i) >= SPACE_PAUSE_MS) out += " ";
      } else if (previousKind !== null) {
        out += " ";
      }
      out += chunk;
      capitalize = false;
      previousKind = e.kind;

      if (next && gapToNext >= SENTENCE_PAUSE_MS) {
        out += ".";
        capitalize = true;
      }
    }
    // Punto final si la sesión ha cerrado la frase actual
    if (this.sentenceEnded && !out.endsWith(".")) out += ".";
    return out;
  }

  private activeSign() {
    const last = this.entries[this.entries.length - 1];
    if (!last) return null;
    return { label: last.label, display: last.display, confidence: 1 };
  }
}

function isFingerspellingLabel(label: string): boolean {
  return /^[A-ZÑ]$/.test(label);
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

function gapFromPrev(entries: Entry[], i: number): number {
  if (i === 0) return Infinity;
  return entries[i]!.at - entries[i - 1]!.at;
}
