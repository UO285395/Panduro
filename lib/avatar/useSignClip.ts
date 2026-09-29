"use client";

import { useEffect, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";

const cache = new Map<string, Promise<AvatarClip | null>>();

function fetchClip(id: string): Promise<AvatarClip | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/clips/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<AvatarClip>) : null))
      .catch(() => {
        cache.delete(id); // sin conexión: se reintenta la próxima vez
        return null;
      });
    cache.set(id, p);
  }
  return p;
}

/** Animación de un signo pedida al servidor cuando hace falta (null mientras llega o si no hay). */
export function useSignClip(id: string | null | undefined): AvatarClip | null {
  const [clip, setClip] = useState<{ id: string; clip: AvatarClip | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchClip(id).then((c) => {
      if (alive) setClip({ id, clip: c });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return id && clip?.id === id ? clip.clip : null;
}
