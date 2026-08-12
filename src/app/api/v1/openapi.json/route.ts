import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/server/openapi";

export const dynamic = "force-dynamic";

// Public: codegen tools and the /api-docs page fetch this without a key.
export async function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
