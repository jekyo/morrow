"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setPending(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={pending} widthClassName="max-w-sm">
      <p className="text-secondary text-sm">{description}</p>
      {error && (
        <p className="text-error mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? "btn-error" : "btn-primary"}`}
          onClick={() => void confirm()}
          disabled={pending}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
