import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server";
import { useApi } from "./useApi";

// Responde /api/test/<n> com {n}; os números de `held` esperam o release() para responder
function serveNumbers(...held: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(http.get("/api/test/:n", async ({ params }) => {
    if (held.includes(String(params.n)))
      await gate;
    return HttpResponse.json({ n: Number(params.n) });
  }));
  return release;
}

const render = (path: string) =>
  renderHook(({ current }) => useApi<{ n: number }>(current), { initialProps: { current: path } });

describe("useApi", () => {
  it("devolve o dado do caminho pedido", async () => {
    serveNumbers();
    const { result } = render("/api/test/1");
    await vi.waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    expect(result.current.failure).toBeNull();
  });

  it("erro do servidor vira failure com o code", async () => {
    server.use(http.get("/api/test/:n", () => HttpResponse.json(
      { error: { code: "user_not_found", message: "x", request_id: "test0001", fields: null } },
      { status: 404 },
    )));
    const { result } = render("/api/test/1");
    await vi.waitFor(() => expect(result.current.failure?.code).toBe("user_not_found"));
    expect(result.current.data).toBeNull();
  });

  it("trocar de caminho não mostra o dado do anterior enquanto o novo não chega", async () => {
    const release = serveNumbers("2");
    const { result, rerender } = render("/api/test/1");
    await vi.waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    rerender({ current: "/api/test/2" });
    expect(result.current.data).toBeNull();
    release();
    await vi.waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });

  it("a resposta atrasada de um caminho velho é descartada", async () => {
    const release = serveNumbers("1");
    const { result, rerender } = render("/api/test/1");
    rerender({ current: "/api/test/2" });
    await vi.waitFor(() => expect(result.current.data).toEqual({ n: 2 }));

    release();
    await new Promise((resolve) => setTimeout(resolve, 50)); // tempo para a resposta velha chegar
    expect(result.current.data).toEqual({ n: 2 });
  });
});
