import { Navigate, Outlet, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import Loading from "./Loading";

export default function PublicOnly() {
	const { status } = useAuth();
	const [params] = useSearchParams();

	if (status === "loading")
		return <Loading />
	if (status === "authenticated")
		return <Navigate to={safeNext(params.get("next"))} replace />;
	return <Outlet />
}