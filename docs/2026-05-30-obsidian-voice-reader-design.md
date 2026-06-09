# Obsidian Voice Reader — Design Spec

**Date:** 2026-05-30  
**Base:** Fork of `obsidian-aloud-tts` (adrianlyjak)  
**Project dir:** `/Users/Nassar/Code/obsidian-voice-reader/`  
**Audit ref:** `docs/superpowers/specs/2026-05-30-plugin-audit.md`  
**Original PRD ref:** `docs/obsidian-plugin.md`

---

## 1. Core Idea

A personal Obsidian plugin that converts notes to audio in Paul Graham's cloned voice using a local Chatterbox TTS server. The key difference from all existing plugins: **local voice clone + permanent vault audio + batch generation + mobile sync**.

**The workflow:**
1. Open a note → trigger "Read this note"
2. Plugin generates audio in the background, chunk by chunk
3. Progress notice shows generation status
4. When done: MP3 saved to `_audio/` in vault, `![[...]]` appended to note
5. Listen on desktop via embedded player, or let the file sync to iPhone via iCloud/Obsidian Sync

---

## 2. What We're Building

A fork of `obsidian-aloud-tts` with these changes:

### 2a. Fix (blocker)
- **WAV float format support:** Replace `parseWavHeader`'s strict PCM assertion with format-agnostic handling (ported from alltalk's `WavHandler`). Chatterbox outputs IEEE Float WAV (format 3). This fix unblocks the current integration.

### 2b. New mode: Batch Generation
Aloud is streaming-first. We add a **Batch Mode** (default for Chatterbox):
- Generate all chunks sequentially
- Assemble into single MP3 file
- Save to `_audio/{hash}.mp3` in vault
- Append `![[_audio/{hash}.mp3]]` to the source note
- Show "Voice Reader: ready" notice with note name

Streaming mode remains available and unchanged for providers that support it.

### 2c. Chatterbox Provider
New provider entry `"chatterbox"` in the provider registry, alongside `"openaicompat"`. It extends the OpenAI-compatible call with three extra body fields:

```typescript
{
  input: text,
  voice: voice,
  model: model,
  response_format: "mp3",
  exaggeration: settings.chatterbox_exaggeration,
  cfg_weight: settings.chatterbox_cfgWeight,
  temperature: settings.chatterbox_temperature,
}
```

Settings fields added to `TTSPluginSettings`:
- `chatterbox_apiBase: string` (default: `http://localhost:4123`)
- `chatterbox_ttsVoice: string` (default: `alloy`)
- `chatterbox_exaggeration: number` (default: `0.45`)
- `chatterbox_cfgWeight: number` (default: `0.65`)
- `chatterbox_temperature: number` (default: `1.0`)
- `chatterbox_batchMode: boolean` (default: `true`)
- `chatterbox_audioFolder: string` (default: `_audio`)

### 2d. Per-Note Voice Frontmatter
Before generating audio for a note, read `tts_voice` from the note's frontmatter via `app.metadataCache.getFileCache(file)?.frontmatter?.tts_voice`. If present, use it as the `voice` parameter. Falls back to `chatterbox_ttsVoice` from settings.

```yaml
---
tts_voice: paul-graham
---
```

### 2e. SHA256 Permanent Cache
Hash key: `SHA256(cleanedText + voice + JSON.stringify({exaggeration, cfgWeight, temperature}))`.

Cache lives in the vault under `_audio/`. Check: if `_audio/{hash}.mp3` exists, skip generation and just append the embed (idempotent). Unlike aloud's ephemeral cache, these files persist indefinitely.

### 2f. Health Check on Load
On plugin load, call `GET /health` on the configured Chatterbox endpoint. If it fails: show a persistent notice: `"Voice Reader: Chatterbox not running at {url}. Start it with: cd ~/Code/voice-reader/chatterbox-tts-api && uv run main.py"`.

### 2g. Borrowed from obsidian-kokoro-tts
- **Inline voice syntax:** `[[bella]]"Hello!"` → synthesize the quoted text in the `bella` voice profile. The syntax uses `[[voice_name]]` (Obsidian-native feel) instead of the `ktts` prefix.
- **Per-segment voice:** Quoted text and emphasized text can be routed to separate voice profiles in settings.

---

## 3. What We Keep from aloud-tts Unchanged

- All existing TTS providers (OpenAI, ElevenLabs, Gemini, Fish, Azure, etc.)
- Streaming playback mode for providers that support it
- Real-time word highlighting
- `cleanMarkdown.ts` — best in class, handles LaTeX, tables, BibTeX
- Audio cache (ephemeral) for streaming providers
- Mobile / locked-screen playback controls
- All existing settings UI structure
- The full test suite (vitest + playwright)

