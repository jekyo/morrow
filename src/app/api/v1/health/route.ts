import { NextResponse } from "next/server";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, version: pkg.version });
}
