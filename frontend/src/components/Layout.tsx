import { Suspense, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import LanguageSelector from "./LanguageSelector";
import Loading from "./Loading";

const navLinkClass =
  "rounded font-semibold text-bone transition-colors hover:bg-crypt-700 focus-visible:outline-2 focus-visible:outline-torch aria-[current=page]:text-torch";

// os dois desenhos do botão do menu: três traços fechado, um X aberto
const MENU_CLOSED_ICON = "M4 6h16M4 12h16M4 18h16";
const MENU_OPEN_ICON = "M6 6l12 12M18 6 6 18";

// o que uma rota pode pedir ao Layout pelo `handle` (routes.tsx)
type RouteHandle = { compact?: boolean };

export default function Layout() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Toda navegação fecha o menu, inclusive o Voltar do navegador: o key muda a cada entrada do
  // histórico. Comparar com o da renderização anterior é o jeito do React de resetar estado quando
  // algo muda, sem efeito (react.dev, "Storing information from previous renders")
  const [menuKey, setMenuKey] = useState(location.key);
  if (menuKey !== location.key) {
    setMenuKey(location.key);
    setMenuOpen(false);
  }
  // modo partida (#254): a rota declara, e o Layout só encolhe cabeçalho, miolo e rodapé
  const compact = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.compact);
  const navLink = `${navLinkClass} ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`;

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // a sessão local já foi limpa; o servidor revoga o cookie no próximo uso
    }
    // flushSync: troca a rota antes de o RequireAuth da rota antiga renderizar
    // e redirecionar para /login (sem isso o guarda ganha a corrida)
    navigate("/", { replace: true, flushSync: true });
  }

  // Esc fecha o menu aberto e devolve o foco ao botão que o abriu
  function handleMenuKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !menuOpen)
      return;
    setMenuOpen(false);
    menuButton.current?.focus();
  }

  // O foco saindo do <nav> (clique fora, ou Tab depois do último item) fecha o menu: o painel não
  // fica aberto por cima da página
  function handleMenuBlur(event: FocusEvent<HTMLElement>) {
    if (menuOpen && !event.currentTarget.contains(event.relatedTarget as Node | null))
      setMenuOpen(false);
  }

  return (
    <div data-layout={compact ? "compact" : "default"} className="flex min-h-screen flex-col bg-crypt-950 text-bone">
      <header className={`relative flex flex-wrap items-center justify-between gap-2 border-b border-crypt-700 px-4 ${compact ? "py-1" : "py-3"}`}>
        <Link
          to="/"
          className={`${compact ? "text-base" : "text-lg"} font-bold text-torch focus-visible:outline-2 focus-visible:outline-torch`}
        >
          {t("app.name")}
        </Link>
        {status === "authenticated" && user ? (
          // Abaixo do md ficam à vista o nome do jogo, o username e o botão do menu; o resto vai para
          // o painel, que abre por cima da página. A partir do md, o painel é a linha de sempre
          <nav
            aria-label={t("nav.label")}
            onKeyDown={handleMenuKey}
            onBlur={handleMenuBlur}
            className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${compact ? "text-xs" : "text-sm"}`}
          >
            {/* o nome leva ao próprio perfil: mostra quem entrou e é o caminho para ele */}
            <NavLink to={`/users/${user.id}`} className={navLink}>{user.username}</NavLink>
            <button
              ref={menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded p-1.5 text-bone hover:bg-crypt-700 focus-visible:outline-2 focus-visible:outline-torch md:hidden"
            >
              <span className="sr-only">{t("nav.menu")}</span>
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                <path d={menuOpen ? MENU_OPEN_ICON : MENU_CLOSED_ICON} />
              </svg>
            </button>
            <div
              id={menuId}
              className={`${menuOpen ? "flex" : "hidden"} absolute inset-x-0 top-full z-30 flex-col items-start gap-3 border-b border-crypt-700 bg-crypt-950 px-4 py-3 md:static md:flex md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2 md:border-0 md:bg-transparent md:p-0`}
            >
              <div className="flex flex-col items-start gap-1 md:flex-row md:items-center">
                <NavLink to="/leaderboard" className={navLink}>{t("nav.leaderboard")}</NavLink>
                <NavLink to="/friends" className={navLink}>{t("nav.friends")}</NavLink>
                <NavLink to="/settings" className={navLink}>{t("nav.settings")}</NavLink>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className={`rounded border border-crypt-700 px-2 ${compact ? "py-0.5 text-xs" : "py-1 text-sm"} hover:text-torch focus-visible:outline-2 focus-visible:outline-torch`}
              >
                {t("nav.logout")}
              </button>
              <LanguageSelector />
            </div>
          </nav>
        ) : (
          <LanguageSelector />
        )}
      </header>

      <main className={`flex-1 px-4 ${compact ? "py-2" : "py-8"}`}>
        {/* página com React.lazy: cabeçalho e rodapé ficam na tela, só o miolo espera o chunk */}
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className={`border-t border-crypt-700 px-4 ${compact ? "py-1" : "py-4"}`}>
        {/* compacto, mas sempre visível: o subject pede os links legais em toda página */}
        <nav aria-label={t("footer.navLabel")} className={`flex flex-wrap justify-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
          <NavLink to="/privacy" className={navLink}>
            {t("footer.privacy")}
          </NavLink>
          <NavLink to="/terms" className={navLink}>
            {t("footer.terms")}
          </NavLink>
        </nav>
      </footer>
    </div>
  );
}
