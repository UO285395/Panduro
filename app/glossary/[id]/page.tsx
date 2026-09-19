import { notFound } from "next/navigation";
import Link from "next/link";
import { getSign, getAllLevels } from "@/lib/curriculum/loader";
import { SignDetailView } from "./sign-detail-view";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const levels = getAllLevels();
  return levels.flatMap((lvl) => lvl.signs.map((s) => ({ id: s.id })));
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const sign = getSign(id);
  if (!sign) return {};
  return { title: `${sign.translation} — Glosario LSE` };
}

export default async function SignDetailPage({ params }: Props) {
  const { id } = await params;
  const sign = getSign(id);
  if (!sign) notFound();

  const levels = getAllLevels();
  const levelId = levels.find((lvl) => lvl.signs.some((s) => s.id === id))?.id ?? "";

  const lessons = levels
    .flatMap((lvl) =>
      lvl.units.flatMap((u) =>
        u.lessons
          .filter((l) => l.signs.includes(id))
          .map((l) => ({ lessonId: l.id, lessonTitle: l.title, unitTitle: u.title })),
      ),
    );

  return (
    <SignDetailView
      sign={{
        id: sign.id,
        gloss: sign.gloss,
        translation: sign.translation,
        description: sign.description ?? null,
        tags: sign.tags,
        handedness: sign.handedness,
        avatarClip: sign.avatarClip ?? null,
      }}
      levelId={levelId}
      lessons={lessons}
    />
  );
}
