import { useTranslation } from "react-i18next";
import { Link, Outlet, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import LanguageSelector from "./LanguageSelector";

const linkClass = "underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch";

export default function Layout() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

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
    <div className="flex min-h-screen flex-col bg-crypt-950 text-bone">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-crypt-700 px-4 py-3">
        <Link
          to="/"
          className="text-lg font-bold text-torch focus-visible:outline-2 focus-visible:outline-torch"
        >
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-4">
          {status === "authenticated" && (
            <>
              <span className="text-sm">{user?.username}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded border border-crypt-700 px-2 py-1 text-sm hover:text-torch focus-visible:outline-2 focus-visible:outline-torch"
              >
                {t("nav.logout")}
              </button>
            </>
          )}
          <LanguageSelector />
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-crypt-700 px-4 py-4">
        <nav aria-label={t("footer.navLabel")} className="flex gap-4 text-sm">
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
