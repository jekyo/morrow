import type { Metadata } from "next";
import Link from "next/link";
import { Swagger } from "./swagger";

export const metadata: Metadata = {
  title: "Morrow API reference",
  description: "Interactive OpenAPI reference for the Morrow HTTP API.",
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-base-100">
      <header className="border-base-300 border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div>
            <Link href="/" className="text-primary font-mono text-sm tracking-widest uppercase">
              Morrow
            </Link>
            <h1 className="mt-2 text-3xl font-semibold">API reference</h1>
            <p className="text-secondary mt-1 max-w-2xl text-sm">
              Persistent browser profiles, Playwright attach and browserless-style scraping. Authenticate with{" "}
              <code className="text-accent font-mono">Authorization: Bearer &lt;MORROW_API_KEY&gt;</code>.
            </p>
          </div>
          <a
            href="/api/v1/openapi.json"
            className="border-base-300 hover:border-primary hover:text-primary rounded-md border px-4 py-2 font-mono text-sm transition-colors"
          >
            openapi.json
          </a>
        </div>
      </header>
      <Swagger />
    </main>
  );
}
