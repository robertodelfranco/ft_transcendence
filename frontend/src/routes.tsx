import type { RouteObject  } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

// Layout sem path: cabeçalho e rodapé em toda página, inclusive a 404
export const routes: RouteObject [] = [
	{
		element: <Layout />,
		children: [
			{ index: true, element: <Home /> },
			{ path: "privacy", element: <Privacy />},
			{ path: "terms", element: <Terms /> },
			{ path: "*", element: <NotFound />},
		],
	},
];