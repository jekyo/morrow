export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toErrorBody(err: unknown): { error: { code: string; message: string } } {
  if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
  return { error: { code: "internal_error", message: "Internal error" } };
}
