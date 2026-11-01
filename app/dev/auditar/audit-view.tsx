"use client";

import { useState } from "react";
import type { ClipSkeleton } from "@/lib/avatar/skeleton";
import type { AvatarClip } from "@/lib/curriculum/schema";

type State =
  | { kind: "idle" }
  | { kind: "running"; done: number; current: string }
  | { kind: "done"; skeletons: Record<string, ClipSkeleton>; failed: string[] }
  | { kind: "error"; message: string };

/**
 * Recorre los signos uno a uno sin pintar nada: carga el modelo, resuelve cada animación y
 * guarda el esqueleto. Tarda unos minutos (los contactos de cada signo se resuelven aquí).
 * Al acabar deja el resultado también en `window.__panduroSkeletons`, para automatizarlo.
 */
export function AuditView({ ids }: { ids: string[] }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "running", done: 0, current: "el modelo" });
    const [{ loadPanduroVrm }, { createVrmRigWithHands }, { clipSkeleton }] = await Promise.all([
      import("@/lib/avatar/loadVrm"),
      import("@/lib/avatar/vrmMapper"),
      import("@/lib/avatar/skeleton"),
    ]);
    const loaded = await loadPanduroVrm();
    if (!loaded) {
      setState({ kind: "error", message: "No se ha podido cargar el modelo del avatar." });
      return;
    }
    const rig = createVrmRigWithHands(loaded.vrm as Parameters<typeof createVrmRigWithHands>[0]);
    const skeletons: Record<string, ClipSkeleton> = {};
    const failed: string[] = [];
    for (const [i, id] of ids.entries()) {
      setState({ kind: "running", done: i, current: id });
      // Deja pintar el progreso entre signo y signo.
      await new Promise((r) => setTimeout(r, 0));
      try {
        const res = await fetch(`/api/clips/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        skeletons[id] = clipSkeleton(rig, (await res.json()) as AvatarClip);
      } catch {
        failed.push(id);
      }
    }
    (window as unknown as { __panduroSkeletons?: unknown }).__panduroSkeletons = skeletons;
    setState({ kind: "done", skeletons, failed });
  };

  const download = (skeletons: Record<string, ClipSkeleton>) => {
    const blob = new Blob([JSON.stringify(skeletons)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "esqueletos-avatar.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card space-y-4 p-5" data-state={state.kind}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{ids.length} signos grabados.</p>
      {state.kind === "idle" && (
        <button type="button" onClick={() => void run()} className="btn-primary">
          Empezar
        </button>
      )}
      {state.kind === "running" && (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${(100 * state.done) / ids.length}%` }} />
          </div>
          <p className="text-sm tabular-nums text-slate-500">
            {state.done} de {ids.length} · {state.current}
          </p>
        </div>
      )}
      {state.kind === "done" && (
        <div className="space-y-2">
          <p className="text-sm">
            Listo: {Object.keys(state.skeletons).length} esqueletos
            {state.failed.length > 0 && ` (fallaron ${state.failed.length}: ${state.failed.join(", ")})`}.
          </p>
          <button type="button" onClick={() => download(state.skeletons)} className="btn-primary">
            Descargar esqueletos-avatar.json
          </button>
        </div>
      )}
      {state.kind === "error" && <p className="text-sm text-ko-600">{state.message}</p>}
    </section>
  );
}