---

## 4. Settings UI Additions

New section in the settings tab: **"Chatterbox (Local Voice Clone)"**

```
[ Chatterbox Server URL      ] http://localhost:4123        [Test connection]
[ Default voice              ] alloy
[ Voice folder in vault      ] _audio

Preset parameters
[ Exaggeration    ] ━━━━━━●━━━ 0.45
[ CFG weight      ] ━━━━━━●━━━ 0.65
[ Temperature     ] ━━━━━━━━━● 1.00

[x] Batch mode (generate full note, save to vault, embed)
[ ] Stream mode  (sentence-by-sentence, no vault save)
```

---

## 5. Data Flow (Batch Mode)

```
User triggers "Read note or selection"
        │
        ▼
Get active file + text (selection or full note)
        │
        ▼
Read tts_voice from frontmatter → or use settings default
        │
        ▼
cleanMarkdown(text) → stripped plain text
        │
        ▼
SHA256(text + voice + preset) → hash key
        │
        ▼
vault.adapter.exists(`_audio/${hash}.mp3`)?
   YES → appendEmbed(note, path) → Notice "Using cached audio" → done
   NO  →
        │
        ▼
splitSentences(text) → chunks[]
        │
        ▼
ProgressNotice("Generating 0 / N chunks")
        │
        ▼
for each chunk:
  POST /audio/speech { input, voice, exaggeration, cfg_weight, temperature }
  → ArrayBuffer (MP3)
  → progress.advance()
        │
        ▼
assembleMP3(buffers[]) → single ArrayBuffer
        │
        ▼
vault.createBinary(`_audio/${hash}.mp3`, data)
        │
        ▼
appendEmbed(noteFile, `_audio/${hash}.mp3`)  [idempotent]
        │
        ▼
Notice "Voice Reader: ready — {note title}"  [4s timeout]
```

---

## 6. File Structure (Fork)

New/changed files relative to `obsidian-aloud-tts`:

```
packages/open-tts/src/
  models/
    chatterbox.ts            NEW — Chatterbox provider (extends openai-compat + custom params)
    registry.ts              MODIFY — add "chatterbox" to provider list
  player/
    TTSPluginSettings.ts     MODIFY — add chatterbox_* fields + batchMode flag
    BatchPlayer.ts           NEW — batch generation orchestration
    PermanentCache.ts        NEW — SHA256 vault-based permanent cache

packages/obsidian/src/
  ObsidianBridge.ts          MODIFY — health check on load, frontmatter voice reading
  VaultWriter.ts             NEW — writeAudioFile(), appendEmbed() (idempotent)

packages/ui/src/components/settings/providers/
  provider-chatterbox.tsx    NEW — Chatterbox settings section

packages/open-tts/src/util/
  cleanMarkdown.ts           MODIFY — fix float WAV in audioProcessing.ts (format 3 support)
  audioProcessing.ts         MODIFY — parseWavHeader: accept format 3 (IEEE float)
  assembleMP3.ts             NEW — concat MP3 ArrayBuffers cleanly
```

---

## 7. Error Handling

| Scenario | Behaviour |
|---|---|
| Server not running | Notice on load: "Start server first" + command not executable |
| Server timeout mid-generation | Notice "Generation failed at chunk N/M. Retry?" + partial buffers discarded |
| Server returns 500 | Retry up to 3× with 1s backoff, then fail with notice |
| Vault write fails | Notice "Could not save audio: {error}" |
| Note has no readable text | Notice "No readable text found in this note" |
| Cache file exists but corrupted | Delete + regenerate |

---

## 8. Out of Scope (V0)

- Cloud/freemium tier
- Orphan audio cleanup command (PRD §3.4) — V1
- RVC voice conversion (alltalk feature) — V1
- Auto-start Python server from Obsidian — V1
- Narrator mode (different voice for non-quoted text) — V1
- Inline `[[voice]]` syntax — V1 (spec it now, build later)
- Obsidian mobile generation (listen via sync only in V0)

---

## 9. Immediate Next Steps

1. **Debug MP3 blocker:** `curl -o /tmp/test.mp3 http://localhost:4123/v1/audio/speech ...` then `ffplay /tmp/test.mp3`. Verify the file is valid before debugging the plugin side.
2. **Fix WAV float format** in `audioProcessing.ts` — one-line change to accept format codes 1 AND 3.
3. **Add Chatterbox provider** (`chatterbox.ts`) — extends `openAICompatCallTextToSpeech` with 3 extra body params.
4. **Add BatchPlayer** — sequential generation loop with progress notice and vault write.
5. **Add PermanentCache** — SHA256 hash check before generation.
6. Write tests for each new module before implementing (TDD).
