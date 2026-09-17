"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [signOrder] = useState(() => shuffle(signTokens, seed));
  const [transOrder] = useState(() => shuffle(transTokens, seed + 13));

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
      <div className="grid grid-cols-2 gap-3">
        <ul className="space-y-2" aria-label="Signos">
          {signOrder.map((t) => (
            <li key={t.key}>
              <MatchButton
                token={t}
                selected={selection.sign?.key === t.key}
                matched={matched.has(t.signId)}
                wrong={wrongAttempt?.signKey === t.key}
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
  disabled,
  onPick,
}: {
  token: Token;
  selected: boolean;
  matched: boolean;
  wrong: boolean;
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
      }`}
    >
      {token.label}
    </button>
  );
}
