import type { RouteObject  } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import { LEGAL_PAGES } from "./i18n/legal";
import AuthRoot from "./auth/AuthRoot";
import Lobby from "./pages/Lobby";
import PublicOnly from "./components/PublicOnly";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Play from "./pages/Play";
import WaitingRoom from "./pages/WaitingRoom";
import UserProfile from "./pages/UserProfile";
import Settings from "./pages/Settings";
import Friends from "./pages/Friends";
import Leaderboard from "./pages/Leaderboard";
import FinishedMatch from "./pages/FinishedMatch";

// Layout sem path: cabeçalho e rodapé em toda página, inclusive a 404
export const routes: RouteObject [] = [
  {
    element: <AuthRoot />,
    children: [
      {
        element: <Layout />,
        children: [
          { element: <PublicOnly />,
            children: [
              { index: true, element: <Home /> },
              { path: "login", element: <Login /> },
              { path: "signup", element: <Signup /> },
            ],
          },
          // /privacy e /terms, abertas sem login: uma rota por página de LEGAL_PAGES
          ...LEGAL_PAGES.map((page) => ({ path: page, element: <Legal page={page} /> })),
          {
            element: <RequireAuth />,
            children: [
              { path: "lobby", element: <Lobby /> },
              { path: "lobby/:matchId", element: <WaitingRoom /> },
              { path: "play/:matchId", element: <Play /> },
              { path: "matches/:matchId", element: <FinishedMatch /> },
              { path: "users/:userId", element: <UserProfile /> },
              { path: "settings", element: <Settings />},
              { path: "friends", element: <Friends /> },
              { path: "leaderboard", element: <Leaderboard /> },
            ],
          },
          { path: "*", element: <NotFound />},
        ],
      },
    ],
  },
];
