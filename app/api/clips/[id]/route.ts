import { NextResponse } from "next/server";
import { getSign, getSignsMap } from "@/lib/curriculum/loader";
import type { SignAnimation } from "@/lib/curriculum/schema";

/**
 * Animación de un signo con su crédito, para las pantallas cliente que la enseñan de vez en
 * cuando (el repaso, el traductor, las tarjetas del glosario) sin cargar las de todos los
 * signos. Se genera un JSON estático por signo al hacer el build: solo cambia con cada
 * despliegue.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [...getSignsMap().values()].filter((s) => s.avatarClip).map((s) => ({ id: s.id }));
}

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const sign = getSign(params.id);
  if (!sign?.avatarClip) return NextResponse.json(null, { status: 404 });
  const body: SignAnimation = { avatarClip: sign.avatarClip, animationCredit: sign.animationCredit ?? null };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
