import { describe, expect, it } from "vitest";
import type { Lesson } from "@/lib/curriculum/schema";
import { getAllLevels } from "@/lib/curriculum/loader";
import { isRetryable, planLesson } from "@/lib/lesson/plan";

const lesson: Lesson = {
  id: "t.l1",
  title: "Prueba",
  goal: "Probar",
  signs: ["HOLA", "ADIOS", "GRACIAS"],
  exercises: [
    { id: "e1", type: "multiple_choice", prompt: "?", signId: "HOLA", options: ["Hola", "Adiós"], answer: "Hola" },
    { id: "e2", type: "sign_this", prompt: "?", letterId: "A", minConfidence: 0.5, voteWindowMs: 2000 },
    {
      id: "e3",
      type: "match_pairs",
      prompt: "?",
      pairs: [
        { signId: "HOLA", translation: "Hola" },
        { signId: "ADIOS", translation: "Adiós" },
        { signId: "PADRE", translation: "Padre" },
      ],
    },
    { id: "e4", type: "pick_sign", prompt: "?", signId: "GRACIAS", options: ["GRACIAS", "HOLA"] },
  ],
} as Lesson;

describe("planLesson", () => {
  const known = new Set(["HOLA", "ADIOS", "GRACIAS", "PADRE"]);

  it("presenta cada signo nuevo justo antes de su primer ejercicio, una sola vez", () => {
    const steps = planLesson(lesson, known).map((s) => (s.kind === "learn" ? `learn:${s.signId}` : s.exercise.id));
    expect(steps).toEqual(["learn:HOLA", "e1", "e2", "learn:ADIOS", "e3", "learn:GRACIAS", "e4"]);
  });

  it("no presenta signos de repaso de otras lecciones ni los que no tienen ficha", () => {
    const steps = planLesson(lesson, new Set(["HOLA"]));
    expect(steps.filter((s) => s.kind === "learn").map((s) => s.kind === "learn" && s.signId)).toEqual(["HOLA"]);
  });

  it("los ejercicios de cámara no se repiten", () => {
    expect(isRetryable(lesson.exercises[0]!)).toBe(true);
    expect(isRetryable(lesson.exercises[1]!)).toBe(false);
  });

  it("en el currículo real, ningún ejercicio pregunta por un signo nuevo sin presentarlo antes", () => {
    for (const level of getAllLevels()) {
      const known = new Set(level.signs.map((s) => s.id));
      for (const unit of level.units) {
        for (const l of unit.lessons) {
          const seen = new Set<string>();
          for (const step of planLesson(l, known)) {
            if (step.kind === "learn") seen.add(step.signId);
            else if (step.exercise.type === "multiple_choice" && l.signs.includes(step.exercise.signId)) {
              expect(seen.has(step.exercise.signId), `${l.id} ${step.exercise.id}`).toBe(true);
            }
          }
        }
      }
    }
  });
});
