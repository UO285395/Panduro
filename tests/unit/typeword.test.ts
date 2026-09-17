import { describe, expect, it } from "vitest";
import { normalize } from "@/components/exercises/TypeWord";

describe("TypeWord.normalize", () => {
  it("es case-insensitive y quita acentos", () => {
    expect(normalize("Perdón")).toBe(normalize("perdon"));
    expect(normalize("PERDÓN")).toBe(normalize("perdon"));
  });

  it("quita signos de puntuación y trim", () => {
    expect(normalize("  Hola.  ")).toBe("hola");
    expect(normalize("¿Cómo estás?")).toBe("como estas");
  });
});
