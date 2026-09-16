import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "Panel" };

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email ??
    "estudiante";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Hola, {displayName} 👋</h1>
        <SignOutButton />
      </header>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-lg font-semibold">Tu ruta LSE</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Aquí irá tu árbol de lecciones (nivel A1: saludos, presentaciones,
          dactilología, colores…). Todavía en construcción — llega en el
          siguiente hito.
        </p>
      </section>
    </main>
  );
}
