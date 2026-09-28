import { describe, expect, it } from "vitest";
import captured from "@/content/signs/captured.json";
import capturedTemplates from "@/content/signs/captured-templates.json";
import {
  getAllLevels,
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

  it("incluye la Unidad 2 de dactilología con ejercicios sign_this", () => {
    const u2 = getUnit("a1.u2");
    expect(u2).toBeDefined();
    expect(u2!.lessons.length).toBeGreaterThanOrEqual(3);
    const allExercises = u2!.lessons.flatMap((l) => l.exercises);
    const signThis = allExercises.filter((e) => e.type === "sign_this");
    expect(signThis.length).toBeGreaterThanOrEqual(10);
    for (const ex of signThis) {
      if (ex.type !== "sign_this") continue;
      expect(ex.letterId).toMatch(/^[A-ZÑ]$/);
    }
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
    // Recorre unidades en el orden declarado (incluye A2 al final).
    expect(seq[0]?.lesson.id).toBe("a1.u1.l1");
    const u1Count = seq.filter((x) => x.unit.id === "a1.u1").length;
    expect(u1Count).toBe(3);
  });

  it("incluye U3 (Números) y U4 (Familia y comida) del Hito 6", () => {
    const level = getLevel();
    expect(level.signs.length).toBeGreaterThanOrEqual(40);
    const unitIds = level.units.map((u) => u.id);
    expect(unitIds).toEqual(["a1.u1", "a1.u2", "a1.u3", "a1.u4", "a1.u5", "a1.u6", "a1.u7", "a1.u8"]);
  });

  it("los signos animados con vídeos ajenos citan la fuente, la licencia y la entrada", () => {
    const signs = getAllLevels().flatMap((l) => l.signs);
    const withLicense = Object.entries(captured.signs).filter(([, e]) => "license" in e);
    for (const [id, entry] of withLicense) {
      const sign = signs.find((s) => s.id === id);
      expect(sign, id).toBeDefined();
      expect(sign!.avatarClip).toEqual(entry.avatarClip);
      expect(sign!.animationCredit?.license, id).toBe((entry as { license: string }).license);
      if ((entry as { source: string }).source.startsWith("DILSE")) {
        expect(sign!.animationCredit?.url, id).toMatch(/^https:\/\/fundacioncnse-dilse\.org\//);
      }
    }
  });

  it("las plantillas de reconocimiento de los signos grabados van aparte de sus clips", () => {
    for (const [id, entry] of Object.entries(captured.signs)) {
      expect("templates" in entry && (entry as { templates: unknown[] }).templates.length, id).toBeFalsy();
    }
    for (const id of Object.keys(capturedTemplates.signs)) {
      expect(captured.signs, id).toHaveProperty(id);
    }
  });
});
