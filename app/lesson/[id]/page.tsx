import { notFound } from "next/navigation";
import { getLesson, getSignsMap } from "@/lib/curriculum/loader";
import { LessonRunner } from "./lesson-runner";

type PageProps = { params: { id: string } };

export function generateMetadata({ params }: PageProps) {
  const lesson = getLesson(params.id);
  return { title: lesson?.title ?? "Lección" };
}

export default function LessonPage({ params }: PageProps) {
  const lesson = getLesson(params.id);
  if (!lesson) notFound();

  const signs = getSignsMap();
  const signRecord = Object.fromEntries(
    lesson.signs.map((sid) => [sid, signs.get(sid)]).filter(([, s]) => s),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <LessonRunner lesson={lesson} signs={signRecord} />
    </main>
  );
}
