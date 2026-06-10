import { describe, it, expect, vi } from "vitest";
import { FileView, loadPdfJs, Notice } from "obsidian";
import { ObsidianBridgeImpl } from "./ObsidianBridge";
import { createTestAudioStore, createTestSettingsStore } from "./test-utils";
import { pluginSettingsStore, DEFAULT_SETTINGS } from "open-tts";

function stubActiveSelection(text: string, root?: HTMLElement): void {
  const selectionNode = root?.firstChild || root || document.body;
  vi.stubGlobal("activeWindow", {
    getSelection: () => ({
      toString: () => text,
      rangeCount: text ? 1 : 0,
      anchorNode: selectionNode,
      focusNode: selectionNode,
      getRangeAt: () => ({ commonAncestorContainer: selectionNode }),
    }),
  });
}

function mockPdfJsText(text: string): { destroy: ReturnType<typeof vi.fn> } {
  const destroy = vi.fn();
  vi.mocked(loadPdfJs).mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getTextContent: () =>
              Promise.resolve({
                items: text.split(" ").map((str) => ({ str })),
              }),
          }),
        destroy,
      }),
    }),
  });
  return { destroy };
}

// Mock React and DOM utilities
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("./components/ObsidianIsPlaying", () => ({
  IsPlaying: () => null,
}));

vi.mock("obsidian", () => ({
  App: vi.fn(),
  Notice: vi.fn(),
  MarkdownView: vi.fn(),
  FileView: class MockFileView {
    file: unknown;
    containerEl?: HTMLElement;
    contentEl?: HTMLElement;
    constructor(file: unknown, containerEl?: HTMLElement) {
      this.file = file;
      this.containerEl = containerEl;
      this.contentEl = containerEl;
    }
    getViewType(): string {
      return "pdf";
    }
  },
  TFile: vi.fn(),
  Modal: vi.fn(),
  Setting: vi.fn(),
  loadPdfJs: vi.fn(),
}));

