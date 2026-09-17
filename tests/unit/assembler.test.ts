import { describe, expect, it } from "vitest";
import { TextAssembler } from "@/lib/translator/assembler";
import { SENTENCE_PAUSE_MS, SPACE_PAUSE_MS } from "@/lib/translator/constants";

describe("TextAssembler", () => {
  it("concatena letras de dactilología sin espacios (M+A+R → MAR)", () => {
    const a = new TextAssembler();
    a.consume({ label: "M", confidence: 0.9, at: 0 });
    a.consume({ label: "A", confidence: 0.9, at: 400 });
    a.consume({ label: "R", confidence: 0.9, at: 800 });
    const f = a.currentFrame(1000);
    expect(f.text).toBe("MAR");
  });

  it("respeta el rebote: repetir la misma letra en <400 ms no la duplica", () => {
    const a = new TextAssembler();
    a.consume({ label: "A", confidence: 0.9, at: 0 });
    a.consume({ label: "A", confidence: 0.9, at: 200 });
    const f = a.currentFrame(400);
    expect(f.text).toBe("A");
  });

  it("añade espacio entre letras separadas por >= SPACE_PAUSE_MS (dactilología → palabras)", () => {
    const a = new TextAssembler();
    a.consume({ label: "H", confidence: 0.9, at: 0 });
    a.consume({ label: "I", confidence: 0.9, at: 300 });
    // Larga pausa antes de la siguiente letra:
    a.consume({ label: "T", confidence: 0.9, at: 300 + SPACE_PAUSE_MS + 100 });
    a.consume({ label: "U", confidence: 0.9, at: 300 + SPACE_PAUSE_MS + 400 });
    const f = a.currentFrame(300 + SPACE_PAUSE_MS + 800);
    expect(f.text).toBe("HI TU");
  });

  it("cierra la frase con punto cuando pasa >= SENTENCE_PAUSE_MS de inactividad", () => {
    const a = new TextAssembler();
    a.consume({ label: "A", confidence: 0.9, at: 0 });
    const f = a.currentFrame(SENTENCE_PAUSE_MS + 50);
    expect(f.text.endsWith(".")).toBe(true);
  });

  it("mezcla signo léxico con letras: HOLA + M + A", () => {
    // HOLA es un sign léxico del currículo (translation: "Hola").
    const a = new TextAssembler();
    a.consume({ label: "HOLA", confidence: 0.9, at: 0 });
    a.consume({ label: "M", confidence: 0.9, at: 500 });
    a.consume({ label: "A", confidence: 0.9, at: 900 });
    const f = a.currentFrame(1000);
    expect(f.text).toContain("Hola");
    expect(f.text).toContain("MA");
  });

  it("reset() vacía el buffer", () => {
    const a = new TextAssembler();
    a.consume({ label: "A", confidence: 0.9, at: 0 });
    a.reset();
    expect(a.currentFrame(100).text).toBe("");
  });
});
