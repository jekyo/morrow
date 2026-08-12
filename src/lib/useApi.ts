"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, MorrowClient } from "@/lib/api";

/** localStorage key holding the Morrow API key entered at /login. */
export const API_KEY_STORAGE_KEY = "morrow_api_key";

/**
 * Reads the stored API key and hands back a ready client. Redirects to
 * /login when no key is present. Returns null while that redirect is
 * pending (or before the client has mounted) so callers can render a
 * loading state instead of firing requests with no token.
 */
export function useClient(): MorrowClient | null {
  const router = useRouter();
  const [client, setClient] = useState<MorrowClient | null>(null);

  useEffect(() => {
    const key = window.localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!key) {
      router.replace("/login");
      return;
    }
    setClient(new MorrowClient(key));
  }, [router]);

  return client;
}

/** The raw key, for building ws URLs and connect snippets that bypass MorrowClient. */
export function useApiKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    setKey(window.localStorage.getItem(API_KEY_STORAGE_KEY));
  }, []);
  return key;
}

export interface ApiProfile {
  id: string;
  name: string;
  status: "stopped" | "starting" | "running" | "stopping";
  proxy: string | null;
  locale: string | null;
  timezone: string | null;
  viewport: { width: number; height: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSession {
  id: string;
  profileId: string;
  profileName: string;
  kind: "playwright" | "viewer" | "mcp" | "scrape";
  connectedAt: string;
  disconnectedAt: string | null;
}

export interface ApiEvent {
  id: number;
  profileId: string | null;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface ApiActivityBucket {
  date: string;
  sessions: number;
  starts: number;
  total: number;
}

export interface ApiMetrics {
  profiles: { total: number; running: number };
  sessions: { active: number };
  scrapes: { total24h: number; failed24h: number };
  system: { memory: number; uptime: number };
  activity: ApiActivityBucket[];
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

interface UseProfilesResult {
  profiles: ApiProfile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Dependency-free GET poller: useEffect + useState, no SWR/react-query.
 * `pollMs` re-fetches silently in the background (no loading flicker) so the
 * table/detail screen can stay live without a spinner on every tick.
 */
function usePoll<T>(
  client: MorrowClient | null,
  path: string,
  initial: T,
  unwrap: (data: unknown) => T,
  pollMs?: number
): { data: T; loading: boolean; error: string | null; refresh: () => Promise<void> } {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  const refresh = useCallback(async () => {
    if (!client) return;
    if (first.current) setLoading(true);
    try {
      const raw = await client.get(path);
      setData(unwrap(raw));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Request failed"));
    } finally {
      setLoading(false);
      first.current = false;
    }
  }, [client, path]);

  useEffect(() => {
    first.current = true;
    void refresh();
    if (!pollMs) return;
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { data, loading, error, refresh };
}

/** GET /profiles, polled lightly so status/session counts stay fresh. */
export function useProfiles(pollMs = 5000): UseProfilesResult {
  const client = useClient();
  const { data, loading, error, refresh } = usePoll<ApiProfile[]>(
    client,
    "/profiles",
    [],
    (raw) => (raw as { profiles: ApiProfile[] }).profiles,
    pollMs
  );
  return { profiles: data, loading, error, refresh };
}

interface UseProfileResult {
  profile: ApiProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** GET /profiles/:name, polled so start/stop transitions reflect without a manual reload. */
export function useProfile(name: string, pollMs = 3000): UseProfileResult {
  const client = useClient();
  const { data, loading, error, refresh } = usePoll<ApiProfile | null>(
    client,
    `/profiles/${encodeURIComponent(name)}`,
    null,
    (raw) => raw as ApiProfile,
    pollMs
  );
  return { profile: data, loading, error, refresh };
}

interface UseEventsResult {
  events: ApiEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** GET /profiles/:name/events, polled for the timeline panel. */
export function useEvents(name: string, pollMs = 4000): UseEventsResult {
  const client = useClient();
  const { data, loading, error, refresh } = usePoll<ApiEvent[]>(
    client,
    `/profiles/${encodeURIComponent(name)}/events`,
    [],
    (raw) => (raw as { events: ApiEvent[] }).events,
    pollMs
  );
  return { events: data, loading, error, refresh };
}

interface UseSessionsResult {
  sessions: ApiSession[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** GET /sessions (active only), polled — used to show per-profile session counts. */
export function useSessions(pollMs = 5000): UseSessionsResult {
  const client = useClient();
  const { data, loading, error, refresh } = usePoll<ApiSession[]>(
    client,
    "/sessions",
    [],
    (raw) => (raw as { sessions: ApiSession[] }).sessions,
    pollMs
  );
  return { sessions: data, loading, error, refresh };
}

interface UseMetricsResult {
  metrics: ApiMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** GET /metrics, polled every 15s per the UI spec. */
export function useMetrics(pollMs = 15000): UseMetricsResult {
  const client = useClient();
  const { data, loading, error, refresh } = usePoll<ApiMetrics | null>(
    client,
    "/metrics",
    null,
    (raw) => raw as ApiMetrics,
    pollMs
  );
  return { metrics: data, loading, error, refresh };
}
