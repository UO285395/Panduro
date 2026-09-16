import { z } from "zod";

// ---------------------------------------------------------------------------
// Signos (léxico compartido entre lecciones)
// ---------------------------------------------------------------------------
export const SignSchema = z.object({
  id: z.string().min(1), // ej. "HOLA"
  gloss: z.string().min(1), // etiqueta LSE en mayúsculas (convención)
  translation: z.string().min(1), // castellano
  description: z.string().optional(), // pista de ejecución
  videoUrl: z.string().url().nullable().optional(), // vídeo de referencia
  posterUrl: z.string().url().nullable().optional(),
  handedness: z.enum(["one", "two"]).default("one"),
  tags: z.array(z.string()).default([]),
});
export type Sign = z.infer<typeof SignSchema>;

// ---------------------------------------------------------------------------
// Ejercicios
// ---------------------------------------------------------------------------
const ExerciseBase = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
});

const MultipleChoiceExercise = ExerciseBase.extend({
  type: z.literal("multiple_choice"),
  signId: z.string().min(1), // enseña este signo (vídeo)
  options: z.array(z.string().min(1)).min(2).max(6), // traducciones
  answer: z.string().min(1), // debe estar en options
});

const MatchPairsExercise = ExerciseBase.extend({
  type: z.literal("match_pairs"),
  pairs: z
    .array(
      z.object({
        signId: z.string().min(1),
        translation: z.string().min(1),
      }),
    )
    .min(3)
    .max(6),
});

const TypeWordExercise = ExerciseBase.extend({
  type: z.literal("type_word"),
  signId: z.string().min(1),
  acceptable: z.array(z.string().min(1)).min(1), // variantes válidas
});

export const ExerciseSchema = z.discriminatedUnion("type", [
  MultipleChoiceExercise,
  MatchPairsExercise,
  TypeWordExercise,
]);
export type Exercise = z.infer<typeof ExerciseSchema>;

// ---------------------------------------------------------------------------
// Lecciones y unidades
// ---------------------------------------------------------------------------
export const LessonSchema = z.object({
  id: z.string().min(1), // ej. "a1.u1.l1"
  title: z.string().min(1),
  goal: z.string().optional(),
  signs: z.array(z.string().min(1)).min(1), // vocabulario cubierto
  exercises: z.array(ExerciseSchema).min(1),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const UnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  lessons: z.array(LessonSchema).min(1),
});
export type Unit = z.infer<typeof UnitSchema>;

export const LevelSchema = z.object({
  id: z.enum(["A1", "A2", "B1", "B2"]),
  title: z.string().min(1),
  units: z.array(UnitSchema).min(1),
  signs: z.array(SignSchema).min(1),
});
export type Level = z.infer<typeof LevelSchema>;

// ---------------------------------------------------------------------------
// Validaciones cruzadas (referencias)
// ---------------------------------------------------------------------------
export function validateLevel(level: Level): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const signIds = new Set(level.signs.map((s) => s.id));

  for (const unit of level.units) {
    for (const lesson of unit.lessons) {
      for (const sid of lesson.signs) {
        if (!signIds.has(sid)) {
          errors.push(`Lección ${lesson.id}: signo desconocido "${sid}"`);
        }
      }
      for (const ex of lesson.exercises) {
        if (ex.type === "multiple_choice") {
          if (!signIds.has(ex.signId)) {
            errors.push(`Ejercicio ${ex.id}: signo desconocido "${ex.signId}"`);
          }
          if (!ex.options.includes(ex.answer)) {
            errors.push(
              `Ejercicio ${ex.id}: la respuesta "${ex.answer}" no está entre las opciones`,
            );
          }
        }
        if (ex.type === "match_pairs") {
          for (const p of ex.pairs) {
            if (!signIds.has(p.signId)) {
              errors.push(
                `Ejercicio ${ex.id}: signo desconocido en pares "${p.signId}"`,
              );
            }
          }
        }
        if (ex.type === "type_word") {
          if (!signIds.has(ex.signId)) {
            errors.push(`Ejercicio ${ex.id}: signo desconocido "${ex.signId}"`);
          }
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
