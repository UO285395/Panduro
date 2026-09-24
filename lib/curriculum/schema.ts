import { z } from "zod";
import { BODY_POINTS } from "@/lib/avatar/bodyPoints";

// ---------------------------------------------------------------------------
// Avatar clip (keyframes ligeros interpretados por AvatarPlayer)
// ---------------------------------------------------------------------------

// Un dedo puede ser un número simple (flexión 0..1) o un objeto con abducción.
const FingerValueSchema = z.union([
  z.number(),
  z.object({ flex: z.number(), abduction: z.number().optional() }),
]);
export type FingerValue = z.infer<typeof FingerValueSchema>;

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

// Contacto con el cuerpo: la parte `with` de la mano se lleva al punto `at`,
// medido sobre la malla de cada modelo. Sustituye a x/y/z en ese keyframe.
export const HAND_PARTS = ["tips", "index", "middle", "thumb", "palm", "back", "knuckles"] as const;
const ContactSchema = z.object({
  at: z.enum(BODY_POINTS),
  with: z.enum(HAND_PARTS).optional(), // por defecto, las yemas de los dedos extendidos
  gap: z.number().min(0).optional(), // separación de la piel, en longitudes de brazo
  offset: z.tuple([z.number(), z.number()]).optional(), // [hacia fuera, arriba] sobre la piel
  weight: z.number().min(0).max(1).optional(), // 1 = contacto; menos, mezcla con x/y/z
});
export type Contact = z.infer<typeof ContactSchema>;

const HandSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rot: Vec3Schema.default([0, 0, 0]),
  forearmRoll: z.number().optional(), // supinación/pronación del antebrazo (rad)
  // Orientación medida en grabaciones reales, en espacio del signante
  // (x: su derecha, y: arriba, z: hacia el interlocutor). Si están presentes
  // sustituyen a rot/forearmRoll.
  palmDir: Vec3Schema.optional(),
  pointDir: Vec3Schema.optional(),
  contact: ContactSchema.optional(),
});
export type HandSpec = z.infer<typeof HandSchema>;

const AvatarKeyframeSchema = z.object({
  t: z.number().min(0), // ms desde el inicio
  hand: HandSchema,
  fingers: z
    .tuple([
      FingerValueSchema,
      FingerValueSchema,
      FingerValueSchema,
      FingerValueSchema,
      FingerValueSchema,
    ])
    .default([0, 0, 0, 0, 0]),
  hand2: HandSchema.optional(),
  fingers2: z.tuple([
    FingerValueSchema,
    FingerValueSchema,
    FingerValueSchema,
    FingerValueSchema,
    FingerValueSchema,
  ]).optional(),
});
export type AvatarKeyframe = z.infer<typeof AvatarKeyframeSchema>;

const AvatarClipSchema = z.object({
  handedness: z.enum(["one", "two"]).default("one"),
  duration: z.number().int().min(200).max(6000),
  keyframes: z.array(AvatarKeyframeSchema).min(2),
});
export type AvatarClip = z.infer<typeof AvatarClipSchema>;

/** Signos grabados con /dev/grabar: sustituyen al clip generado del currículo. */
export const CapturedSignsSchema = z.object({
  version: z.literal(1),
  signs: z.record(
    z.string(),
    z.object({
      avatarClip: AvatarClipSchema,
      /** Landmarks de imagen de la mano dominante en los tramos más quietos. */
      templates: z.array(z.array(z.object({ x: z.number(), y: z.number(), z: z.number() }))).default([]),
      recordedAt: z.string(),
      source: z.string(),
    }),
  ),
});
export type CapturedSigns = z.infer<typeof CapturedSignsSchema>;

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
  avatarClip: AvatarClipSchema.optional(),
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

const SignThisExercise = ExerciseBase.extend({
  type: z.literal("sign_this"),
  letterId: z.string().length(1).regex(/[A-ZÑ]/), // A-Z, Ñ (dactilología LSE)
  minConfidence: z.number().min(0).max(1).default(0.55),
  voteWindowMs: z.number().int().min(500).max(6000).default(2000),
});

const MotionThisExercise = ExerciseBase.extend({
  type: z.literal("motion_this"),
  signId: z.string().min(1),
  gesture: z.enum(["WAVE_H", "WAVE_V", "PUSH_FORWARD"]),
  timeoutMs: z.number().int().min(3000).max(20000).default(12000),
});

const SignWordExercise = ExerciseBase.extend({
  type: z.literal("sign_word"),
  signId: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.50),
  voteWindowMs: z.number().int().min(500).max(6000).default(2500),
});

// Al revés que multiple_choice: se da la palabra y se elige su signo entre varios.
const PickSignExercise = ExerciseBase.extend({
  type: z.literal("pick_sign"),
  signId: z.string().min(1), // la respuesta
  options: z.array(z.string().min(1)).min(2).max(4), // signIds, incluye signId
});

export const ExerciseSchema = z.discriminatedUnion("type", [
  MultipleChoiceExercise,
  PickSignExercise,
  MatchPairsExercise,
  TypeWordExercise,
  SignThisExercise,
  MotionThisExercise,
  SignWordExercise,
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
  id: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
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
        if (ex.type === "pick_sign") {
          for (const sid of ex.options) {
            if (!signIds.has(sid)) errors.push(`Ejercicio ${ex.id}: signo desconocido "${sid}"`);
          }
          if (!ex.options.includes(ex.signId)) {
            errors.push(`Ejercicio ${ex.id}: la respuesta "${ex.signId}" no está entre las opciones`);
          }
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
