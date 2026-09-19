import { getAllLevels } from "@/lib/curriculum/loader";
import { GlossaryView } from "./glossary-view";

export const metadata = { title: "Glosario de signos" };

export default function GlossaryPage() {
  const levels = getAllLevels();

  const signsByLevel = levels.map((lvl) => ({
    levelId: lvl.id,
    levelTitle: lvl.title,
    signs: lvl.signs.map((s) => ({
      id: s.id,
      gloss: s.gloss,
      translation: s.translation,
      description: s.description ?? null,
      avatarClip: s.avatarClip ?? null,
    })),
  }));

  return <GlossaryView signsByLevel={signsByLevel} />;
}
