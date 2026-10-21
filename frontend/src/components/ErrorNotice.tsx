import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { errorMessage } from "../i18n/errorMessage";

// O que a tela guarda de um erro: só o code e o request_id, nunca a message do servidor
export interface Failure {
  code: string;
  requestId: string | null;
}

export function toFailure(error: unknown): Failure {
  return error instanceof ApiError
    ? { code: error.code, requestId: error.requestId }
    : { code: "unknown", requestId: null };
}

// role="alert": o leitor de tela anuncia o erro assim que ele aparece
export default function ErrorNotice({ failure }: { failure: Failure }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className="rounded border border-red-400 px-3 py-2 text-sm text-red-400">
      {errorMessage(t, failure.code, failure.requestId)}
    </p>
  );
}
