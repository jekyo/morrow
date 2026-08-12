import type { Profile } from "@/server/db";

export function profileJson(p: Profile, running: boolean) {
  return {
    id: p.id,
    name: p.name,
    status: running ? "running" : p.status,
    proxy: p.proxy,
    locale: p.locale,
    timezone: p.timezone,
    os: p.os,
    viewport: p.viewportWidth && p.viewportHeight ? { width: p.viewportWidth, height: p.viewportHeight } : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
