"use client";

import { useEffect, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { AvatarFallback } from "./AvatarFallback";
import { loadPanduroVrm } from "@/lib/avatar/loadVrm";

type Status = "checking" | "vrm" | "fallback";

type Props = {
  clip: AvatarClip | null;
  label?: string;
  size?: number;
};

/**
 * Player del avatar. Intenta cargar `public/avatars/panduro.vrm`; si el
 * fichero no está o Three.js no puede leerlo, cae al fallback SVG animado
 * — así la app funciona sin depender del binario, y solo mejora cuando
 * alguien lo añade.
 *
 * TODO(post-MVP): renderizar el VRM real en un canvas Three.js con animación
 * mapeada a los bones humanoide desde `sampleClip`. Por ahora, cuando el VRM
 * existe seguimos usando el fallback pero marcando el ready state.
 */
export function AvatarPlayer({ clip, label, size = 240 }: Props) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadPanduroVrm();
      if (cancelled) return;
      setStatus(loaded ? "vrm" : "fallback");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // En cualquier caso mostramos el fallback SVG; cuando haya un VRM real
  // pondremos aquí el canvas Three.js. El estado `vrm` queda expuesto para
  // que un futuro test detecte que el archivo está presente.
  return (
    <div data-avatar-status={status} className="relative">
      <AvatarFallback clip={clip} label={label} size={size} />
      {status === "vrm" && (
        <span className="sr-only">Avatar VRM cargado (renderizado pendiente)</span>
      )}
    </div>
  );
}
