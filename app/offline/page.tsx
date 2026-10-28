import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { RetryButton } from "./retry-button";

export const metadata = { title: "Sin conexión" };

/**
 * Lo que enseña el service worker al abrir sin conexión una página que no se había visitado.
 * Las que sí (y el avatar, la mano y los signos ya vistos) siguen funcionando.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Logo size={56} />
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon name="close" size={36} />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold">Sin conexión</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Esta página no está guardada en el dispositivo. Las lecciones y los signos que ya has
          abierto siguen disponibles sin internet.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <RetryButton />
        <Link href="/dashboard" className="btn-secondary w-full">
          Ir al panel
        </Link>
      </div>
    </main>
  );
}
