import { useTranslation } from "react-i18next";
import ErrorNotice from "../components/ErrorNotice";
import { useAppSocket } from "./AppSocketContext";

// Aviso das telas que dependem do /ws/app: reconectando, ou parado de vez por bug (4400).
// Sem sessão (4401) não precisa: a casca já volta ao login
export default function SocketNotice() {
  const { t } = useTranslation("lobby");
  const { status, error } = useAppSocket();

  if (status === "reconnecting") {
    return (
      <p role="status" className="rounded border border-torch/60 px-3 py-2 text-sm text-torch">
        {t("socket.reconnecting")}
      </p>
    );
  }
  if (status === "closed" && error === "invalid_message")
    return <ErrorNotice failure={{ code: error, requestId: null }} />;
  return null;
}
