import { NextResponse } from "next/server";
import { getSign } from "@/lib/curriculum/loader";

/**
 * Animación de un signo, para las pantallas que la necesitan de vez en cuando (el traductor)
 * sin cargar las de todos los signos. Solo cambia con cada despliegue.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const clip = getSign(params.id)?.avatarClip;
  if (!clip) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(clip, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
