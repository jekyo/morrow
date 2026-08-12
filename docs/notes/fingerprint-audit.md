# Fingerprint audit — Camoufox browser — 2026-08-12

Per-property audit of the fingerprint Morrow's Camoufox profiles actually present to a
web page, and a prioritized list of improvements. Investigation only — no source files
were changed to produce it.

## 1. Summary & methodology

A default Morrow profile (no proxy, no explicit locale/timezone/viewport) was launched
through `CamoufoxRuntime.start()` exactly as the server does, then driven to
`example.com` / `httpbin.org` while each fingerprint surface was read two ways: the value
the browser *presents* and an independent `page.evaluate()` probe. The launch host is in
Romania, so geoip-derived values below resolve to Bucharest — that is expected and is the
system working, not a defect.

### Environment

| Component | Version |
| --- | --- |
| Node | v25.9.0 |
| playwright-core | 1.60.0 (pinned via `package.json` overrides) |
| camoufox-js | 0.12.0 |
| Camoufox browser | **152.0.4-beta.28** (`~/.cache/camoufox`, BuildID 20260719045650) |
| Firefox base | **152** (observed UA `Firefox/152.0`) |
| Latest stable Firefox | **153.0.3** (2026-08-04); 154 due 2026-08-14 |

### Key facts about how the identity is assembled

- `generateFingerprint(profile)` calls camoufox-js `generateFingerprint(window, { operatingSystems: ["linux"] })`.
  **OS is hardcoded to `linux`.** The `Profile` type has no `os` field at all.
- browserforge (inside camoufox-js) samples a real-world Firefox fingerprint — its raw UA
  here was `Firefox/150.0`. At launch, camoufox-js `_castToProperties` regex-rewrites any
  `1XX.0` version token to the **installed binary's** version (152). So the presented UA
  version tracks the Camoufox binary automatically; browserforge's own version number does
  not leak through. This matters for the "UA freshness" recommendation below.
- Audio/canvas/font-spacing seeds are pinned per profile (already fixed — see
  `camoufox.ts` `StoredFingerprint`), so noise is stable across restarts. Confirmed: the
  audio fingerprint sum was deterministic.

Note on the prior "Firefox 142" finding: the binary in this checkout has since been
upgraded to 152, so the observed UA is now `Firefox/152.0`, not 142. The *mechanism*
(version = whatever binary is installed) is unchanged; the freshness concern still stands
because 152 already trails stable 153/154.

---

## 2. Per-property findings

Legend: OK = realistic and internally consistent; ⚠ = weak / mild tell; ✗ = clear tell or leak.

### navigator/

| Property | Observed value | Verdict | Notes / recommendation |
| --- | --- | --- | --- |
| `userAgent` | `Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0` | ⚠ | Well-formed, but **X11/Linux desktop Firefox is a rare, mildly suspicious population** and 152 trails stable 153. See P0-OS and P1-UA. |
| `platform` | `Linux x86_64` | ⚠ | Consistent with UA — but only because everything is forced to Linux. |
| `oscpu` | `Linux x86_64` | ⚠ | Consistent with UA/platform. |
| `vendor` | `""` (empty) | OK | Correct for Firefox. |
| `productSub` | `20100101` | OK | Correct frozen Firefox value. |
| `buildID` | `20181001000000` | OK | Correct RFP-frozen value (real Firefox with resistFingerprinting reports exactly this). |
| `hardwareConcurrency` | `8` | OK | Plausible desktop value, sampled by browserforge. |
| `deviceMemory` | `undefined` | OK | Correct — Firefox does not implement `deviceMemory`. |
| `maxTouchPoints` | `0` | OK | Correct for desktop. |
| `languages` / `language` | `["ro-RO","ro"]` / `ro-RO` | OK | geoip-derived (Romania). Matches `Accept-Language`. |
| `webdriver` | `false` | OK | Correctly suppressed. |
| `userAgentData` | `null` | OK | Correct — Firefox does not implement Client Hints. No `Sec-CH-UA*` headers either (confirmed). |
| `plugins` | `PDF Viewer, Chrome PDF Viewer, Chromium PDF Viewer, Microsoft Edge PDF Viewer, WebKit built-in PDF` | OK | This is Firefox 100+'s hardcoded PDF pseudo-plugin set — correct and identical on real Firefox. |
| `mimeTypes` | `application/pdf, text/pdf` | OK | Correct. |

