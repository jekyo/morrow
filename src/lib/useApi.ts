"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MorrowClient } from "@/lib/api";

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

interface UseProfilesResult {
  profiles: ApiProfile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Dependency-free GET /profiles poller: useEffect + useState, no SWR/react-query. */
export function useProfiles(): UseProfilesResult {
  const client = useClient();
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await client.get("/profiles")) as { profiles: ApiProfile[] };
      setProfiles(data.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profiles, loading, error, refresh };
}
