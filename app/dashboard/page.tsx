import { redirect } from "next/navigation";
import { getAllLevels, getLessonSequence } from "@/lib/curriculum/loader";
import { getUserSnapshot } from "@/lib/progress/queries";
import { DEMO_MODE } from "@/lib/storage/flags";
import { DashboardCloud } from "./dashboard-cloud";
import { DashboardDemo } from "./dashboard-demo";

export const metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (DEMO_MODE) {
    return <DashboardDemo />;
  }

  const snapshot = await getUserSnapshot();
  if (!snapshot) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p>No se pudo cargar tu perfil. Vuelve a iniciar sesión.</p>
      </main>
    );
  }
  if (!snapshot.onboardingCompleted) redirect("/onboarding");

  const levels = getAllLevels();
  const sequence = getLessonSequence().map(({ unit, lesson }) => ({
    unitId: unit.id,
    lessonId: lesson.id,
  }));

  return (
    <DashboardCloud level={levels[0]!} levels={levels} sequence={sequence} snapshot={snapshot} />
  );
}
