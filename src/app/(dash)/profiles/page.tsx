"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { ClonePrompt } from "@/components/ClonePrompt";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CreateProfileModal } from "@/components/CreateProfileModal";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeTime } from "@/lib/format";
import { type ApiProfile, useClient, useProfiles, useSessions } from "@/lib/useApi";

type RowAction = null | { kind: "clone"; name: string } | { kind: "reset"; name: string } | { kind: "delete"; name: string };

export default function ProfilesPage() {
  const { profiles, loading, error, refresh } = useProfiles();
  const { sessions } = useSessions();
  const client = useClient();
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ name: string; message: string } | null>(null);

  const sessionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(s.profileName, (m.get(s.profileName) ?? 0) + 1);
    return m;
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, query]);

  async function withBusy(name: string, fn: () => Promise<void>) {
    setBusyName(name);
    setRowError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setRowError({ name, message: err instanceof Error ? err.message : "Action failed" });
    } finally {
      setBusyName(null);
    }
  }

  async function start(p: ApiProfile) {
    if (!client) return;
    await withBusy(p.name, () => client.post(`/profiles/${encodeURIComponent(p.name)}/start`).then(() => {}));
  }
  async function stop(p: ApiProfile) {
    if (!client) return;
    await withBusy(p.name, () => client.post(`/profiles/${encodeURIComponent(p.name)}/stop`).then(() => {}));
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base-content text-2xl font-semibold">Profiles</h1>
          <p className="text-secondary mt-1 font-mono text-[12px]">
            {loading ? "loading…" : `${profiles.length} profile${profiles.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Profile
        </button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          spellCheck={false}
          className="input border-neutral bg-base-200 focus:border-primary w-64 font-mono text-sm focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-error mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {/* No overflow-hidden here: it would clip the row action dropdowns.
          Rounded corners come from the border alone. */}
      <div className="border-neutral bg-base-200 mt-6 rounded-lg border">
        {loading ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          profiles.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} />
          ) : (
            <div className="text-secondary px-6 py-14 text-center text-sm">No profiles match “{query}”.</div>
          )
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-neutral text-secondary border-b font-mono text-[11px] tracking-[0.1em] uppercase">
                <th className="px-5 py-3 text-left font-medium">Profile</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Last Active</th>
                <th className="px-5 py-3 text-left font-medium">Sessions</th>
                <th className="px-5 py-3 text-left font-medium">Proxy</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-neutral hover:bg-base-300/40 border-b last:border-b-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/profiles/${encodeURIComponent(p.name)}`}
                      className="text-base-content hover:text-primary inline-flex items-center gap-2 font-medium"
                    >
                      <Globe size={14} className="text-secondary shrink-0" aria-hidden />
                      {p.name}
                    </Link>
                    {rowError?.name === p.name && <div className="text-error mt-0.5 text-[11px]">{rowError.message}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="text-secondary px-5 py-3 font-mono text-[12px]">{formatRelativeTime(p.updatedAt)}</td>
                  <td className="text-secondary px-5 py-3 font-mono text-[12px]">{sessionCounts.get(p.name) ?? "—"}</td>
                  <td className="text-secondary px-5 py-3 font-mono text-[12px]">{p.proxy ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === "running" ? (
                        <Link href={`/profiles/${encodeURIComponent(p.name)}`} className="btn btn-neutral btn-sm">
                          Open
                        </Link>
                      ) : p.status === "stopped" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyName === p.name}
                          onClick={() => void start(p)}
                        >
                          {busyName === p.name ? "Starting…" : "Start"}
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm" disabled>
                          {p.status === "starting" ? "Starting…" : "Stopping…"}
                        </button>
                      )}

                      <div className="dropdown dropdown-end">
                        <button tabIndex={0} type="button" className="btn btn-ghost btn-sm px-2" aria-label={`More actions for ${p.name}`}>
                          ···
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu border-neutral bg-base-200 z-10 mt-1 w-40 rounded-md border p-1 text-sm shadow-lg"
                        >
                          {p.status === "running" && (
                            <li>
                              <button type="button" onClick={() => void stop(p)} disabled={busyName === p.name}>
                                Stop
                              </button>
                            </li>
                          )}
                          <li>
                            <button
                              type="button"
                              disabled={p.status !== "stopped"}
                              title={p.status !== "stopped" ? "Stop the profile first" : undefined}
                              onClick={() => setRowAction({ kind: "clone", name: p.name })}
                            >
                              Clone
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              disabled={p.status !== "stopped"}
                              title={p.status !== "stopped" ? "Stop the profile first" : undefined}
                              onClick={() => setRowAction({ kind: "reset", name: p.name })}
                            >
                              Reset
                            </button>
                          </li>
                          <li>
                            <button
                              type="button"
                              className="text-error"
                              disabled={p.status !== "stopped"}
                              title={p.status !== "stopped" ? "Stop the profile first" : undefined}
                              onClick={() => setRowAction({ kind: "delete", name: p.name })}
                            >
                              Delete
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateProfileModal onClose={() => setShowCreate(false)} />}

      {rowAction?.kind === "clone" && client && (
        <ClonePrompt
          sourceName={rowAction.name}
          onClose={() => setRowAction(null)}
          onClone={async (newName) => {
            await client.post(`/profiles/${encodeURIComponent(rowAction.name)}/clone`, { name: newName });
            await refresh();
          }}
        />
      )}

      {rowAction?.kind === "reset" && client && (
        <ConfirmDialog
          title={`Reset “${rowAction.name}”`}
          description="This clears the profile's browser data (cookies, storage, logins). The profile itself is kept. This cannot be undone."
          confirmLabel="Reset"
          danger
          onClose={() => setRowAction(null)}
          onConfirm={async () => {
            await client.post(`/profiles/${encodeURIComponent(rowAction.name)}/reset`);
            await refresh();
          }}
        />
      )}

      {rowAction?.kind === "delete" && client && (
        <ConfirmDialog
          title={`Delete “${rowAction.name}”`}
          description="This permanently removes the profile and its stored browser data. This cannot be undone."
          confirmLabel="Delete"
          danger
          onClose={() => setRowAction(null)}
          onConfirm={async () => {
            await client.del(`/profiles/${encodeURIComponent(rowAction.name)}`);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-base-content text-sm">No profiles yet.</p>
      <p className="text-secondary mt-1 text-sm">Create a persistent browser profile to get started.</p>
      <button type="button" className="btn btn-primary mt-5" onClick={onCreate}>
        Create Profile
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-neutral divide-y">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-5 py-4">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-10" />
          <div className="skeleton ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
