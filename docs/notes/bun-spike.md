# Bun compatibility spike — 2026-08-10

Decision input for switching Morrow's runtime from Node to Bun (spec §2).
Bun version tested: 1.3.13 (bf2e2cec)

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `bun run --bun vitest run` | FAIL — Bun crashes mid-run: `panic(main thread): NAPI FATAL ERROR: Error::New napi_get_last_error_info`, then "oh no: Bun has crashed. This indicates a bug in Bun, not your code." Vitest itself reported "Worker forks emitted error" / "Worker exited unexpectedly" and exited with code 1, despite 20/24 tests having passed before the crash. Fallback `bun x vitest run` (Bun running the vitest CLI, without `--bun` forcing Bun as the pool runtime) passed cleanly: 24/24 tests, 6/6 files. |
| Camoufox launch | `bun scripts/camoufox-smoke.ts` | PASS — printed `camoufox smoke: OK`. Playwright driver spawn, streams, and camoufox-js wrapper work fine under Bun. |
| Server boot (next + better-sqlite3) | `MORROW_API_KEY=secret MORROW_PORT=3103 MORROW_DATA_DIR=/tmp/bun-spike-data bun src/server/index.ts` | FAIL — same crash signature as the unit-test run: `panic(main thread): NAPI FATAL ERROR: Error::New napi_get_last_error_info`, process core-dumped before the HTTP server bound to the port. `curl http://localhost:3103/health` failed to connect (connection refused). |

**Outcome:** stay on Node for v1
**Blockers found:** Bun 1.3.13 panics with `NAPI FATAL ERROR: Error::New napi_get_last_error_info` when loading a native N-API addon (better-sqlite3) — reproduced both via `bun run --bun vitest run` (worker pool crash) and via directly booting `src/server/index.ts` (server process core-dumped, port never opened). Bun's own crash message identifies this as a Bun runtime bug, not an application bug. The Playwright/camoufox-js driver stack itself is unaffected — the smoke test passed cleanly.
