"use client";

import { useEffect, useState } from "react";
import type { AvatarClip, SignAnimation } from "@/lib/curriculum/schema";

const cache = new Map<string, Promise<SignAnimation | null>>();

function fetchAnimation(id: string): Promise<SignAnimation | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/clips/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SignAnimation>) : null))
      .catch(() => {
        cache.delete(id); // sin conexión: se reintenta la próxima vez
        return null;
      });
    cache.set(id, p);
  }
  return p;
}

/**
 * Animación de un signo y su crédito, pedidos al servidor cuando hace falta (null mientras
 * llegan, si no hay o si `id` está vacío: así se puede esperar a que el signo se vea).
 */
export function useSignAnimation(id: string | null | undefined): SignAnimation | null {
  const [state, setState] = useState<{ id: string; animation: SignAnimation | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchAnimation(id).then((animation) => {
      if (alive) setState({ id, animation });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return id && state?.id === id ? state.animation : null;
}

/** Solo la animación, para las pantallas que no citan su origen. */
export function useSignClip(id: string | null | undefined): AvatarClip | null {
  return useSignAnimation(id)?.avatarClip ?? null;
}
