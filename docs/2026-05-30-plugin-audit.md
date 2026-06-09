# Plugin Audit: TTS Ecosystem vs Our Vision

**Date:** 2026-05-30  
**Our vision ref:** `docs/obsidian-plugin.md`  
**Repos audited:**
- `obsidian-aloud-tts` → `/tmp/obsidian-aloud-tts` · https://github.com/adrianlyjak/obsidian-aloud-tts
- `obsidian-alltalk-tts` → `/tmp/obsidian-alltalk-tts` · https://github.com/Mithadon/obsidian-alltalk-tts-plugin
- `obsidian-kokoro-tts` → `/tmp/obsidian-kokoro-tts` · https://github.com/Mithadon/obsidian-kokoro-tts-plugin

---

## Feature Matrix

| Feature | Our Vision | aloud-tts | alltalk-tts | kokoro-tts |
|---|---|---|---|---|
| OpenAI-compatible endpoint | ✅ | ✅ | ❌ (AllTalk API) | ❌ (Kokoro) |
| Batch generation (generate all → save → notify) | ✅ | ❌ (streaming only) | ✅ | ✅ |
| Permanent vault audio files | ✅ | ❌ (ephemeral cache) | ✅ | ✅ |
| Auto-embed `![[...]]` after generation | ✅ | ❌ | ✅ | ✅ |
| SHA256 content-hash cache | ✅ | ✅ (ephemeral) | ❌ | ❌ |
| Per-note `tts_voice` frontmatter | ✅ | ❌ | ❌ | ❌ |
| Custom voice params (exaggeration/cfg/temp) | ✅ | ❌ | ❌ | ❌ |
| Health check on load | ✅ | ❌ | ✅ (server check) | ✅ (backend status) |
| Toast notification when ready | ✅ | ❌ | ✅ | ✅ |
| "Stop speech" command | ✅ | ✅ | ✅ | ✅ |
| Progress indicator during generation | ✅ | ✅ (streaming) | ❌ | ✅ (stats message) |
| Configurable audio folder | ✅ | ✅ | ✅ | ✅ |
| Mobile / locked-screen playback | ✅ | ✅ | ❌ | ❌ |
| Skip code blocks | ✅ | ✅ | ✅ | ✅ |
| Strip markdown/HTML cleanly | ✅ | ✅ (best) | ✅ | ✅ |
| LaTeX math → speakable text | ❌ (not in PRD) | ✅ | ❌ | ❌ |
| Table → speakable text | ❌ (not in PRD) | ✅ | ❌ | ❌ |
| Narrator mode (quoted vs normal voice) | ❌ | ❌ | ✅ | ✅ |
| Inline voice syntax (`ktts` prefix) | ❌ | ❌ | ❌ | ✅ |
| Per-segment voice (quoted/emphasized/normal) | ❌ | ❌ | ✅ | ✅ |
| Context menu (right-click) | ❌ | ✅ | ✅ | ✅ |
| Playback speed control | ❌ | ✅ | ✅ | ❌ |
| Test coverage | Required | ✅ (vitest + playwright) | ❌ | ❌ |
| TypeScript strict | Required | ✅ | Partial | Partial |

---

## Individual Plugin Analysis

### obsidian-aloud-tts

**Architecture:** TypeScript monorepo (`packages/obsidian`, `packages/open-tts`, `packages/ui`). React settings UI with MobX state management. Clean separation of TTS model adapters from playback logic.

**Strengths:**
- Best codebase quality by far. Well-tested (vitest unit + playwright e2e).
- `cleanMarkdown.ts` is excellent: handles LaTeX math, tables, footnotes, BibTeX citekeys, frontmatter, setext headers, CriticMarkup — far beyond what we planned.
- Sentence-by-sentence streaming with real-time word highlighting.
- `openAICompatCallTextToSpeech` in `openai.ts` is the integration point — straightforward to extend.
- Mobile with OS-level playback controls (play/pause from lock screen).
- Supports WAV, MP3, and PCM response formats.

**Weaknesses:**
- Streaming-first: not designed for batch generation + save + notify.
- Audio cache is ephemeral (configurable TTL, not permanent vault files).
- WAV parsing (`parseWavHeader`) only accepts PCM format 1 — rejects Chatterbox's IEEE Float WAV (format 3). **This is the current blocker.**
- No Chatterbox-specific params in the OpenAI-compat call body.
- No per-note `tts_voice` frontmatter reading.
- MP3 still not playing (unknown — needs investigation next session).

**Code quality verdict:** 9/10. This is the base to fork.

---

### obsidian-alltalk-tts

**Architecture:** Single-file TypeScript plugin (`src/main.ts`, `src/xtts.ts`, `src/audioProcessor.ts`, `src/wavHandler.ts`). No tests.

