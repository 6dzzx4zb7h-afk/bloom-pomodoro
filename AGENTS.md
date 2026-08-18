# AGENTS.md

**Read [`CLAUDE.md`](CLAUDE.md) — it is the full and only guidance for this repository.**

This file used to be a byte-for-byte duplicate of it, which meant two files to keep in sync and a
guarantee they would eventually drift. It is now a pointer.

Current work is listed in [`ROADMAP.md`](ROADMAP.md). The retired 93-step build plan is archived at
[`docs/archive/plan-2026.md`](docs/archive/plan-2026.md) and is still the best explanation of why
Bloom is shaped the way it is.

The four hard constraints are repeated here so they cannot be missed, but `CLAUDE.md` is
authoritative:

1. **Local-first, no network.** No application-data requests, no user data sent, ever. No account,
   ads, tracking, telemetry, CDN, remote fonts, or remote runtime assets. Everything bundles; the
   complete app works offline.
2. **Persisted-state changes bump `SCHEMA_VERSION` and append a forward migration.** Never wipe or
   orphan user data.
3. **Warm kawaii voice** — the pet suggests and encourages; it never guilts, shames, or moralizes.
   `docs/voice.md` is binding for every user-visible string.
4. **Respect the "Do NOT build" list** in `docs/science.md#do-not-build`.

`npm test` and `npm run build` must stay green.
