import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

/**
 * Vídeo del DILSE de un signo, de data/dilse/videos si se ha descargado
 * (scripts/dilse_download.py), para la página de revisión (/dev/revisar). Solo en desarrollo:
 * esos vídeos no se suben al repositorio ni se despliegan. Sin el vídeo, 404 y la página usa
 * el enlace a la web del DILSE.
 *
 * Con rangos (`Range`): sin ellos el navegador no puede repetirlo en bucle ni adelantarlo.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (process.env.NODE_ENV === "production" || !/^[A-Z0-9_]+$/.test(params.id)) {
    return new Response(null, { status: 404 });
  }
  const file = join(process.cwd(), "data", "dilse", "videos", `${params.id}.mov`);
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  // Los .mov del DILSE son H.264: como MP4 los reproducen todos los navegadores.
  const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (!range || (!range[1] && !range[2])) {
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