**Strengths:**
- `WavHandler.combineWavBlobs()` handles ANY WAV format (format-agnostic concatenation) — reads header fields dynamically, doesn't assume PCM. **This fixes the float WAV problem.**
- Batch generation model: generates all chunks, then saves concatenated audio, then embeds.
- `saveAudioFiles` + `embedAfterGeneration` settings — exactly the persistent vault file pattern we want.
- Narrator mode: routes quoted text vs non-quoted text to different voices.
- Context menu integration (right-click on selection or file).
- Stop button in status bar.
- Server status check on load.

**Weaknesses:**
- AllTalk-specific API (`/api/tts-generate`, `/api/voices`). Not OpenAI-compatible.
- No content-hash cache — regenerates every time.
- No mobile support.
- No tests.
- `audioProcessor.ts` chunks by sentence count, not by character length — can produce oversized chunks.

**Code quality verdict:** 5/10. Useful for patterns, not for the base.

---

### obsidian-kokoro-tts

**Architecture:** Single-file TypeScript plugin with a Python backend sidecar (`kokoro_backend.py`). No tests. Windows-only (espeak-ng dependency).

**Strengths:**
- `text-processor.ts` has the most sophisticated text chunking of all three: paragraph-aware, quote-preserving sentence splitter, comma-fallback for long sentences, voice assignment per segment.
- Inline voice syntax (`ktts` prefix before quoted text): `kttsbella"Hello!"` → speaks in Bella's voice. Novel UX for multi-voice notes.
- Per-segment voice assignment: quoted text, emphasized text (*asterisks*), normal text all get configurable voices.
- Smart quote normalization (handles curly quotes, low-9 quotes, etc.).
- Backend start/stop button in settings — user-controlled server lifecycle.

**Weaknesses:**
- Windows-only (espeak-ng phonemization). Not viable on macOS as-is.
- Python sidecar bundled in plugin folder — fragile installation.
- Saves audio chunk-by-chunk as separate files (`notename_timestamp_chunk.wav`) instead of one assembled file.
- No OpenAI-compatible endpoint.
- No tests.

**Code quality verdict:** 6/10. `text-processor.ts` is worth borrowing directly.

---

## Gap Analysis vs Our Vision (`docs/obsidian-plugin.md`)

### Things no plugin does today

1. **Per-note `tts_voice` frontmatter** — none read Obsidian metadata cache for voice selection.
2. **Chatterbox-specific generation params** (exaggeration, cfg_weight, temperature) — none pass custom params beyond the OpenAI standard fields.
3. **SHA256 permanent cache** — aloud has ephemeral cache; alltalk/kokoro have none.
4. **Background generation with "ready" notification** — closest is alltalk (batch) but no notify pattern.
5. **Health check with actionable notice** — alltalk checks server but doesn't guide the user.

### Things that exist and are better than our original plan

1. **cleanMarkdown.ts** (aloud) — LaTeX, tables, BibTeX, CriticMarkup. Far better than our regex plan.
2. **Streaming word highlighting** (aloud) — not in our PRD but genuinely useful for review mode.
3. **Narrator mode** (alltalk, kokoro) — different voices for quoted vs narrated text — not in PRD but powerful for essays with dialogue.
4. **Inline voice syntax** (kokoro) — `ktts` prefix concept is novel and could map to our voice clone library.
5. **WavHandler** (alltalk) — format-agnostic WAV concat handles Chatterbox float WAV correctly.

### The current blocker (MP3 not playing)

`audioProcessing.ts` in aloud converts WAV → MP3 using `lamejs`. When response_format is set to `mp3`, Chatterbox returns MP3 directly — aloud returns it as-is (no conversion). The playback still fails, which means either:
- Chatterbox's MP3 output has an issue (codec, bitrate, or header)
- Aloud's audio player has a format expectation not met by Chatterbox's MP3

**Next debug step:** `curl -o /tmp/test.mp3 -X POST http://localhost:4123/v1/audio/speech -H "Content-Type: application/json" -d '{"model":"tts-1","voice":"alloy","input":"Hello.","response_format":"mp3"}'` then verify the file plays with `ffplay /tmp/test.mp3`.

---

## Build Strategy Decision

**Fork `obsidian-aloud-tts`.** Rationale:
- Best codebase quality, best markdown cleaner, only one with mobile support and real tests.
- The streaming architecture can be wrapped: add a `BatchMode` that generates all chunks sequentially, assembles the audio, saves to vault, and notifies — using aloud's existing TTS model layer unchanged.
- The WAV format issue is fixable by replacing `parseWavHeader`'s format assertion with the format-agnostic approach from `WavHandler.combineWavBlobs()`.
- The OpenAI-compat model (`openai-like.ts`) needs ~10 lines added to pass Chatterbox params.
