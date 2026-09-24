import { describe, expect, it } from "vitest";
import manifest from "@/public/models/lse-vocabulary.json";
import { conceptFor, curriculumIdFor, glossKey } from "@/lib/recognition/vocabularyMap";
import { getSignsMap } from "@/lib/curriculum/loader";

describe("vocabularyMap", () => {
  it("normaliza variantes y notación de SWL-LSE", () => {
    expect(glossKey("CANSADO2")).toBe("CANSADO");
    expect(glossKey("A-PARTIR-DE")).toBe("A_PARTIR_DE");
    expect(glossKey("AZUCAR(M-ES)")).toBe("AZUCAR");
    expect(glossKey("buenos días")).toBe("BUENOS_DIAS");
  });

  it("enlaza los signos del currículo que el modelo conoce", () => {
    const known = new Set(getSignsMap().keys());
    expect(curriculumIdFor("dolor", known)).toBe("DOLOR");
    expect(curriculumIdFor("zzz", known)).toBeNull();
    const linked = [...known].filter((id) => conceptFor(id, manifest.concepts));
    expect(linked).toContain("BIEN");
    expect(linked.length).toBeGreaterThanOrEqual(20);
  });
});
