"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetDemo } from "@/lib/storage/demoStore";
import { DEMO_MODE } from "@/lib/storage/flags";

export function DemoResetView() {
  const router = useRouter();
  const [done, setDone] = useState(false);

  if (!DEMO_MODE) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Esta página solo tiene efecto cuando arrancas la app con{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
          NEXT_PUBLIC_DEMO_MODE=1
        </code>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          resetDemo();
          setDone(true);
        }}
        className="rounded-full bg-red-600 px-5 py-2 font-semibold text-white hover:bg-red-700"
      >
        Vaciar mi progreso demo
      </button>
      {done && (
        <div role="status" className="space-y-3">
          <p className="text-sm text-green-700">Datos borrados.</p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="text-sm text-brand-600 hover:underline"
          >
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
