import { DemoResetView } from "./demo-reset-view";

export const metadata = { title: "Reiniciar demo" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-4 text-2xl font-bold">Reiniciar modo demo</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Vacía tu progreso local, XP, corazones y racha. Los datos viven solo en
        este navegador; no se sincronizan con ningún servidor.
      </p>
      <DemoResetView />
    </main>
  );
}
