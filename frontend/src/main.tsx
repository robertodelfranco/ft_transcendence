import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import "./i18n";
import "./index.css";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV || import.meta.env.VITE_MOCK_API !== "1")
		return;
	const { worker } = await import("./mocks/browser");
	// quiet: sem o aviso "Mocking enabled" no console; bypass: arquivos do Vite passa direto
	await worker.start({ quiet: true, onUnhandledFrame: "bypass" });
}

// o mock precisa estar de pé antes do primeiro render: o AuthProvider chama /refresh ao montar
void enableMocking().then(() => {
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>,
	);
});