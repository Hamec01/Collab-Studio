import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

// Mock HTMLAudioElement
class MockAudioElement {
  src = "";
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  duration = 0;
  paused = true;
  
  eventListeners: Record<string, Function[]> = {};

  addEventListener(event: string, handler: Function) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }
  }

  dispatchEvent(event: Event) {
    const handlers = this.eventListeners[event.type] || [];
    handlers.forEach(handler => handler(event));
    return true;
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  load() {
    this.currentTime = 0;
    this.dispatchEvent(new Event("loadstart"));
  }
}

describe("PlayerProvider", () => {
  let audioInstance: MockAudioElement;

  beforeEach(() => {
    audioInstance = new MockAudioElement();
    global.HTMLAudioElement = vi.fn(() => audioInstance) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a single shared audio element", () => {
    const { result: result1 } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });
    const { result: result2 } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    expect(result1.current).toBe(result2.current);
    expect(global.HTMLAudioElement).toHaveBeenCalledTimes(1);
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.volume).toBe(1);
    expect(result.current.playbackRate).toBe(1);
    expect(result.current.sourceUrl).toBe(null);
  });

  it("loads a new source URL", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
    });

    expect(audioInstance.src).toBe("https://example.com/audio.mp3");
    expect(result.current.sourceUrl).toBe("https://example.com/audio.mp3");
  });

  it("clears source when loading null", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
    });

    act(() => {
      result.current.loadSource(null);
    });

    expect(audioInstance.src).toBe("");
    expect(result.current.sourceUrl).toBe(null);
  });

  it("toggles play/pause", async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
    });

    await act(async () => {
      await result.current.togglePlay();
    });

    expect(audioInstance.paused).toBe(false);
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.togglePlay();
    });

    expect(audioInstance.paused).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });

  it("seeks to specific time", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
    });

    act(() => {
      result.current.seekTo(42.5);
    });

    expect(audioInstance.currentTime).toBe(42.5);
  });

  it("sets volume", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.setVolume(0.5);
    });

    expect(audioInstance.volume).toBe(0.5);
    expect(result.current.volume).toBe(0.5);
  });

  it("sets playback rate", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.setPlaybackRate(1.5);
    });

    expect(audioInstance.playbackRate).toBe(1.5);
    expect(result.current.playbackRate).toBe(1.5);
  });

  it("updates state when audio element fires timeupdate", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
      audioInstance.currentTime = 10;
      audioInstance.duration = 100;
      audioInstance.dispatchEvent(new Event("timeupdate"));
    });

    waitFor(() => {
      expect(result.current.currentTime).toBe(10);
    });
  });

  it("updates duration when audio element loads metadata", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
      audioInstance.duration = 123.45;
      audioInstance.dispatchEvent(new Event("loadedmetadata"));
    });

    waitFor(() => {
      expect(result.current.duration).toBe(123.45);
    });
  });

  it("pauses when audio element ends", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    act(() => {
      result.current.loadSource("https://example.com/audio.mp3");
      audioInstance.paused = true;
      audioInstance.dispatchEvent(new Event("ended"));
    });

    waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
  });

  it("prevents seeking without a source", () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    const initialTime = audioInstance.currentTime;

    act(() => {
      result.current.seekTo(42);
    });

    expect(audioInstance.currentTime).toBe(initialTime);
  });

  it("prevents playing without a source", async () => {
    const { result } = renderHook(() => usePlayer(), {
      wrapper: PlayerProvider,
    });

    await act(async () => {
      await result.current.play();
    });

    expect(audioInstance.paused).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });
});
