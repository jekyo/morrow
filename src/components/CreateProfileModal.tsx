"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Apple, Loader2, Monitor } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ApiClientError } from "@/lib/api";
import { useClient } from "@/lib/useApi";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const OS_OPTIONS: { value: "windows" | "macos" | "linux"; label: string }[] = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
];

interface ProxyCheckResult {
  ip: string;
  country: string;
  city: string | null;
  timezone: string;
  locale: string;
  rotating: boolean;
}

type ProxyCheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ProxyCheckResult }
  | { status: "error" };

const LOCALES = [
  { value: "", label: "Auto (from IP)" },
  { value: "en-US", label: "en-US — English (US)" },
  { value: "en-GB", label: "en-GB — English (UK)" },
  { value: "de-DE", label: "de-DE — German" },
  { value: "fr-FR", label: "fr-FR — French" },
  { value: "es-ES", label: "es-ES — Spanish" },
  { value: "pt-BR", label: "pt-BR — Portuguese (BR)" },
  { value: "ja-JP", label: "ja-JP — Japanese" },
  { value: "zh-CN", label: "zh-CN — Chinese (CN)" },
];

const TIMEZONES = [
  { value: "", label: "Auto (from IP)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
];

const VIEWPORTS: { value: string; label: string; width?: number; height?: number }[] = [
  { value: "", label: "Auto (system default)" },
  { value: "1280x800", label: "1280 × 800", width: 1280, height: 800 },
  { value: "1366x768", label: "1366 × 768", width: 1366, height: 768 },
  { value: "1440x900", label: "1440 × 900", width: 1440, height: 900 },
  { value: "1920x1080", label: "1920 × 1080", width: 1920, height: 1080 },
];

export function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const client = useClient();
  const [name, setName] = useState("");
  const [proxy, setProxy] = useState("");
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [viewport, setViewport] = useState("");
  const [os, setOs] = useState<"windows" | "macos" | "linux">("windows");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proxyCheck, setProxyCheck] = useState<ProxyCheckState>({ status: "idle" });
  const proxyCheckSeq = useRef(0);

  const nameTouched = name.length > 0;
  const nameValid = NAME_PATTERN.test(name);

  async function runProxyCheck(value: string) {
    const proxyValue = value.trim();
    if (!proxyValue || !client) return;
    const seq = ++proxyCheckSeq.current;
    setProxyCheck({ status: "loading" });
    try {
      const result = (await client.post("/proxy/check", { proxy: proxyValue })) as ProxyCheckResult;
      if (seq !== proxyCheckSeq.current) return;
      setProxyCheck({ status: "success", result });
    } catch {
      if (seq !== proxyCheckSeq.current) return;
      setProxyCheck({ status: "error" });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!client || !nameValid || pending) return;
    setPending(true);
    setError(null);
    try {
      const preset = VIEWPORTS.find((v) => v.value === viewport);
      await client.post("/profiles", {
        name,
        os,
        ...(proxy.trim() ? { proxy: proxy.trim() } : {}),
        ...(locale ? { locale } : {}),
        ...(timezone ? { timezone } : {}),
        ...(preset?.width && preset.height ? { viewport: { width: preset.width, height: preset.height } } : {}),
      });
      router.push(`/profiles/${encodeURIComponent(name)}`);
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Could not create the profile.");
      setPending(false);
    }
  }

  return (
    <Modal title="New Profile" onClose={onClose} busy={pending}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" hint={nameTouched && !nameValid ? "lowercase letters, digits and dashes" : undefined}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="x-marketing"
            spellCheck={false}
            autoComplete="off"
            className="input border-neutral bg-base-100 focus:border-primary w-full font-mono focus:outline-none"
            aria-invalid={nameTouched && !nameValid ? true : undefined}
          />
        </Field>

        <Field
          label="Proxy (optional)"
          action={
            proxy.trim() ? (
              <button
                type="button"
                onClick={() => runProxyCheck(proxy)}
                disabled={proxyCheck.status === "loading"}
                className="text-secondary hover:text-primary font-mono text-[11px] tracking-[0.1em] uppercase disabled:opacity-50"
              >
                {proxyCheck.status === "loading" ? "Checking…" : "Check"}
              </button>
            ) : undefined
          }
        >
          <input
            value={proxy}
            onChange={(e) => {
              setProxy(e.target.value);
              setProxyCheck({ status: "idle" });
            }}
            onBlur={() => proxy.trim() && runProxyCheck(proxy)}
            placeholder="user:pass@host:port"
            spellCheck={false}
            autoComplete="off"
            className="input border-neutral bg-base-100 focus:border-primary w-full font-mono focus:outline-none"
          />
          <div aria-live="polite">
            {proxyCheck.status === "loading" && (
              <p className="text-secondary mt-1.5 flex items-center gap-1.5 font-mono text-[11px]">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                checking…
              </p>
            )}
            {proxyCheck.status === "success" && (
              <p className="text-secondary mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px]">
                <span className="text-success" aria-hidden>
                  ●
                </span>
                <span>{proxyCheck.result.ip}</span>
                <span aria-hidden>·</span>
                <span>{[proxyCheck.result.city, proxyCheck.result.country].filter(Boolean).join(", ")}</span>
                <span aria-hidden>·</span>
                <span>{proxyCheck.result.timezone}</span>
                {proxyCheck.result.rotating && (
                  <span className="text-warning border-warning/40 bg-warning/10 ml-1 rounded px-1.5 py-0.5 text-[10px] tracking-[0.06em] uppercase">
                    rotating — WebRTC will be blocked
                  </span>
                )}
              </p>
            )}
            {proxyCheck.status === "error" && (
              <p className="text-error mt-1.5 text-[11px]" role="alert">
                Could not reach the proxy.
              </p>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Locale">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="select border-neutral bg-base-100 focus:border-primary w-full focus:outline-none"
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="select border-neutral bg-base-100 focus:border-primary w-full focus:outline-none"
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Viewport">
            <select
              value={viewport}
              onChange={(e) => setViewport(e.target.value)}
              className="select border-neutral bg-base-100 focus:border-primary w-full focus:outline-none"
            >
              {VIEWPORTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                {os === "macos" ? <Apple size={12} aria-hidden /> : <Monitor size={12} aria-hidden />}
                OS
              </span>
            }
          >
            <select
              value={os}
              onChange={(e) => setOs(e.target.value as "windows" | "macos" | "linux")}
              className="select border-neutral bg-base-100 focus:border-primary w-full focus:outline-none"
            >
              {OS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Browser Engine" caption="Firefox-based, anti-detect — Camoufox is the only supported engine">
          <select disabled value="camoufox" className="select border-neutral bg-base-100/60 w-full opacity-70">
            <option value="camoufox">Camoufox</option>
          </select>
        </Field>

        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!nameValid || pending}>
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  hint,
  caption,
  action,
  children,
}: {
  label: ReactNode;
  hint?: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-secondary font-mono text-[11px] tracking-[0.15em] uppercase">{label}</span>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="text-error mt-1 block text-[11px]">{hint}</span>}
      {caption && <span className="text-secondary/70 mt-1 block text-[11px]">{caption}</span>}
    </label>
  );
}
