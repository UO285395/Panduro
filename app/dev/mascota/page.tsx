import { MascotPreview } from "./preview";

export const metadata = { title: "Mascota · dev" };

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dev</p>
        <h1 className="text-2xl font-bold">Mascota</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          La mano de la app y sus reacciones: saluda en reposo, pulgar arriba al acertar, pulgar
          abajo al fallar y una vuelta al terminar la lección.
        </p>
      </header>
      <MascotPreview />
    </main>
  );
}
