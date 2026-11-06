import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import matchResult from "../mocks/fixtures/matchResult.json";
import { server } from "../mocks/server";
import { RESULT_RETRY_MS, useMatchResult } from "./useMatchResult";

// Recusa os primeiros GET com os 409 da lista, na ordem, e depois devolve o Match 14
function refuseFirst(...codes: string[]) {
  const calls = { count: 0 };
  server.use(
    http.get("/api/matches/14/result", () => {
      const code = codes[calls.count++];
      return code
        ? HttpResponse.json(
            { error: { code, message: code, request_id: "test0001", fields: null } },
            { status: 409 },
          )
        : HttpResponse.json(matchResult);
    }),
  );
  return calls;
}

// o 409 chegou e a segunda tentativa ficou agendada para daqui a RESULT_RETRY_MS
const retryScheduled = () =>
  vi.waitFor(() => expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), RESULT_RETRY_MS));

// Só setTimeout/clearTimeout: se o relógio inteiro for falso, o MSW trava. O spy por cima do
// setTimeout falso é o que deixa conferir o atraso agendado
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(globalThis, "setTimeout");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useMatchResult", () => {
  it("devolve o Match gravado", async () => {
    const { result } = renderHook(() => useMatchResult(14));
    await vi.waitFor(() => expect(result.current.detail?.match_id).toBe(14));
    expect(result.current.failure).toBeNull();
  });

  // o vi.waitFor avança o relógio falso a cada checagem: por isso metade e metade, não 999 + 1 ms
  it("no match_not_finished, tenta de novo 1 s depois", async () => {
    const calls = refuseFirst("match_not_finished");
    const { result } = renderHook(() => useMatchResult(14));
    await retryScheduled();

    await act(() => vi.advanceTimersByTimeAsync(RESULT_RETRY_MS / 2));
    expect(calls.count).toBe(1);
    expect(result.current.failure).toBeNull(); // a primeira recusa não aparece na tela

    await act(() => vi.advanceTimersByTimeAsync(RESULT_RETRY_MS / 2));
    await vi.waitFor(() => expect(result.current.detail?.match_id).toBe(14));
    expect(calls.count).toBe(2);
  });

  it("a segunda recusa vira erro, sem terceira tentativa", async () => {
    const calls = refuseFirst("match_not_finished", "match_not_finished");
    const { result } = renderHook(() => useMatchResult(14));
    await retryScheduled();
    await act(() => vi.advanceTimersByTimeAsync(RESULT_RETRY_MS));
    await vi.waitFor(() => expect(result.current.failure?.code).toBe("match_not_finished"));

    await act(() => vi.advanceTimersByTimeAsync(10 * RESULT_RETRY_MS));
    expect(calls.count).toBe(2);
    expect(result.current.detail).toBeNull();
  });

  it("o match_aborted não tenta de novo", async () => {
    const calls = refuseFirst("match_aborted");
    const { result } = renderHook(() => useMatchResult(14));
    await vi.waitFor(() => expect(result.current.failure?.code).toBe("match_aborted"));

    await act(() => vi.advanceTimersByTimeAsync(10 * RESULT_RETRY_MS));
    expect(calls.count).toBe(1);
  });

  it("Match que não existe dá match_not_found", async () => {
    const { result } = renderHook(() => useMatchResult(999));
    await vi.waitFor(() => expect(result.current.failure?.code).toBe("match_not_found"));
  });

  it("sair da tela durante a espera cancela a segunda tentativa", async () => {
    const calls = refuseFirst("match_not_finished");
    const { unmount } = renderHook(() => useMatchResult(14));
    await retryScheduled();
    unmount();

    await act(() => vi.advanceTimersByTimeAsync(10 * RESULT_RETRY_MS));
    expect(calls.count).toBe(1);
  });
});
