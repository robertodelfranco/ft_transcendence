import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import Loading from "./Loading";

export default function RequireAuth() {
	const { status } = useAuth();
	const { pathname, search } = useLocation();

	// Ainda não sabemos se há sessão: esperar, nunca redirecionar
	if (status === "loading")
		return <Loading />
	if (status === "anonymous")
		return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
	return <Outlet />
}