# PR Candidates — obsidian-aloud-tts Fork

Each section is a self-contained brief for opening a PR against
`adrianlyjak/obsidian-aloud-tts`. Work one per session.

Fork base: `956e82a` ("Insert exported audio below selected line", 2026-05-26).
Our branch is 13 commits ahead; upstream has not moved since.

---

## PR-1 · Fish Audio: fix CORS via `requestUrl`

**Priority:** High — fixes a real bug in upstream's own merge (PR #142).

**Problem:** Upstream merged Fish Audio using the browser `fetch()` API, which
Obsidian blocks with CORS errors when calling `api.fish.audio`. Our version
switched to Obsidian's `requestUrl()` which proxies through the native layer
and bypasses CORS entirely.

**Files to cherry-pick:**
- `packages/open-tts/src/models/fish.ts`

**Key changes:**
```diff
- import { requestUrl } from "obsidian";         // ADD this import
- const response = await fetch(url, { ... })     // REMOVE
+ const response = await requestUrl({ url, ... }) // REPLACE
- data: await response.arrayBuffer()             // REMOVE
+ data: response.arrayBuffer                     // REPLACE (no await, sync prop)
```
Also applies to `listFishVoices()` which has the same `fetch()` call.
The `validate200Fish` adapter shape changes because `requestUrl` returns a
different object: `{ status, json }` instead of `Response`.

**Tests:** `packages/open-tts/src/models/fish.test.ts`

**PR title:** `fix(fish): use requestUrl to bypass CORS in Obsidian desktop`

---

## PR-2 · Batch audio generation with vault caching

**Priority:** High — directly implements feature request #27 (open since 2024-04).

**Problem / feature:** Users want to generate full-note audio once, store it in
the vault, and play it back without re-calling the API. Zero-cost repeats.
Audio is embedded as an Obsidian callout (with metadata frontmatter) so it
travels with the note.

**New files (all additive, zero upstream conflict):**
- `packages/open-tts/src/player/BatchPlayer.ts` — orchestrates chunked generation
- `packages/open-tts/src/player/PermanentCache.ts` — interface + frontmatter helpers
- `packages/obsidian/src/VaultWriter.ts` — implements PermanentCache, writes to vault
- `packages/obsidian/src/VaultWriter.test.ts`
- `packages/obsidian/src/ObsidianBridge.ts` — wires VaultWriter into the bridge
- `packages/open-tts/src/player/BatchPlayer.test.ts`

**Modified files (additive only):**
- `TTSPluginSettings.ts` — adds `audioFolder`, `*_batchMode` fields, v3 migration
- `TTSSettingsTabComponent.tsx` — adds batch mode toggles per provider
- `ObsidianPlayer.ts` — wires up BatchPlayer
- `TTSEditorAction.ts` — adds "Generate audio for note" command
- `styles.css` — callout embed styles

**Callout format written to vault:**
```markdown
> [!tts-audio] Note Title
> provider: fish · voice: default · generated: 2026-06-01
> ![[_audio/note-title.mp3]]
```

**Settings migration:** v2 → v3 removes per-provider `*_audioFolder` fields
and consolidates to a single `audioFolder` (default: `"_audio"`).

**PR title:** `feat: batch audio generation with vault caching`
**References:** Closes #27

---

## PR-3 · Cost comparison UI

**Priority:** Medium — no upstream equivalent, zero conflict risk (all new files).

**Problem / feature:** Users have no way to compare provider costs before
committing to one. The new section shows all providers sorted cheapest-first
with a log-scale visual bar, tier color-coding, feature badges, and a live
per-text cost estimate based on whatever the user typed in the test-voice field.

**New files:**
- `packages/ui/src/components/settings/CostEstimateComponent.tsx`
- `packages/ui/src/components/settings/provider-costs.ts`

**Modified files:**
- `packages/obsidian/styles.css` — appended ~170 lines of `.tts-cost-*` CSS
- `packages/ui/src/components/TTSSettingsTabComponent.tsx` — adds the section,
  lifts `testText` state to parent so it's shared with the cost component

**Features:**
- Providers sorted cheapest-first (free → cheap → mid → premium)
- Log-scale bar so free/cheap/mid/premium all have visually distinct widths
- Tier colors: green (free) → green-yellow (cheap) → yellow (mid) → red (premium)
- 🎤 voice clone badge, ⚡ batch mode badge per row
- Clicking a row switches to that provider (`store.updateModelSpecificSettings`)
- Active provider highlighted with accent color + ✓
- Per-text cost shown in accent color when test text is entered
- Keyboard accessible (Enter key on row)
- Disclaimer footer: "Approximate pricing mid-2025 · check provider sites"

**Pricing data** (mid-2025, USD per 1M chars):
Chatterbox $0 · Gemini $0 · Inworld $0* · MiniMax $0.10 · Fish $0.15 ·
OpenAI $15 · Azure $16 · Polly $16 · Hume $60 · ElevenLabs $165

**PR title:** `feat: provider cost comparison table in settings`

---

## PR-4 · Local server setup guide in OpenAI Compatible

**Priority:** Medium — complements upstream's own Kokoro.js draft PR #125.

