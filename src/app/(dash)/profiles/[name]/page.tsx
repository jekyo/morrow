"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BrowserViewer } from "@/components/BrowserViewer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { formatRelativeTime } from "@/lib/format";
import { useApiKey, useClient, useEvents, useProfile, useSessions } from "@/lib/useApi";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export default function ProfileDetailPage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const router = useRouter();
  const client = useClient();
  const token = useApiKey();
  const { profile, loading, error, refresh } = useProfile(name);
  const { events, loading: eventsLoading } = useEvents(name);
  const { sessions } = useSessions();

  const [viewerActive, setViewerActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shouldShowViewer = viewerActive || profile?.status === "running" || profile?.status === "starting";

  const profileSessions = useMemo(() => sessions.filter((s) => s.profileName === name), [sessions, name]);

  // Connect snippets must use the page's actual scheme: wss/https on a TLS
  // deployment (e.g. morrow.jekyo.app), ws/http on plain localhost.
  const httpOrigin = typeof window !== "undefined" ? window.location.origin : "http://host";
  const wsOrigin =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://host";

  async function stop() {
    if (!client) return;
    setPending(true);
    setActionError(null);
    try {
      await client.post(`/profiles/${encodeURIComponent(name)}/stop`);
      setViewerActive(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Stop failed");
    } finally {
      setPending(false);
    }
  }

  if (loading && !profile) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton mt-6 h-96 w-full" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <Link href="/profiles" className="text-secondary hover:text-base-content font-mono text-[12px]">
          ← Profiles
        </Link>
        <p className="text-error mt-6 text-sm">{error}</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <Link href="/profiles" className="text-secondary hover:text-base-content font-mono text-[12px]">
        ← Profiles
      </Link>

      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe size={18} className="text-secondary shrink-0" aria-hidden />
          <h1 className="text-base-content text-2xl font-semibold">{profile.name}</h1>
          <StatusBadge status={profile.status} />
        </div>
        <div className="flex items-center gap-2">
          {profile.status === "stopped" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => setViewerActive(true)}>
              Start & Open
            </button>
          )}
          {profile.status === "running" && (
            <button type="button" className="btn btn-neutral btn-sm" disabled={pending} onClick={() => void stop()}>
              {pending ? "Stopping…" : "Stop"}
            </button>
          )}
          {profile.status === "starting" && (
            <button type="button" className="btn btn-sm" disabled>
              Starting…
            </button>
          )}
        </div>
      </div>
      {actionError && <p className="text-error mt-2 text-sm">{actionError}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {shouldShowViewer && token ? (
            <BrowserViewer name={name} token={token} viewportHint={profile.viewport ?? DEFAULT_VIEWPORT} />
          ) : (
            <div
              className="border-neutral bg-base-200 flex items-center justify-center rounded-lg border"
              style={{ aspectRatio: `${DEFAULT_VIEWPORT.width} / ${DEFAULT_VIEWPORT.height}` }}
            >
              <div className="text-center">
                <p className="text-secondary text-sm">This browser is stopped.</p>
                <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setViewerActive(true)}>
                  Start & Open
                </button>
              </div>
            </div>
          )}

          <Timeline events={events} loading={eventsLoading} />
        </div>

        <div className="flex flex-col gap-6">
          <RailSection title="State">
            <RailRow label="Status">
              <StatusBadge status={profile.status} />
            </RailRow>
            <RailRow label="Sessions">{profileSessions.length} connected</RailRow>
            <RailRow label="Proxy">{profile.proxy ?? "—"}</RailRow>
            <RailRow label="Locale">{profile.locale ?? "auto"}</RailRow>
            <RailRow label="Timezone">{profile.timezone ?? "auto"}</RailRow>
            <RailRow label="Updated">{formatRelativeTime(profile.updatedAt)}</RailRow>
          </RailSection>

          {profileSessions.length > 0 && (
            <RailSection title="Active sessions">
              {profileSessions.map((s) => (
                <RailRow key={s.id} label={s.kind}>
                  {formatRelativeTime(s.connectedAt)}
                </RailRow>
              ))}
            </RailSection>
          )}

          {token && (
            <RailSection title="Connect">
              <MaskedSnippet
                label="Playwright"
                text={`${wsOrigin}/playwright/${name}?token=${token}`}
                secretValue={token}
              />
              <MaskedSnippet
                label="Scrape"
                text={`curl -X POST ${httpOrigin}/api/v1/scrape \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"profile":"${name}","url":"https://example.com"}'`}
                secretValue={token}
              />
            </RailSection>
          )}

          <RailSection title="Danger zone">
            <button
              type="button"
              className="btn btn-error btn-sm w-full"
              disabled={profile.status !== "stopped"}
              title={profile.status !== "stopped" ? "Stop the profile first" : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              Delete profile
            </button>
          </RailSection>
        </div>
      </div>

      {confirmDelete && client && (
        <ConfirmDialog
          title={`Delete “${name}”`}
          description="This permanently removes the profile and its stored browser data. This cannot be undone."
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await client.del(`/profiles/${encodeURIComponent(name)}`);
            router.push("/profiles");
          }}
        />
      )}
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-neutral bg-base-200 rounded-lg border p-4">
      <p className="text-secondary font-mono text-[10px] tracking-[0.2em] uppercase">{title}</p>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-secondary font-mono text-[11px] uppercase">{label}</span>
      <span className="text-base-content truncate font-mono text-[12px]">{children}</span>
    </div>
  );
}

function MaskedSnippet({ label, text, secretValue }: { label: string; text: string; secretValue: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const display = revealed || !secretValue ? text : text.split(secretValue).join("•".repeat(8));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard permissions denied — silently ignore, the text is still selectable
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-secondary font-mono text-[10px] tracking-[0.15em] uppercase">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRevealed((r) => !r)} className="text-secondary hover:text-base-content font-mono text-[10px]">
            {revealed ? "hide" : "reveal"}
          </button>
          <button type="button" onClick={() => void copy()} className="text-secondary hover:text-base-content font-mono text-[10px]">
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>
      <pre className="bg-base-100 border-neutral mt-1 overflow-x-auto rounded-md border p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
        {display}
      </pre>
    </div>
  );
}
