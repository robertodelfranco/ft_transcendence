import { Outlet } from "react-router";
import { AuthProvider } from "./AuthContext";

export default function AuthRoot() {
	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	)
}