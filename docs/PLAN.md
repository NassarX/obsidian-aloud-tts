# obsidian-voice-reader — Implementation Plan

**Last updated:** 2026-06-03  
**Status:** SHIPPED — production ready  
**Base:** Fork of `obsidian-aloud-tts` (adrianlyjak)  
**Design spec:** `docs/2026-05-30-obsidian-voice-reader-design.md`  
**Handoff:** `docs/handoff-2026-06-03.md`

---

## Status

### All Modules — Shipped ✅

| Module | File | Status |
|--------|------|--------|
| Chatterbox provider | `packages/open-tts/src/models/chatterbox.ts` | ✅ Done + health check |
| ChatterboxModelConfig + DocSwitchBehavior | `packages/open-tts/src/player/TTSPluginSettings.ts` | ✅ Done |
| BatchPlayer | `packages/open-tts/src/player/BatchPlayer.ts` | ✅ Done + tests |
| PermanentCache (SHA-256) | `packages/open-tts/src/player/PermanentCache.ts` | ✅ Done + tests |
| VaultWriter | `packages/obsidian/src/VaultWriter.ts` | ✅ Done + tests |
| Batch path + audio toggle in ObsidianBridge | `packages/obsidian/src/ObsidianBridge.ts` | ✅ Done (bug fixed 2026-06-03) |
| Doc-switch behavior (stop/continue/auto-play) | `packages/obsidian/src/ObsidianBridge.ts` | ✅ Done |
| Error notices (MobX reaction) | `packages/obsidian/src/TTSPlugin.ts` | ✅ Done |
| Chatterbox settings UI | `packages/ui/src/components/settings/providers/provider-chatterbox.tsx` | ✅ Done |
| Fish Audio CORS fix (requestUrl) | `packages/open-tts/src/models/fish.ts` | ✅ Done + tests |
| Fish batch mode + audioFolder | `packages/open-tts/src/player/TTSPluginSettings.ts` | ✅ Done |
| MiniMax batch mode + audioFolder | `packages/open-tts/src/player/TTSPluginSettings.ts` | ✅ Done |
| Gemini rate-limiter (GeminiRateLimiter) | `packages/open-tts/src/models/gemini.ts` | ✅ Done + tests |
| ChunkLoader 429 backoff (30s base) | `packages/open-tts/src/player/ChunkLoader.ts` | ✅ Done |
| WebAudioSink AbortError guard | `packages/open-tts/src/browser/WebAudioSink.ts` | ✅ Done |
| ChunkPlayer null guard | `packages/open-tts/src/player/ChunkPlayer.ts` | ✅ Done |
| cleanMarkdown Obsidian fixes | `packages/open-tts/src/util/cleanMarkdown.ts` | ✅ Done + tests |
| frontmatterLength export | `packages/open-tts/src/util/cleanMarkdown.ts` | ✅ Done |
| ActiveAudioText frontmatter skip | `packages/open-tts/src/player/ActiveAudioText.ts` | ✅ Done |
| WAV float32 (format 3) support | `packages/open-tts/src/util/audioProcessing.ts` | ✅ Done + tests |
| TrackProgress in PlayerView | `packages/ui/src/components/PlayerView.tsx` | ✅ Done |
| DocSwitchBehavior setting in UI | `packages/ui/src/components/TTSSettingsTabComponent.tsx` | ✅ Done |
| Settings migration backfill | `packages/open-tts/src/player/TTSPluginSettings.ts` | ✅ Done + tests |
| Node 22 upgrade | environment | ✅ Done |
| Pre-commit hook fix | `.husky/pre-commit` | ✅ Done |
| Vault embed migration (plain → callout) | one-time Python script | ✅ Done (8 notes) |

**Test suite:** 418 tests, 37 files — all green.

---

## Changelog

### 2026-06-03 — Session 3 (production hardening + deployment)

**Bugs fixed:**
- Batch generation completed but never called `player.startPlayer` — audio was saved but silent. Fixed.
- Batch errors (API failures, credits exhausted) were silently swallowed. Now shown as 8s Notice.
- Pre-commit hook crashed on Node 20 (`node:sqlite`). Fixed by upgrading to Node 22.22.3 LTS.
- Vault embeds in 4 notes were in old plain `![[...]]` format. Migrated to `> [!abstract]+` callout.

**Infrastructure:**
- Node 20.19.4 → 22.22.3 LTS (pnpm v9 now runs without errors).
- 17 new tests added covering all new modules and migration paths.

### 2026-06-02 — Session 2 (full feature build)

**Providers:**
- Chatterbox local TTS provider (health check, synthesis, settings UI, batch mode).
- Fish Audio: switched to `requestUrl()` for CORS fix; batch mode + vault caching.
- MiniMax: batch mode + vault caching.
- Gemini: `GeminiRateLimiter` — serialises concurrent requests, 32s 429 cooldown.
- ChunkLoader: 429 errors get 30s base backoff (was 250ms).

**Core features:**
- `BatchPlayer` — sequential generation, abort-signal, progress/complete/error callbacks.
- `PermanentCache` — SHA-256 cache key stable across sessions.
- `VaultWriter` — writes MP3s to `_audio/`, embeds collapsible `[!abstract]+` callout with metadata.
- Audio toggle: clicking play on active note pauses/resumes (was: always restart).
- Doc-switch behavior: stop / continue / auto-play (user-configurable).
- `isDetachedAudio` flag: toolbar floats to focused editor when audio plays in background.

**Markdown cleanup:**
- Readwise Tags lines, View Highlight links, wiki links, inline tags, callout markers, code blocks, URL simplification.
- `frontmatterLength()` — lets `ActiveAudioText` skip YAML in sentence splitting.

**PlayerView:**
- `TrackProgress` — sentence counter (N / Total) + 50-char snippet.
- Paused state (⏸ icon).
- Play button hidden when track is active.

**Audio:**
- WAV format 3 (IEEE 32-bit float) accepted and converted to int16 for MP3 encoding.
- `WebAudioSink.play()` catches `AbortError` from rapid play/pause transitions.

### 2026-05-30 — Session 1 (design + POC)

- Evaluated 3 existing plugins; selected `obsidian-aloud-tts` as fork base.
- Design spec written (`docs/2026-05-30-obsidian-voice-reader-design.md`).
- Chatterbox server POC: voice clone working (`paul-graham`, EX=0.45, CFG=0.65).
- Diagnosed XTTS vs Chatterbox quality; chose Chatterbox (same speed, better quality).

---

## Open Items (Future Work)

| Priority | Description |
|----------|-------------|
| High | Batch always-from-top: force `from = {line:0, ch:0}` in batch path of `ObsidianBridge` |
| Medium | Serve vault MP3 directly for replay (avoid re-hitting API on second play of same content) |
| Medium | Narrator mode: `[[voice]]"text"` inline syntax for per-sentence voice switching |
| Low | Mobile smoke test — touch targets, long-press menu |
| Low | `epfLLM_meditron.md` callout title uses UUID (pre-dates noteTitle field) |
