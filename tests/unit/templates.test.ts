import { describe, expect, it } from "vitest";
import { getLetterMeta, listLetters, loadGlobalTemplates } from "@/lib/recognition/templates";

describe("fingerspelling templates", () => {
  it("expone las 27 letras A-Z + Ñ", () => {
    const letters = listLetters();
    expect(letters.length).toBe(27);
    expect(letters).toContain("A");
    expect(letters).toContain("Z");
    expect(letters).toContain("Ñ");
  });

  it("cada letra tiene translation y description", () => {
    for (const l of listLetters()) {
      const meta = getLetterMeta(l);
      expect(meta).toBeDefined();
      expect(meta!.translation).toBe(l);
      expect(meta!.description.length).toBeGreaterThan(10);
    }
  });

  it("loadGlobalTemplates devuelve una lista (posiblemente vacía en MVP)", () => {
    const templates = loadGlobalTemplates();
    expect(Array.isArray(templates)).toBe(true);
    // En MVP están vacías, pero si alguien las llena en el futuro deben
    // seguir un formato consistente.
    for (const t of templates) {
      expect(t.features.length).toBe(63);
    }
  });
});
