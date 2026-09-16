"use client";

import {
  saveTranslation as saveTranslationServer,
  listTranslations as listTranslationsServer,
  type SaveTranslationInput,
  type TranslationRow,
} from "./persistence";
import {
  listTranslationsDemo,
  saveTranslationDemo,
} from "@/lib/storage/demoStore";
import { DEMO_MODE } from "@/lib/storage/flags";

export async function saveTranslation(input: SaveTranslationInput): Promise<TranslationRow | null> {
  if (DEMO_MODE) return saveTranslationDemo(input);
  return saveTranslationServer(input);
}

export async function listTranslations(limit = 20): Promise<TranslationRow[]> {
  if (DEMO_MODE) return listTranslationsDemo(limit);
  return listTranslationsServer(limit);
}
