export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export class MorrowClient {
  // Default wraps `fetch` in a plain function rather than passing the method
  // reference directly: native fetch throws "Illegal invocation" in real
  // browsers when called as `this.fetchImpl(...)` off an object other than
  // `window` (it requires `this === window`). The wrapper calls it as a
  // bare `fetch(...)`, which is unaffected by that check.
  constructor(private token: string, private fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  private async req(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return null;
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const env = (data as { error?: { code?: string; message?: string } }).error;
      throw new ApiClientError(env?.code ?? "error", env?.message ?? res.statusText, res.status);
    }
    return data;
  }
  get(path: string) { return this.req("GET", path); }
  post(path: string, body?: unknown) { return this.req("POST", path, body); }
  patch(path: string, body: unknown) { return this.req("PATCH", path, body); }
  del(path: string) { return this.req("DELETE", path); }
}
