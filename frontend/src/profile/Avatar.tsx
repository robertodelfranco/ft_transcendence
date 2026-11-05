import { useState } from "react";
import type { PublicUser } from "../api/types";

// Avatar de um User (i18n.md §2.7). Fica sempre ao lado do nome, então a imagem é decorativa
// (alt vazio). Se o arquivo não carregar, mostra a inicial no lugar, sem pedir outra URL
export default function Avatar({ user, large = false }: {
  user: Pick<PublicUser, "username" | "avatar_url">;
  large?: boolean; // o do topo do perfil; o pequeno é o das listas
}) {
  // guarda qual URL falhou: um avatar novo (outra URL) tenta de novo sem precisar de efeito
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = `${large ? "size-32 text-5xl" : "size-10 text-lg"} shrink-0 rounded-full`;

  if (failedSrc === user.avatar_url) {
    return (
      <span aria-hidden className={`${box} flex items-center justify-center bg-crypt-700 font-bold text-torch`}>
        {user.username.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img src={user.avatar_url} alt="" onError={() => setFailedSrc(user.avatar_url)}
      className={`${box} object-cover`} />
  );
}
