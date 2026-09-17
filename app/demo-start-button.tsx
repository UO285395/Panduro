"use client";

import { useRouter } from "next/navigation";
import { signInDemo } from "@/lib/storage/demoStore";

export function DemoStartButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        signInDemo();
        router.push("/dashboard");
      }}
      className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700"
    >
      Entrar en modo demo
    </button>
  );
}
