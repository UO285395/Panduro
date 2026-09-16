"use client";

import { completeLesson as completeLessonServer } from "./actions";
import { completeLessonDemo } from "@/lib/storage/demoStore";
import { DEMO_MODE } from "@/lib/storage/flags";

/**
 * Fachada cliente. En modo demo persiste en localStorage; en cloud llama al
 * server action que escribe en Supabase con RLS.
 */
export async function completeLesson(input: {
  lessonId: string;
  correct: number;
  total: number;
  heartsUsed: number;
}) {
  if (DEMO_MODE) return completeLessonDemo(input);
  return completeLessonServer(input);
}
