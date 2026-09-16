"use client";

import { submitReview as submitReviewServer } from "./reviews";
import { submitReviewDemo } from "@/lib/storage/demoStore";
import { DEMO_MODE } from "@/lib/storage/flags";
import type { Quality } from "@/lib/srs/sm2";

/**
 * Fachada cliente para el submit de reviews SM-2.
 * Dispatcha entre el server action (Supabase) y el store local (demo).
 */
export async function submitReview(cardId: string, quality: Quality) {
  if (DEMO_MODE) return submitReviewDemo(cardId, quality);
  return submitReviewServer({ cardId, quality });
}
