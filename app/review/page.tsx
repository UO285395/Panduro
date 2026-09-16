import { getUserSnapshot } from "@/lib/progress/queries";
import { DEMO_MODE } from "@/lib/storage/flags";
import { ReviewCloud } from "./review-cloud";
import { ReviewDemo } from "./review-demo";

export const metadata = { title: "Repaso diario" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  if (DEMO_MODE) return <ReviewDemo />;

  const snapshot = await getUserSnapshot();
  if (!snapshot) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <p>No se pudo cargar tu perfil. Vuelve a iniciar sesión.</p>
      </main>
    );
  }
  return (
    <ReviewCloud
      cards={snapshot.pendingReviews}
      nextReviewDueAt={snapshot.nextReviewDueAt}
    />
  );
}
