/**
 * Process-wide singletons that survive Next.js bundling. The custom server
 * and Next's route-handler bundle each get their own module instances, so
 * module-level `let` caches are NOT shared — globalThis is.
 */
const store = ((globalThis as Record<string, unknown>).__morrow ??= {}) as Record<string, unknown>;

export function globalSingleton<T>(key: string, create: () => T): T {
  if (!(key in store)) store[key] = create();
  return store[key] as T;
}
