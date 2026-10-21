import { getAccessToken, setAccessToken } from "../auth/token";
import type { AuthResponse, RefreshResponse } from "./types";

// Envelope de erro do backend (auth.md §2.5). `message` fica de fora de propósito:
// é texto de log em inglês e nunca aparece na tela.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | null;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string,
    fields: Record<string, string> | null = null,
    requestId: string | null = null,
  ) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

// Quem o AuthContext registra para ser avisado quando a sessão acaba de vez
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

// O socket do /ws/app também descobre que a sessão acabou (4401 que nem o refresh resolve)
export function reportSessionLost(): void {
  onSessionLost?.();
}

function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "unauthorized";
}

// Lê o envelope; se o corpo não for um (HTML de um 502 do Nginx, por exemplo), vira `unknown`
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: Record<string, unknown> };
      if (typeof error.code === "string") {
        return new ApiError(
          response.status,
          error.code,
          (error.fields as Record<string, string> | null) ?? null,
          typeof error.request_id === "string" ? error.request_id : null,
        );
      }
    }
  } catch {
    // corpo vazio ou que não é JSON: cai no `unknown` abaixo
  }
  return new ApiError(response.status, "unknown");
}

// Uma tentativa, sem lógica de retry. Quem decide repetir é o `apiFetch`.
async function attempt<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token)
    headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string")
    headers.set("Content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "network_error");
  }

  if (!response.ok)
    throw await toApiError(response);
  if (response.status === 204)
    return undefined as T;
  return (await response.json()) as T;
}

async function requestRefresh(): Promise<AuthResponse | null> {
  try {
    const data = await attempt<RefreshResponse>("/api/auth/refresh", { method: "POST" });
    if (!data.authenticated) {
      setAccessToken(null);
      return null;
    }
    setAccessToken(data.access_token);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.code === "invalid_refresh") {
      setAccessToken(null);
      return null;
    }
    throw error; // rede caiu
  }
}

// Single-flight: chamadas simultâneas esperam a mesma promessa em vez de refazer o refresh
let refreshing: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= requestRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await attempt<T>(path, init);
  } catch (error) {
    // Só o 401 de token (`unauthorized`); `invalid_credentials` é erro do User, não da sessão
    if (!isUnauthorized(error))
      throw error;

    if (await refreshSession()) {
      try {
        return await attempt<T>(path, init); // segunda e última tentativa
      } catch (retryError) {
        if (isUnauthorized(retryError))
          onSessionLost?.();
        throw retryError;
      }
    }
    onSessionLost?.();
    throw error;
  }
}