**Problem / feature:** Users who want free local TTS don't know they can point
the OpenAI Compatible provider at a local server. A collapsible guide lists
Chatterbox, Kokoro, and Ollama with one-click "Use this" buttons that
auto-fill all settings fields.

**Files changed:**
- `packages/ui/src/components/settings/providers/provider-openai-like.tsx`
  — adds `LocalServerGuide` component (~100 lines, collapsible)

**Guide entries:**
| Server | URL | Auto-fills |
|---|---|---|
| Chatterbox | github.com/resemble-ai/chatterbox | `http://localhost:4123`, model `chatterbox`, format `mp3` |
| Kokoro (kokoro-fastapi) | github.com/remsky/kokoro-fastapi | `http://localhost:8880`, model `kokoro`, format `mp3` |
| Ollama | ollama.com | `http://localhost:11434`, model `your-model-name`, format `mp3` |

**Note for PR:** Frame as "discovery path for local TTS" — mention it pairs
with the Kokoro.js PR #125. If Kokoro.js lands natively, this guide still
helps users who prefer a server-based setup.

**PR title:** `feat(openaicompat): add local server setup guide with one-click config`

---

## PR-5 · Gemini: 429 rate-limiter + Flash 3.1 TTS support

**Priority:** Medium — fixes a real reliability bug; new model is additive.

**Problem / feature:**
1. Gemini free tier is ~2 RPM. The ChunkLoader fires 3 parallel requests which
   all hit 429 simultaneously and retry in sync — the rate-limit cycle repeats
   forever. A module-level `GeminiRateLimiter` serializes requests and enforces
   a 32s cooldown after any 429.
2. `gemini-2.5-flash` is now listed as a supported TTS model (same API shape).

**Files changed:**
- `packages/open-tts/src/models/gemini.ts`
  — adds `GeminiRateLimiter` class, wraps `geminiCallTextToSpeech`
- `packages/open-tts/src/models/gemini.test.ts`
  — adds serialization and 429-cooldown tests

**Key design:** Limiter is module-level (singleton per process). Tests call
`limiter.resetCooldown()` to prevent state leaking between cases.

**PR title:** `fix(gemini): serialize requests and add 32s cooldown after 429`

---

## PR-6 · Provider dropdown: groups + voice clone labels

**Priority:** Low — UX polish, additive, zero logic change.

**Problem / feature:** All ~11 providers appear in one flat list. Grouping them
by category (Local / Cloud / Enterprise / Custom) and labeling voice-clone
providers makes the selector much more scannable.

**Files changed:**
- `packages/ui/src/components/settings/option-select.tsx`
  — adds `SelectGroup` interface and `groups` prop; renders disabled `── Label ──`
  options as separators (Obsidian's CSS suppresses real `<optgroup>` labels)
- `packages/ui/src/components/TTSSettingsTabComponent.tsx`
  — defines `providerGroups` const; updates `ModelSwitcher` to use groups;
  adds voice clone suffix to Chatterbox, ElevenLabs, Fish display names

**Groups:**
- Local: Chatterbox · voice clone, OpenAI Compatible
- Cloud: Gemini, Fish Audio · voice clone, MiniMax, OpenAI, Inworld
- Enterprise: Azure, AWS Polly, Hume, ElevenLabs · voice clone

**PR title:** `feat: group provider dropdown and label voice-clone providers`

---

## PR-7 · Doc-switch behavior setting

**Priority:** Low — nice UX addition, low conflict risk.

**Problem / feature:** Currently when a user switches to a different note while
audio is playing, behavior is undefined/inconsistent. This adds a setting with
three explicit options: `stop`, `continue`, `auto-play`.

**Files changed:**
- `packages/open-tts/src/player/TTSPluginSettings.ts`
  — adds `docSwitchBehavior` field, `DocSwitchBehavior` type, `docSwitchBehaviors`
  array, `isDocSwitchBehavior()` guard; default: `"continue"`
- `packages/obsidian/src/TTSPlugin.ts` — wires up the behavior on note switch
- `packages/ui/src/components/TTSSettingsTabComponent.tsx` — adds the setting UI

**PR title:** `feat: configurable behavior when switching notes during playback`

---

## Chatterbox provider — NOT a PR candidate

The Chatterbox provider (`packages/open-tts/src/models/chatterbox.ts`) requires
a separate Python server and has unique params (exaggeration, cfg_weight,
temperature) not applicable to other providers. Since upstream already has a
draft Kokoro.js PR (#125) targeting the same "free local TTS" use case via
WebGPU (no server needed), adding a competing provider is a hard sell.

**Better path:** open an issue on upstream proposing a "local server provider
framework" and reference both Chatterbox and Kokoro-server as use cases. If
they're interested, offer the implementation.

---

## Suggested PR order

1. PR-1 Fish CORS (bug fix, high value, small)
2. PR-5 Gemini 429 (bug fix, reliability)
3. PR-2 Batch audio (highest user value, closes old issue)
4. PR-3 Cost comparison UI (no conflict, polish)
5. PR-4 Local server guide (pairs with their Kokoro PR)
6. PR-6 Dropdown groups (small, low risk)
7. PR-7 Doc-switch behavior (lowest priority)

Each PR should be opened separately with its own branch cherry-picked
from our fork — do not batch multiple features into one PR.