### screen/ & window/

| Property | Observed | Verdict | Notes |
| --- | --- | --- | --- |
| `screen.width × height` | `1485 × 928` | ⚠ | **Non-standard resolution.** Sampled from browserforge's real data (a fractional-scaled HiDPI Linux display), but not a common 1920×1080/1366×768 value; mildly distinctive. |
| `availWidth/Height` | `1485 × 928` (== screen) | ⚠ | No space reserved for OS chrome. Plausible on Linux; on a *Windows* profile a full-height `availHeight == height` (no taskbar) would be a mild tell. |
| `colorDepth` / `pixelDepth` | `24` / `24` | OK | Correct. |
| `devicePixelRatio` | `1` | OK | Consistent with the presented (non-scaled) window. |
| `innerWidth × innerHeight` | `1280 × 720` | OK | Default content size. |
| `outerWidth × outerHeight` | `1485 × 896` | OK | Consistent (outer ≥ inner, chrome height accounted). |
| `screenX / screenY` | `0 / 0` | OK | Consistent. |
| toolbars (`menubar.visible` …) | all `true` | OK | Correct for real Firefox (all bars report visible). |

### headers/

| Header | Observed | Verdict |
| --- | --- | --- |
| `User-Agent` | `…Firefox/152.0` | OK — matches `navigator.userAgent` exactly. |
| `Accept-Language` | `ro-RO,ro;q=0.9` | OK — matches `navigator.languages`. |
| `Accept` | `text/html,application/xhtml+xml,…` | OK — Firefox order. |
| `Accept-Encoding` | `gzip, deflate, br, zstd` | OK. |
| `Sec-Fetch-*`, `Priority: u=0, i`, `Upgrade-Insecure-Requests: 1` | present | OK — modern Firefox set. |
| `Sec-CH-UA*` | absent | OK — Firefox correctly sends no Client Hints. |

### geolocation/ (timezone, locale, coords)

| Property | Observed | Verdict |
| --- | --- | --- |
| `Intl…timeZone` | `Europe/Bucharest` | OK — geoip from egress IP. |
| `Intl…locale` | `ro` | OK. |
| `getTimezoneOffset` | `-180` (EEST) | OK — matches zone. |
| `geolocation.getCurrentPosition` | `44.447, 26.0185` (±79 m) | OK — Bucharest, matches TZ/locale. |

Cross-check: UA-language, `Accept-Language`, `Intl` locale, timezone and geolocation coords
are **all mutually consistent** (Romania). geoip consistency is working well. The only
inconsistency in this whole cluster is that they describe a Romanian user on a *Linux
desktop* — see OS below.

### webrtc/

No-proxy launch, STUN `stun.l.google.com`:

| Candidate | Observed | Verdict |
| --- | --- | --- |
| host | `…<uuid>.local 54050 typ host` | OK — mDNS-obfuscated, **no local/LAN IP leak**. |
| srflx | `82.76.168.35 … typ srflx raddr 0.0.0.0` | OK — equals the HTTP egress IP (`api.ipify.org` returned `82.76.168.35`). `raddr` masked. |
| IPv6 | none | OK — no IPv6 leak. |

**No-proxy WebRTC is clean and consistent** (WebRTC srflx == HTTP egress). The problem is
the **proxy** case (confirmed by code inspection, matching the prior live finding):

- camoufox-js `utils.js` `launchOptions`: when `geoip:true`, it calls
  `publicIP(proxyUrl)` and sets `config["webrtc:ipv4"]` + geolocation/timezone from that IP.
- `publicIP` (`ip.js`) fetches the IP **through `impit`** (a Rust/Tokio HTTP client) with
  `proxyUrl`. Per the prior finding, impit does **not** reliably egress through the proxy,
  so the IP it returns (and thus `webrtc:ipv4`, timezone, geolocation) can be the **real
  machine IP**, not the proxy exit. Result: with an HTTP proxy, the WebRTC srflx candidate
  can expose the real host IP while HTTP traffic goes through the proxy — a hard leak and a
  strong correlation tell. (Node's undici `ProxyAgent` routes the same request correctly;
  impit did not.) This is ✗ and is the single most important fix. See P0-WEBRTC.

