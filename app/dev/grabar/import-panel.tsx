"use client";

import { useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { CaptureResult } from "@/lib/avatar/capture";
import { convertSample, type SwlExport } from "@/lib/avatar/importSwl";

type Converted = { sample: string; label: string; result: CaptureResult; leftHanded: boolean };
type Row = { signId: string; samples: Converted[]; chosen: number; include: boolean };

export function ImportPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Pick<SwlExport, "source" | "license" | "doi"> | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(file: File) {
    setError(null);
    try {
      const data = JSON.parse(await file.text()) as SwlExport;
      if (!data.signs || !data.fps) throw new Error();
      const next = Object.entries(data.signs).map(([signId, samples]) => {
        const converted = samples.map((s) => ({ sample: s.sample, label: s.label, ...convertSample(s.frames, s.fps ?? data.fps) }));
        const firstOk = converted.findIndex((c) => c.result.ok);
        return { signId, samples: converted, chosen: Math.max(0, firstOk), include: firstOk >= 0 };
      });
      setRows(next);
      setMeta({ source: data.source, license: data.license, doi: data.doi });
      setPreview(next.find((r) => r.include)?.signId ?? null);
    } catch {
      setError("No es un archivo generado con scripts/swl_lse_export.py ni scripts/videos_to_signs.py.");
    }
  }

  const update = (signId: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.signId === signId ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.include && r.samples[r.chosen]?.result.ok);

  function download() {
    if (!meta) return;
    const signs: Record<string, unknown> = {};
    for (const r of selected) {
      const c = r.samples[r.chosen]!;
      if (!c.result.ok) continue;
      signs[r.signId] = {
        avatarClip: c.result.clip,
        templates: c.result.templates,
        recordedAt: new Date().toISOString(),
        source: `${meta.source} (${meta.license}${meta.doi ? `, ${/^https?:/.test(meta.doi) ? meta.doi : `doi:${meta.doi}`}` : ""}) · muestra ${c.sample}${c.leftHanded ? " · signante zurdo" : ""}`,
      };
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, signs }, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "swl-lse-signos.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewRow = rows.find((r) => r.signId === preview);
  const previewSample = previewRow?.samples[previewRow.chosen];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Importar landmarks (SWL-LSE o vídeos)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Carga el JSON de <code>scripts/swl_lse_export.py</code> (datos de SWL-LSE en Zenodo) o
          de <code>scripts/videos_to_signs.py</code> (cualquier carpeta de vídeos de signos, p. ej.
          los del diccionario DILSE). Cada muestra se convierte aquí, con el mismo proceso que una
          grabación; elige la mejor de cada signo mirando el avatar y descarga las seleccionadas.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
          className="text-sm"
          aria-label="JSON exportado de SWL-LSE"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="p-2">Usar</th>
                  <th className="p-2">Signo</th>
                  <th className="p-2">Muestra</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.samples[r.chosen];
                  return (
                    <tr key={r.signId} className={preview === r.signId ? "bg-brand-50 dark:bg-brand-950/40" : ""}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={!c?.result.ok}
                          onChange={(e) => update(r.signId, { include: e.target.checked })}
                          aria-label={`Usar ${r.signId}`}
                        />
                      </td>
                      <td className="p-2 font-medium">{r.signId}</td>
                      <td className="p-2">
                        <select
                          value={r.chosen}
                          onChange={(e) => update(r.signId, { chosen: Number(e.target.value) })}
                          className="rounded border border-slate-300 bg-transparent px-1 dark:border-slate-700"
                        >
                          {r.samples.map((s, i) => (
                            <option key={s.sample} value={i}>
                              {s.label} · {s.sample}
                              {s.result.ok ? (s.leftHanded ? " (zurdo)" : "") : " ✗"}
                            </option>
                          ))}
                        </select>
                        {c && !c.result.ok && <p className="text-xs text-red-600">{c.result.error}</p>}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => setPreview(r.signId)}
                          disabled={!c?.result.ok}
                          className="text-brand-600 hover:underline disabled:opacity-40"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-2">
            {previewSample?.result.ok && (
              <>
                <div className="overflow-hidden rounded-xl bg-brand-100">
                  <AvatarPlayer clip={previewSample.result.clip} size={240} />
                </div>
                <p className="text-center text-sm font-semibold">{previewRow?.signId}</p>
              </>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={download}
            disabled={selected.length === 0}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Descargar {selected.length} signo{selected.length === 1 ? "" : "s"}
          </button>
          <p className="text-xs text-slate-500">
            Después: <code>node scripts/add-captured.mjs swl-lse-signos.json</code>. La fuente y la
            licencia ({meta?.license}) quedan guardadas en cada signo: añádelas también a CREDITS.md.
          </p>
        </div>
      )}
    </section>
  );
}
