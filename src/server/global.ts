/**
 * Process-wide singletons that survive Next.js bundling. The custom server
 * and Next's route-handler bundle each get their own module instances, so
 * module-level `let` caches are NOT shared — globalThis is.
 */
function store(): Record<string, unknown> {
  return ((globalThis as Record<string, unknown>).__morrow ??= {}) as Record<string, unknown>;
}

export function globalSingleton<T>(key: string, create: () => T): T {
  const s = store();
  if (!(key in s)) s[key] = create();
  return s[key] as T;
}

/**
 * Async variant: the in-flight promise is stored synchronously so concurrent
 * callers share one creation, and a *failed* creation is evicted so the next
 * caller retries instead of inheriting a permanently rejected promise.
 */
export function globalSingletonAsync<T>(key: string, create: () => Promise<T>): Promise<T> {
  const s = store();
  const existing = s[key] as Promise<T> | undefined;
  if (existing) return existing;
  const promise = create().catch((err: unknown) => {
    if (s[key] === promise) delete s[key];
    throw err;
  });
  s[key] = promise;
  return promise;
}

/**
 * Forget a singleton so the next caller creates a fresh one. The value itself
 * is untouched, so a caller still holding it keeps working — which is what
 * lets a resource be retired while the work already using it finishes.
 */
export function dropGlobalSingleton(key: string): void {
  delete store()[key];
}