Rotating vs sticky: even once Morrow resolves the egress IP itself, a **sticky** session
lets WebRTC srflx match the HTTP exit; a **rotating** proxy uses a different exit per
request, so a fixed `webrtc:ipv4` cannot match live HTTP — for rotating proxies WebRTC
should instead be blocked (`block_webrtc`) rather than pinned to a stale IP.

### webgl/

| Property | Observed | Verdict |
| --- | --- | --- |
| `VENDOR` / `RENDERER` | `Mozilla` / `NVIDIA GeForce GTX 980, or similar` | OK |
| `UNMASKED_VENDOR_WEBGL` | `NVIDIA Corporation` | OK |
| `UNMASKED_RENDERER_WEBGL` | `NVIDIA GeForce GTX 980, or similar` | OK — the `, or similar` suffix is Firefox RFP's sanitized form; realistic. |
| WebGL2 params | `MAX_TEXTURE_SIZE 32768`, `MAX_VERTEX_ATTRIBS 16`, 15 WebGL2 / 28 WebGL1 extensions, frag HIGH_FLOAT `[127,127,23]` | OK — coherent NVIDIA/Linux profile. |

**Consistent with the Linux OS** (NVIDIA GPU on Linux is common and believable). This is a
latent risk, not a current defect: the WebGL GPU is chosen by browserforge to match the OS,
so it is only correct *because* OS is Linux. If OS selection is added (P0-OS) without
ensuring the WebGL vendor/renderer is drawn from a GPU pool appropriate to the chosen OS,
you get tells like a macOS UA with an NVIDIA renderer (Apple Silicon Macs report `Apple
M-series`; Intel Macs report Intel/AMD). camoufox-js already samples the GPU per-OS from
browserforge, so passing the right `operatingSystems` should keep this consistent — must be
verified per OS (see P1-WEBGL).

### media-audio/

| Property | Observed | Verdict |
| --- | --- | --- |
| audio fingerprint (OfflineAudioContext sum) | deterministic, seeded | OK — stable across restarts (seed pinned). |
| `AudioContext.sampleRate` | `48000` | OK. |
| `destination.maxChannelCount` | `2` | OK — stereo, plausible. |
| `mediaDevices.enumerateDevices()` | `audioinput` + `videoinput`, empty labels, no deviceId | OK — correct pre-permission Firefox shape (labels hidden until granted). |

### voices/ (speechSynthesis)

| Property | Observed | Verdict |
| --- | --- | --- |
| `speechSynthesis.getVoices()` | **14,805 voices**, 140 languages, names like `Urdu+RicishayMax2`, `Turkish+Lee`, `Basque+female4`, all `localService:false` | ✗ **Strong tell** |

This is the **second most important finding**. Camoufox is exposing the entire
**eSpeak-NG** voice list (thousands of `Language+Variant` entries) with `localService:false`.
Real desktop Firefox exposes a small, OS-specific set: macOS → Apple voices (Samantha,
Alex, …), Windows → Microsoft voices (David, Zira, …) via SAPI, Linux → usually **0** voices
in a headless setup or a handful via speech-dispatcher. A 14k-entry eSpeak list matches
**no** real consumer OS and does not vary with the chosen OS — it is an outlier that a
fingerprinting service can key on directly. See P1-VOICES.

### fonts/

| Property | Observed | Verdict |
| --- | --- | --- |
| Detectable common fonts | `Arial`, `Times New Roman`, `Courier New` only; **not** detected: DejaVu Sans, Liberation Sans, Ubuntu, Cantarell, Noto Sans, Segoe UI, Calibri, San Francisco, Helvetica Neue | ⚠ |

Camoufox ships its own font bundle and restricts enumeration to it. The bundle **is
OS-partitioned** — `~/.cache/camoufox/fonts/{linux,macos,windows}/` (143 / 61 / 144 files).
So fonts *do* follow the OS automatically once OS selection exists (good). Two nits: (a) the
Linux bundle uses metric-compatible clones (Arimo→Arial, Tinos→Times, Cousine→Courier),
which is why Arial/Times/Courier "exist" on a Linux box while the actual Linux staples
(DejaVu/Liberation) are *not* individually detectable — a mild Linux inconsistency; (b) only
3 of a common test set were detectable, which is a deliberately narrow, deterministic set.
Low severity; mostly resolves itself when OS is chosen correctly. See P2-FONTS.

