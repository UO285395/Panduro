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
      className="btn-primary px-7 py-3 text-xl"
    >
      Empezar ahora
    </button>
  );
}
