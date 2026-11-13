"use client";

import { useEffect, useState } from "react";
import { ESTILO_KEY, type Estilo } from "@/lib/ui/estilo";

const ESTILOS: { id: Estilo; label: string }[] = [
  { id: "juego", label: "Juego" },
  { id: "cuaderno", label: "Cuaderno" },
];

/** Elige el aspecto de la app, como quien elige claro u oscuro. Se guarda en el navegador. */
export function StyleSwitch({ className = "" }: { className?: string }) {
  const [estilo, setEstilo] = useState<Estilo>("juego");

  useEffect(() => {
    setEstilo(document.documentElement.dataset.estilo === "cuaderno" ? "cuaderno" : "juego");
  }, []);

  const choose = (e: Estilo) => {
    setEstilo(e);
    document.documentElement.dataset.estilo = e;
    try {
      localStorage.setItem(ESTILO_KEY, e);
    } catch {
      // Sin almacenamiento (modo privado): vale hasta que se cierre la pestaña.
    }
  };

  return (
    <div
      role="group"
      aria-label="Estilo de la app"
      className={`style-switch inline-flex items-center gap-0.5 rounded-full border border-slate-300 bg-white/70 p-0.5 text-xs font-semibold ${className}`}
    >
      {ESTILOS.map((e) => (
        <button
          key={e.id}
          type="button"
          aria-pressed={estilo === e.id}
          onClick={() => choose(e.id)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            estilo === e.id ? "bg-slate-900 text-slate-50" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