### document/, addons/, cursor-movement/, miscellaneous/

| Property | Observed | Verdict |
| --- | --- | --- |
| `window.chrome` | `undefined` | OK — correct for Firefox (a `chrome` object would be a Chromium tell). |
| `navigator.getBattery` | `undefined` | OK — Firefox removed the Battery API. |
| `navigator.connection` | `null` | OK — Firefox does not expose Network Information API. |
| `performance.memory` | absent | OK — Chromium-only; correctly absent. |
| `navigator.permissions.query` / `getGamepads` | functions present | OK. |
| `document.referrer` | `""` | OK. |
| addons/humanize/cursor | not separately reproduced | — Camoufox's `humanize` cursor and addon-hiding are launch options Morrow does not currently toggle; no tell observed, not exercised here. |

---

## 3. Consistency verdict (the #1 detection vector)

The cluster **UA ↔ platform ↔ oscpu ↔ Accept-Language ↔ Intl locale ↔ timezone ↔
geolocation ↔ WebGL vendor** is internally consistent for a **Romanian user on a Linux/NVIDIA
desktop**. Nothing in that chain contradicts itself. The weaknesses are:

1. The whole population is *Linux desktop Firefox* — coherent but rare, so every Morrow
   profile lands in the same small, slightly suspicious bucket and profiles are not
   diverse across OSes.
2. **speechSynthesis voices** contradict every real OS (14k eSpeak voices) — the one clear
   cross-property inconsistency.
3. With a **proxy**, the WebRTC/geo/timezone chain can silently desync from the HTTP exit IP
   because the egress-IP lookup does not go through the proxy — turning a consistent
   identity into a leaking one.

---

## 4. Prioritized improvement list

### P0 — leaks / highest value

**P0-WEBRTC — Resolve the proxy egress IP in Morrow, don't trust camoufox geoip.**
Rationale: with an HTTP proxy the WebRTC srflx candidate can expose the real machine IP
(impit's `publicIP(proxy)` does not reliably egress through the proxy), while HTTP goes via
the proxy — a hard deanonymization leak and correlation tell.
Where: `buildCamoufoxOptions` / `CamoufoxRuntime.start` in
`src/server/browser/camoufox.ts`. Before launch, when `profile.proxy` is set, resolve the
egress IP *ourselves* via undici `ProxyAgent` (a preflight `GET https://api.ipify.org`
through the proxy), then pass it explicitly instead of `geoip:true`:
set `config["webrtc:ipv4"]` (and IPv6 if applicable), and derive timezone + geolocation from
that IP (Camoufox ships `GeoLite2-City.mmdb`; camoufox-js exposes `getGeolocation`). Add a
**preflight check**: if the proxy is unreachable, fail the start with a clear error rather
than silently falling back to the host IP. For **rotating** proxies (egress differs per
request, so no single IP can match), prefer `block_webrtc:true` over pinning a stale IP; make
this a per-profile flag (sticky → pin, rotating → block).

**P0-OS — Let profiles choose the OS; stop hardcoding `linux`.**
Rationale: every profile is `X11; Linux x86_64`, a rare and mildly suspicious population;
users want realistic Windows/macOS identities and cross-profile diversity.
Where: add `os: "windows" | "macos" | "linux"` to the `Profile` type (`src/server/db.ts`)
and profile-creation flow (`src/server/profiles.ts`); in
`CamoufoxRuntime.generateFingerprint` pass `operatingSystems: [profile.os]` instead of the
hardcoded `["linux"]`. This makes UA, `platform`, `oscpu`, screen chrome, fonts, and the
WebGL GPU pool all follow from one field (camoufox-js samples them per-OS). Default new
profiles to `windows` (by far the most common real population) rather than `linux`, and/or
randomize weighted by real market share.

### P1 — clear tells / realism

**P1-VOICES — Constrain `speechSynthesis` voices to an OS-appropriate set.**
Rationale: 14,805 eSpeak voices match no real OS and are a direct, high-signal tell that
doesn't change with the chosen OS.
Where: this is Camoufox launch-config territory, not something `page.evaluate` can fix after
the fact. Investigate Camoufox's voice handling (there is no per-OS voice spoof in 152 as
shipped); options: (a) run the browser in an environment without eSpeak/speech-dispatcher so
`getVoices()` returns the realistic Linux-empty/small set, (b) file/track an upstream
Camoufox request for per-OS voice spoofing to match the chosen `os`, or (c) as an interim,
inject a page-init script that overrides `speechSynthesis.getVoices` with an OS-appropriate
list. Verify the fix against each target OS.

