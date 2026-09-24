import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "public", "mascot");
const CANDIDATES = ["thing.glb", "scene.gltf", "scene.glb", "thing.gltf"];

/**
 * Qué modelo de mascota hay en public/mascot/ (ver su README), sin que el navegador
 * tenga que ir probando rutas y llenando la consola de 404.
 */
export async function GET() {
  let config: { file?: string } & Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(path.join(DIR, "mascot.json"), "utf8"));
  } catch {
    /* sin configuración */
  }
  let files: string[] = [];
  try {
    files = await readdir(DIR);
  } catch {
    /* sin carpeta */
  }
  const wanted = config.file ? [config.file, ...CANDIDATES] : CANDIDATES;
  const file = wanted.find((f) => files.includes(f)) ?? files.find((f) => /\.(glb|gltf)$/i.test(f));
  return NextResponse.json({ url: file ? `/mascot/${file}` : null, config });
}
