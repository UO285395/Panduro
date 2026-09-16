import { describe, expect, it } from "vitest";
import {
  getLevel,
  getLesson,
  getLessonSequence,
  getSign,
  getUnit,
} from "@/lib/curriculum/loader";
import { LevelSchema, validateLevel } from "@/lib/curriculum/schema";

describe("curriculum: schema + loader", () => {
  it("valida el nivel A1 completo (zod + referencias cruzadas)", () => {
    const level = getLevel();
    expect(level.id).toBe("A1");
    // Pasa la validación estricta
    const parsed = LevelSchema.parse(level);
    const check = validateLevel(parsed);
    expect(check).toEqual({ ok: true });
  });

  it("expone al menos 15 signos y 3 lecciones en U1", () => {
    const level = getLevel();
    expect(level.signs.length).toBeGreaterThanOrEqual(15);
    const u1 = getUnit("a1.u1");
    expect(u1).toBeDefined();
    expect(u1!.lessons.length).toBe(3);
  });

  it("todas las referencias signId de ejercicios existen en signs", () => {
    const level = getLevel();
    const ids = new Set(level.signs.map((s) => s.id));
    for (const u of level.units) {
      for (const l of u.lessons) {
        for (const e of l.exercises) {
          if (e.type === "multiple_choice" || e.type === "type_word") {
            expect(ids.has(e.signId)).toBe(true);
          }
          if (e.type === "match_pairs") {
            for (const p of e.pairs) expect(ids.has(p.signId)).toBe(true);
          }
        }
      }
    }
  });

  it("getLesson/getSign devuelven objetos coherentes", () => {
    const lesson = getLesson("a1.u1.l1");
    expect(lesson?.title).toContain("Saludar");
    const sign = getSign("HOLA");
    expect(sign?.translation).toBe("Hola");
  });

  it("getLessonSequence linealiza las lecciones en orden", () => {
    const seq = getLessonSequence();
    expect(seq[0]?.lesson.id).toBe("a1.u1.l1");
    expect(seq[seq.length - 1]?.lesson.id).toBe("a1.u1.l3");
  });
});
