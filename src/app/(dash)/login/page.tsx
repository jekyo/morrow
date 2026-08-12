"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiClientError, MorrowClient } from "@/lib/api";
import { API_KEY_STORAGE_KEY } from "@/lib/useApi";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = key.trim();
    if (!token || pending) return;
    setPending(true);
    setError(null);
    try {
      const client = new MorrowClient(token);
      await client.get("/pressure");
      window.localStorage.setItem(API_KEY_STORAGE_KEY, token);
      router.replace("/profiles");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Invalid API key.");
      } else {
        setError("Could not reach Morrow. Check the server and try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="bg-base-100 flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center">
          <Logo size={40} />
        </div>

        <form onSubmit={onSubmit} className="border-neutral bg-base-200 rounded-lg border p-6">
          <h1 className="text-base-content text-lg font-semibold">Connect</h1>
          <p className="text-secondary mt-1 text-sm">Enter your API key to open the dashboard.</p>

          <label htmlFor="api-key" className="text-secondary mt-6 block font-mono text-[11px] tracking-[0.15em] uppercase">
            API key
          </label>
          <input
            id="api-key"
            name="api-key"
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="••••••••••••••••••••"
            className="input border-neutral bg-base-100 focus:border-primary mt-2 w-full font-mono focus:outline-none"
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p className="text-error mt-2 text-sm" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={pending || !key.trim()} className="btn btn-primary mt-6 w-full">
            {pending ? "Connecting…" : "Connect"}
          </button>
        </form>

        <p className="text-secondary/70 mt-4 text-center font-mono text-[11px]">
          MORROW_API_KEY · stored locally in this browser only
        </p>
      </div>
    </main>
  );
}
