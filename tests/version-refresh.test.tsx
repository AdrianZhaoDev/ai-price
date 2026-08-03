import { act, cleanup, renderHook } from "@testing-library/react";
import {
  VERSION_CHECK_INTERVAL_MS,
  useVersionRefresh,
} from "@/lib/pricing/use-version-refresh";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("pricing version refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("checks once per 15-minute visible window", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ version: "v1" })));

    renderHook(() =>
      useVersionRefresh({
        mode: "global",
        dataVersion: "v1",
        onVersionChange: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not check while hidden and checks when a stale tab returns", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ version: "v1" })));

    renderHook(() =>
      useVersionRefresh({
        mode: "api",
        dataVersion: "v1",
        onVersionChange: vi.fn(),
      }),
    );

    act(() => setVisibility("hidden"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates in-flight checks and refreshes only for a new version", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onVersionChange = vi.fn();

    renderHook(() =>
      useVersionRefresh({
        mode: "china-subscription",
        dataVersion: "v1",
        onVersionChange,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS);
    });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ version: "v2" })));
      await Promise.resolve();
    });
    expect(onVersionChange).toHaveBeenCalledTimes(1);
  });

  it("aborts an active check when unmounted", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = renderHook(() =>
      useVersionRefresh({
        mode: "global",
        dataVersion: null,
        onVersionChange: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS);
    });
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
