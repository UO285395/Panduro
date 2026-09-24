import { MascotPreview } from "./preview";

export const metadata = { title: "Mascota · dev" };

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dev</p>
        <h1 className="text-2xl font-bold">Mascota</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Vista previa de la mascota y de sus reacciones. Para usar un modelo 3D propio (por
          ejemplo, el Thing de Sketchfab), sigue <code>public/mascot/README.md</code>.
        </p>
      </header>
      <MascotPreview />
    </main>
  );
}
