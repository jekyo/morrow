import { z } from "zod";
import { ApiError } from "@/server/errors";

export const profileName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lowercase letters, digits and dashes; must start alphanumeric");

export const createProfileSchema = z.object({
  name: profileName,
  proxy: z.string().min(1).optional(),
  locale: z.string().min(2).optional(),
  timezone: z.string().min(1).optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
});

export const updateProfileSchema = z.object({
  proxy: z.string().min(1).nullable().optional(),
  locale: z.string().min(2).nullable().optional(),
  timezone: z.string().min(1).nullable().optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
});

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("invalid_request", "Body must be JSON", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError("invalid_request", `${first.path.join(".") || "body"}: ${first.message}`, 400);
  }
  return result.data;
}
