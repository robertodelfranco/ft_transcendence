// Ícones da casca, todos no mesmo traço (24×24, contorno de 1,75, currentColor). São decorativos:
// aria-hidden, e o nome acessível continua sendo o texto ao lado. Sem arquivo para carregar, então
// nada a falhar no console
const PATHS = {
  // coroa: classificação
  crown: "M3 18h18M4 18 3 7l5 4 4-7 4 7 5-4-1 11M12 14h.01",
  // dois elmos: amigos
  friends: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20a6 6 0 0 1 12 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6 6 0 0 1 4 5.5",
  // engrenagem de forja: configurações
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  // porta em arco com seta: sair
  door: "M13 21H5V8a5 5 0 0 1 8-4M10 12h11m-3-3 3 3-3 3M9 13h.01",
  // elmo de cavaleiro: perfil
  helm: "M5 21v-9a7 7 0 0 1 14 0v9H5ZM8 11.5h8v3H8ZM12 5v3.5M12 14.5V21",
  // globo: idioma
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9",
  // espada: jogar, voltar à partida
  sword: "M20 4 9.5 14.5M20 4h-4.5M20 4v4.5M6 12l6 6M8.5 15.5 4 20M3 19l2 2",
  // chave: entrar
  key: "M14 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12.5 11.5l8 8m-4-4 2.5-2.5m-5.5-.5 2.5-2.5",
  // pergaminho: cadastro, páginas legais
  scroll: "M8 3h10.5A2.5 2.5 0 0 1 21 5.5V7h-4M17 5.5V18.5A2.5 2.5 0 0 1 14.5 21H5.5A2.5 2.5 0 0 1 3 18.5V17h11v1.5a2.5 2.5 0 0 0 2.5 2.5M8 3a2.5 2.5 0 0 0-2.5 2.5V17M9.5 8h4M9.5 12h4",
  // caveira: página não encontrada
  skull: "M12 3a8 8 0 0 0-5 14.2V21h10v-3.8A8 8 0 0 0 12 3ZM9 11.5a1.5 1.5 0 1 0 0 .01M15 11.5a1.5 1.5 0 1 0 0 .01M10.5 21v-2.5M13.5 21v-2.5M11 15.5l1-1.5 1 1.5",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