**P1-UA — Keep profiles on a recent Firefox by tracking the Camoufox binary.**
Rationale: presented UA version = installed Camoufox binary (152), which already trails
stable Firefox 153.0.3 (154 imminent). browserforge's own sampled version (150 here) is
irrelevant because Camoufox rewrites it to the binary version at launch.
Where: not a code change in `generateFingerprint` — it's a **dependency/ops** task. Pin and
routinely bump the Camoufox binary (and `camoufox-js`) so the binary stays within ~1 stable
Firefox release of current; surface the resolved Firefox version in health/metrics so drift
is visible. Optionally validate at startup that the binary's major version is within N of a
known-latest constant and warn if stale.

**P1-WEBGL — Verify WebGL GPU realism per chosen OS.**
Rationale: once P0-OS lands, a mismatched GPU (e.g. macOS UA + NVIDIA renderer, or Apple GPU
on a Linux UA) becomes a tell. Today (Linux + NVIDIA) it is consistent.
Where: after wiring `operatingSystems:[os]`, spot-check `UNMASKED_VENDOR/RENDERER_WEBGL` for
each OS: macOS should report `Apple`/`Apple M#` (or Intel/AMD for older Macs), Windows a
plausible ANGLE/Direct3D or vendor string, Linux Mesa/NVIDIA/AMD. camoufox-js samples per-OS,
so this is mainly a verification + guardrail task; add an assertion/test that vendor∈{allowed
set for os}.

### P2 — polish

**P2-SCREEN — Prefer common screen resolutions.**
Rationale: `1485×928` is a non-standard, mildly distinctive resolution, and `availHeight ==
height` reads oddly on a Windows profile (no taskbar reserved). Low severity.
Where: optionally constrain browserforge's sampled `screen` (or override `window`) to common
resolutions per OS, and ensure `availHeight` reserves OS chrome for Windows/macOS profiles.

**P2-FONTS — Sanity-check the font bundle matches the OS.**
Rationale: Camoufox already partitions fonts by OS (`fonts/{linux,macos,windows}`), so this
largely self-resolves with P0-OS. The only nit is the Linux bundle exposing Windows-named
metric clones (Arial/Times/Courier) but not DejaVu/Liberation. Low severity.
Where: after P0-OS, add a test that a small OS-signature font set is detectable for each OS
(e.g. Segoe UI on Windows, San Francisco/Helvetica Neue on macOS, DejaVu/Liberation on Linux).

### Already solid — leave alone

- `navigator.webdriver` suppressed; `userAgentData`/`Sec-CH-UA` correctly absent (Firefox).
- `plugins`/`mimeTypes` = correct Firefox PDF pseudo-plugin set.
- Absence of Chromium-only surfaces (`window.chrome`, `performance.memory`, `getBattery`,
  `navigator.connection`) — all correctly undefined.
- Audio/canvas/font-spacing seeds pinned → stable fingerprint across restarts.
- No-proxy WebRTC: mDNS host obfuscation, srflx == HTTP egress, no IPv6/LAN leak.
- geoip consistency: timezone/locale/geolocation/Accept-Language all agree with the egress IP.
- `buildID`/`productSub` frozen to correct RFP values.

---

## 5. How to reproduce

Run from the repo root; the probe launches a default profile, reads every surface twice,
and dumps JSON:

```
node scratch-audit.mjs   # scratch script used for this audit; not committed
```

(Filter camoufox's noisy stderr — `iKnowWhatImDoing` / `BrowserForge` — as the script does.)
The proxy-WebRTC leak is reproduced via the existing `webrtc-probe.mjs` with a proxy set on
the profile.
