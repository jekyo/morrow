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

/** Patterns are compiled with `new RegExp` at request time — reject bad ones as 400, not 500. */
function isRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// Base fields shared by content/screenshot/scrape requests. Kept refine-free so it can be
// `.merge()`d with endpoint-specific fields; each *final* schema below applies its own single
// `.refine()` requiring url-or-html. (Composing `.and()` on an already-`.refine()`d ZodEffects
// produces a ZodIntersection whose `.shape` isn't available, and stacking a second `.refine()`
// on top of that is awkward — merge-then-refine-once keeps a plain object shape and one clear
// error path.)
const pageOptionsFields = z.object({
  url: z.string().url().optional(),
  html: z.string().optional(),
  profile: profileName.optional(),
  gotoOptions: z
    .object({
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
      timeout: z.number().int().positive().max(120000).optional(),
    })
    .optional(),
  waitForSelector: z
    .object({ selector: z.string().min(1), timeout: z.number().int().positive().max(120000).optional() })
    .optional(),
  waitForTimeout: z.number().int().nonnegative().max(60000).optional(),
  waitForFunction: z
    .object({ fn: z.string().min(1), timeout: z.number().int().positive().max(120000).optional() })
    .optional(),
  bestAttempt: z.boolean().optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  rejectResourceTypes: z.array(z.string()).optional(),
  rejectRequestPattern: z.array(z.string().refine(isRegex, "must be a valid regular expression")).optional(),
  setExtraHTTPHeaders: z.record(z.string(), z.string()).optional(),
});

const requireUrlOrHtml = (v: { url?: string; html?: string }) => v.url !== undefined || v.html !== undefined;
const urlOrHtmlIssue = { message: "one of url or html is required" };

export const pageOptionsSchema = pageOptionsFields.refine(requireUrlOrHtml, urlOrHtmlIssue);

export const screenshotSchema = pageOptionsFields
  .merge(
    z.object({
      fullPage: z.boolean().optional(),
      type: z.enum(["png", "jpeg"]).optional(),
      quality: z.number().int().min(0).max(100).optional(),
      selector: z.string().min(1).optional(),
    })
  )
  .refine(requireUrlOrHtml, urlOrHtmlIssue);

export const scrapeSchema = pageOptionsFields
  .merge(
    z.object({
      format: z.enum(["markdown", "text", "article"]).default("markdown"),
      elements: z.array(z.object({ selector: z.string().min(1) })).optional(),
    })
  )
  .refine(requireUrlOrHtml, urlOrHtmlIssue);

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