describe("ObsidianBridge", () => {
  describe("ObsidianBridgeImpl", () => {
    it("should instantiate without crashing", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      expect(bridge).toBeDefined();
      expect(bridge).toBeInstanceOf(ObsidianBridgeImpl);
    });

    it("should have required interface methods", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      // Check interface methods exist
      expect(typeof bridge.playSelection).toBe("function");
      expect(typeof bridge.playDetached).toBe("function");
      expect(typeof bridge.onTextChanged).toBe("function");
      expect(typeof bridge.exportAudio).toBe("function");
    });

    it("should have observable properties", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const settingsStore = await createTestSettingsStore();

      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      // Check observable properties exist (they may be undefined initially)
      expect(bridge.activeEditor).toBeUndefined(); // No active editor initially
      expect(bridge.focusedEditor).toBeUndefined(); // No focused editor initially
      expect(typeof bridge.detachedAudio).toBe("boolean");
    });

    it("should play selected PDF text from the active PDF view", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      containerEl.textContent = "selected PDF text";
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;
      stubActiveSelection("selected PDF text", containerEl);

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();

      expect(startPlayer).toHaveBeenCalledWith({
        filename: "sample.pdf",
        text: "selected PDF text",
        start: 0,
        end: 17,
      });
    });

    it("should ignore stale selections outside the active PDF view", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      containerEl.textContent = "PDF text";
      const outsideSelection = document.createElement("div");
      outsideSelection.textContent = "sidebar text";
      document.body.append(outsideSelection);
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
        },
      } as any;
      const { destroy } = mockPdfJsText("Full PDF text");
      stubActiveSelection("sidebar text", outsideSelection);

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "Full PDF text",
          start: 0,
          end: 13,
        });
      });

      expect(destroy).toHaveBeenCalled();
    });

    it("should load full PDF text instead of partial mounted text", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const containerEl = document.createElement("div");
      const firstLayer = document.createElement("div");
      const secondLayer = document.createElement("div");
      firstLayer.className = "textLayer";
      secondLayer.className = "textLayer";
      firstLayer.textContent = "Mounted PDF text";
      secondLayer.textContent = "second page";
      containerEl.append(firstLayer, secondLayer);
      const PdfView = FileView as unknown as new (
        file: unknown,
        containerEl?: HTMLElement,
      ) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file, containerEl) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(),
        },
      } as any;
      const { destroy } = mockPdfJsText("Complete PDF text");
      stubActiveSelection("");

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "Complete PDF text",
          start: 0,
          end: 17,
        });
      });

      expect(mockApp.vault.readBinary).toHaveBeenCalledWith(file);
      expect(destroy).toHaveBeenCalled();
    });

    it("should load the full PDF text when no PDF text is selected", async () => {
      const file = { path: "sample.pdf", name: "sample.pdf" };
      const PdfView = FileView as unknown as new (file: unknown) => FileView;
      const destroy = vi.fn();
      vi.mocked(loadPdfJs).mockResolvedValue({
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPage: (pageNumber: number) =>
              Promise.resolve({
                getTextContent: () =>
                  Promise.resolve({
                    items:
                      pageNumber === 1
                        ? [{ str: "First" }, { str: "page" }]
                        : [{ str: "Second", hasEOL: true }, { str: "page" }],
                  }),
              }),
            destroy,
          }),
        }),
      });
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(file) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
          readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
        },
      } as any;
      stubActiveSelection("");

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();
      await vi.waitFor(() => {
        expect(startPlayer).toHaveBeenCalledWith({
          filename: "sample.pdf",
          text: "First page\n\nSecond\npage",
          start: 0,
          end: 23,
        });
      });

      expect(mockApp.vault.readBinary).toHaveBeenCalledWith(file);
      expect(destroy).toHaveBeenCalled();
    });

    it("should show a notice when the active PDF view has no file", async () => {
      const PdfView = FileView as unknown as new (file: unknown) => FileView;
      const mockApp = {
        workspace: {
          activeLeaf: { view: new PdfView(null) },
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playSelection();

      expect(startPlayer).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith("No PDF file to play");
    });

    it("should reset detached playback when starting audio fails", async () => {
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      vi.spyOn(audioStore, "startPlayer").mockRejectedValue(
        new Error("audio failed"),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      bridge.playDetached("Detached text", "detached.txt");
      expect(bridge.detachedAudio).toBe(true);

      await vi.waitFor(() => {
        expect(bridge.detachedAudio).toBe(false);
      });
      expect(Notice).toHaveBeenCalledWith("Failed to start audio");
    });

    it("should show a notice instead of playing empty clipboard text", async () => {
      vi.stubGlobal("navigator", {
        clipboard: { readText: () => Promise.resolve("   ") },
      });
      const mockApp = {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          getActiveViewOfType: vi.fn(),
        },
        vault: {
          on: vi.fn(),
          off: vi.fn(),
        },
      } as any;

      const audioStore = createTestAudioStore();
      const startPlayer = vi.spyOn(audioStore, "startPlayer");
      const settingsStore = await createTestSettingsStore();
      const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);

      await bridge.playClipboard();

      expect(startPlayer).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith("No text found in clipboard");
    });
  });

  // Helper that creates a bridge with a controllable audio store and settings
  async function makeBridge(settingsOverrides: Record<string, unknown> = {}) {
    const closePlayer = vi.fn();
    const audioStore = createTestAudioStore();
    // Patch closePlayer onto the store so we can observe calls
    (audioStore as any).closePlayer = closePlayer;

    const settingsStore = await pluginSettingsStore(
      async () => ({ ...DEFAULT_SETTINGS, ...settingsOverrides }),
      async () => {},
    );

    const mockApp = {
      workspace: {
        on: vi.fn(),
        off: vi.fn(),
        getActiveViewOfType: vi.fn(),
        getLeavesOfType: vi.fn(() => []),
      },
      vault: {
        on: vi.fn(),
        off: vi.fn(),
        read: vi.fn().mockResolvedValue(""),
        modify: vi.fn().mockResolvedValue(undefined),
        adapter: {
          exists: vi.fn().mockResolvedValue(false),
        },
      },
      metadataCache: { getFileCache: vi.fn().mockReturnValue(null) },
    } as any;

    const bridge = new ObsidianBridgeImpl(mockApp, audioStore, settingsStore);
    return { bridge, audioStore, closePlayer, mockApp };
  }

  describe("_onFileOpen docSwitchBehavior", () => {
    it("calls closePlayer when behavior is 'stop'", async () => {
      const { bridge, closePlayer } = await makeBridge({
        docSwitchBehavior: "stop",
      });

      // Simulate: was on note-a, now file-open fires with note-b
      (bridge as any).activeEditorView = { file: { name: "note-b.md" } };
      (bridge as any).activeFilename = "note-a.md";

      bridge._onFileOpen();

      expect(closePlayer).toHaveBeenCalledTimes(1);
      expect((bridge as any).isDetachedAudio).toBe(false);
    });

    it("sets isDetachedAudio when behavior is 'continue'", async () => {
      const { bridge, closePlayer } = await makeBridge({
        docSwitchBehavior: "continue",
      });

      (bridge as any).activeEditorView = { file: { name: "note-b.md" } };
      (bridge as any).activeFilename = "note-a.md";

      bridge._onFileOpen();

      expect(closePlayer).not.toHaveBeenCalled();
      expect((bridge as any).isDetachedAudio).toBe(true);
    });

    it("calls closePlayer (not setDetached) when behavior is 'auto-play'", async () => {
      const { bridge, closePlayer, mockApp } = await makeBridge({
        docSwitchBehavior: "auto-play",
      });
      // auto-play uses setTimeout; mock getActiveViewOfType to prevent null errors
      mockApp.workspace.getActiveViewOfType.mockReturnValue(null);

      (bridge as any).activeEditorView = { file: { name: "note-b.md" } };
      (bridge as any).activeFilename = "note-a.md";

      bridge._onFileOpen();

      expect(closePlayer).toHaveBeenCalledTimes(1);
      expect((bridge as any).isDetachedAudio).toBe(false);
    });

    it("does nothing when the same note is still active", async () => {
      const { bridge, closePlayer } = await makeBridge({
        docSwitchBehavior: "stop",
      });

      (bridge as any).activeEditorView = { file: { name: "same.md" } };
      (bridge as any).activeFilename = "same.md"; // same name → no switch

      bridge._onFileOpen();

      expect(closePlayer).not.toHaveBeenCalled();
      expect((bridge as any).isDetachedAudio).toBe(false);
    });
  });

  describe("triggerSelection toggle behavior", () => {
    it("pauses active playing audio when same note is tapped again", async () => {
      const { bridge, audioStore } = await makeBridge();
      const pause = vi.fn();
      (audioStore as any).activeText = {
        isPlaying: true,
        pause,
        play: vi.fn(),
      };
      (bridge as any).isDetachedAudio = false;

      const mockEditor = {
        getCursor: vi.fn().mockReturnValue({ line: 0, ch: 0 }),
        getRange: vi.fn().mockReturnValue(""),
        getLine: vi.fn().mockReturnValue(""),
        lineCount: vi.fn().mockReturnValue(1),
        lastLine: vi.fn().mockReturnValue(0),
      } as any;

      await bridge.triggerSelection(null, mockEditor);

      expect(pause).toHaveBeenCalledTimes(1);
    });

    it("resumes paused audio when same note is tapped again", async () => {
      const { bridge, audioStore } = await makeBridge();
      const play = vi.fn();
      (audioStore as any).activeText = {
        isPlaying: false,
        pause: vi.fn(),
        play,
      };
      (bridge as any).isDetachedAudio = false;

      const mockEditor = {
        getCursor: vi.fn().mockReturnValue({ line: 0, ch: 0 }),
        getRange: vi.fn().mockReturnValue(""),
        getLine: vi.fn().mockReturnValue(""),
        lineCount: vi.fn().mockReturnValue(1),
        lastLine: vi.fn().mockReturnValue(0),
      } as any;

      await bridge.triggerSelection(null, mockEditor);

      expect(play).toHaveBeenCalledTimes(1);
    });

    it("bypasses toggle when forceRestart is set", async () => {
      const { bridge, audioStore } = await makeBridge();
      const pause = vi.fn();
      const startPlayer = vi.fn();
      (audioStore as any).activeText = {
        isPlaying: true,
        pause,
        play: vi.fn(),
      };
      (audioStore as any).startPlayer = startPlayer;
      (bridge as any).isDetachedAudio = false;

      const mockEditor = {
        getCursor: vi.fn().mockReturnValue({ line: 0, ch: 0 }),
        getRange: vi.fn().mockReturnValue("some readable text here"),
        getLine: vi.fn().mockReturnValue("some readable text here"),
        lineCount: vi.fn().mockReturnValue(1),
        lastLine: vi.fn().mockReturnValue(0),
      } as any;

      await bridge.triggerSelection(null, mockEditor, { forceRestart: true });

      // Should NOT have toggled pause — should have fallen through to startPlayer
      expect(pause).not.toHaveBeenCalled();
    });

    it("clears isDetachedAudio and starts fresh when audio is detached", async () => {
      const { bridge, audioStore } = await makeBridge();
      (audioStore as any).activeText = {
        isPlaying: true,
        pause: vi.fn(),
        play: vi.fn(),
      };
      (bridge as any).isDetachedAudio = true;

      const mockEditor = {
        getCursor: vi.fn().mockReturnValue({ line: 0, ch: 0 }),
        getRange: vi.fn().mockReturnValue("some readable text here"),
        getLine: vi.fn().mockReturnValue("some readable text here"),
        lineCount: vi.fn().mockReturnValue(1),
        lastLine: vi.fn().mockReturnValue(0),
      } as any;

      await bridge.triggerSelection(null, mockEditor);

      // Key assertion: the detached flag must be cleared so future
      // clicks on the same note act as toggle (not restart).
      expect((bridge as any).isDetachedAudio).toBe(false);
    });
  });
});
