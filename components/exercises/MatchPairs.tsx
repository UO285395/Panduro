"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { Exercise, Sign } from "@/lib/curriculum/schema";

type Pair = { sign: Sign; translation: string };

type Props = {
  exercise: Extract<Exercise, { type: "match_pairs" }>;
  pairs: Pair[];
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Token = {
  key: string;
  label: string;
  signId: string;
  kind: "sign" | "translation";
};

function shuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function MatchPairs({ exercise, pairs, onAnswer, disabled }: Props) {
  const signTokens: Token[] = pairs.map((p) => ({
    key: `s:${p.sign.id}`,
    label: p.sign.gloss,
    signId: p.sign.id,
    kind: "sign",
  }));
  const transTokens: Token[] = pairs.map((p) => ({
    key: `t:${p.sign.id}`,
    label: p.translation,
    signId: p.sign.id,
    kind: "translation",
  }));

  const seed = useMemo(
    () =>
      exercise.id
        .split("")
        .reduce((acc, ch) => (acc + ch.charCodeAt(0)) % 100000, 7),
    [exercise.id],
  );
  // Los signos se identifican por su posición, no por la glosa: la glosa es
  // la propia respuesta. El avatar muestra el signo que se toca.
  const [signOrder] = useState(() =>
    shuffle(signTokens, seed).map((t, i) => ({ ...t, label: `Signo ${i + 1}` })),
  );
  const [transOrder] = useState(() => shuffle(transTokens, seed + 13));
  const [playingId, setPlayingId] = useState(() => signOrder[0]?.signId);
  const playing = pairs.find((p) => p.sign.id === playingId)?.sign;
  const playingLabel = signOrder.find((t) => t.signId === playingId)?.label;

  const [selection, setSelection] = useState<{
    sign?: Token;
    translation?: Token;
  }>({});
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongAttempt, setWrongAttempt] = useState<{
    signKey: string;
    transKey: string;
  } | null>(null);
  const [errorsMade, setErrorsMade] = useState(0);

  function pick(token: Token) {
    if (disabled || matched.has(token.signId)) return;
    if (token.kind === "sign") setPlayingId(token.signId);
    setWrongAttempt(null);
    setSelection((s) => ({ ...s, [token.kind]: token }));
  }

  useEffect(() => {
    if (!selection.sign || !selection.translation) return;
    const sign = selection.sign;
    const translation = selection.translation;
    const isMatch = sign.signId === translation.signId;
    if (isMatch) {
      setMatched((prev) => {
        const next = new Set(prev);
        next.add(sign.signId);
        if (next.size === pairs.length) {
          onAnswer(errorsMade === 0);
        }
        return next;
      });
      setSelection({});
    } else {
      setWrongAttempt({ signKey: sign.key, transKey: translation.key });
      setErrorsMade((n) => n + 1);
      setSelection({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.sign, selection.translation]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{exercise.prompt}</h2>
      <figure className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl bg-brand-100 dark:bg-brand-900/40">
          <AvatarPlayer clip={playing?.avatarClip ?? null} size={240} />
        </div>
        <figcaption className="text-sm font-medium text-slate-600 dark:text-slate-300">
          ▶ {playingLabel} · toca otro signo para verlo
        </figcaption>
      </figure>
      <div className="grid grid-cols-2 gap-3">
        <ul className="space-y-2" aria-label="Signos">
          {signOrder.map((t) => (
            <li key={t.key}>
              <MatchButton
                token={t}
                selected={selection.sign?.key === t.key}
                matched={matched.has(t.signId)}
                wrong={wrongAttempt?.signKey === t.key}
                playing={playingId === t.signId}
                disabled={disabled}
                onPick={pick}
              />
            </li>
          ))}
        </ul>
        <ul className="space-y-2" aria-label="Traducciones">
          {transOrder.map((t) => (
            <li key={t.key}>
              <MatchButton
                token={t}
                selected={selection.translation?.key === t.key}
                matched={matched.has(t.signId)}
                wrong={wrongAttempt?.transKey === t.key}
                disabled={disabled}
                onPick={pick}
              />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-500">
        Emparejadas: {matched.size}/{pairs.length}
        {errorsMade > 0 && ` · Fallos: ${errorsMade}`}
      </p>
    </section>
  );
}

function MatchButton({
  token,
  selected,
  matched,
  wrong,
  playing = false,
  disabled,
  onPick,
}: {
  token: Token;
  selected: boolean;
  matched: boolean;
  wrong: boolean;
  playing?: boolean;
  disabled: boolean;
  onPick: (t: Token) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(token)}
      disabled={disabled || matched}
      aria-pressed={selected}
      className={`w-full rounded-lg border px-3 py-3 text-left font-medium transition ${
        matched
          ? "border-green-400 bg-green-50 text-green-900 opacity-70 dark:bg-green-950 dark:text-green-100"
          : wrong
            ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
            : selected
              ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
              : "border-slate-200 bg-white hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
      } ${playing && !matched ? "ring-2 ring-brand-300 dark:ring-brand-700" : ""}`}
    >
      {token.kind === "sign" && "▶ "}
      {token.label}
    </button>
  );
}
