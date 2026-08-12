"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function ClonePrompt({
  sourceName,
  onClose,
  onClone,
}: {
  sourceName: string;
  onClose: () => void;
  onClone: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState(`${sourceName}-copy`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = NAME_PATTERN.test(name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      await onClone(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
      setPending(false);
    }
  }

  return (
    <Modal title={`Clone “${sourceName}”`} onClose={onClose} busy={pending} widthClassName="max-w-sm">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="block">
          <span className="text-secondary block font-mono text-[11px] tracking-[0.15em] uppercase">New name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="input border-neutral bg-base-100 focus:border-primary mt-1.5 w-full font-mono focus:outline-none"
            aria-invalid={!valid ? true : undefined}
          />
          {!valid && <span className="text-error mt-1 block text-[11px]">lowercase letters, digits and dashes</span>}
        </label>
        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || pending}>
            {pending ? "Cloning…" : "Clone"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
