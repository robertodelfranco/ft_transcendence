import type { RouteObject  } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import AuthRoot from "./auth/AuthRoot";
import Lobby from "./pages/Lobby";
import PublicOnly from "./components/PublicOnly";
import RequireAuth from "./components/RequireAuth";

// Layout sem path: cabeçalho e rodapé em toda página, inclusive a 404
export const routes: RouteObject [] = [
	{
		element: <AuthRoot />,
		children: [
			{
				element: <Layout />,
				children: [
					{ element: <PublicOnly />, children: [{ index: true, element: <Home /> }] },
					{ path: "privacy", element: <Privacy />},
					{ path: "terms", element: <Terms /> },
					{ element: <RequireAuth />, children: [{ path: "lobby", element: <Lobby /> }] },
					{ path: "*", element: <NotFound />},
				],
			},
		],
	},
];