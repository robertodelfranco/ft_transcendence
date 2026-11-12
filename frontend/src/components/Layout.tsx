import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useMatches, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import LanguageSelector from "./LanguageSelector";
import Loading from "./Loading";

const linkClass = "underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch";
// no menu compacto o sublinhado sai: o menu já se reconhece como navegação, e o foco segue visível
const compactLinkClass = "hover:text-torch hover:underline focus-visible:outline-2 focus-visible:outline-torch";

// o que uma rota pode pedir ao Layout pelo `handle` (routes.tsx)
type RouteHandle = { compact?: boolean };

export default function Layout() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  // modo partida (#254): a rota declara, e o Layout só encolhe cabeçalho, miolo e rodapé
  const compact = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.compact);
  const navLink = compact ? compactLinkClass : linkClass;

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

  return (
    <div data-layout={compact ? "compact" : "default"} className="flex min-h-screen flex-col bg-crypt-950 text-bone">
      <header className={`flex flex-wrap items-center justify-between gap-2 border-b border-crypt-700 px-4 ${compact ? "py-1" : "py-3"}`}>
        <Link
          to="/"
          className={`${compact ? "text-base" : "text-lg"} font-bold text-torch focus-visible:outline-2 focus-visible:outline-torch`}
        >
          {t("app.name")}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {status === "authenticated" && user && (
            <>
              {/* o nome leva ao próprio perfil: mostra quem entrou e é o caminho para ele */}
              <nav aria-label={t("nav.label")} className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${compact ? "text-xs" : "text-sm"}`}>
                <Link to={`/users/${user.id}`} className={navLink}>{user.username}</Link>
                <Link to="/leaderboard" className={navLink}>{t("nav.leaderboard")}</Link>
                <Link to="/friends" className={navLink}>{t("nav.friends")}</Link>
                <Link to="/settings" className={navLink}>{t("nav.settings")}</Link>
              </nav>
              <button
                type="button"
                onClick={handleLogout}
                className={`rounded border border-crypt-700 px-2 ${compact ? "py-0.5 text-xs" : "py-1 text-sm"} hover:text-torch focus-visible:outline-2 focus-visible:outline-torch`}
              >
                {t("nav.logout")}
              </button>
            </>
          )}
          <LanguageSelector />
        </div>
      </header>

      <main className={`flex-1 px-4 ${compact ? "py-2" : "py-8"}`}>
        {/* página com React.lazy: cabeçalho e rodapé ficam na tela, só o miolo espera o chunk */}
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className={`border-t border-crypt-700 px-4 ${compact ? "py-1" : "py-4"}`}>
        {/* compacto, mas sempre visível: o subject pede os links legais em toda página */}
        <nav aria-label={t("footer.navLabel")} className={`flex gap-4 ${compact ? "text-xs" : "text-sm"}`}>
          <Link to="/privacy" className={linkClass}>
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className={linkClass}>
            {t("footer.terms")}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
