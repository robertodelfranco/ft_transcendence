import { useLocation, useNavigate } from "react-router";
import { useAppMessages } from "./AppSocketContext";

// match_started só chega a quem joga na Room (ws-manager.md §2.4), então vale em qualquer tela da
// casca, não só na sala de espera: o Player pode ter voltado ao lobby pelo navegador, ou estar
// em outra página quando o host inicia
export default function MatchStartedRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useAppMessages((message) => {
    if (message.type !== "match_started")
      return;
    // saindo da sala de espera, o voltar do navegador não deve cair numa sala que já começou
    navigate(`/play/${message.match_id}`, { replace: pathname.startsWith("/lobby/") });
  });

  return null;
}
