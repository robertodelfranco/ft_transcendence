import { Outlet } from "react-router";
import { AppSocketProvider } from "../ws/AppSocketContext";
import MatchStartedRedirect from "../ws/MatchStartedRedirect";
import { AuthProvider } from "./AuthContext";

export default function AuthRoot() {
  return (
    <AuthProvider>
      {/* o /ws/app depende da sessão, então mora dentro do AuthProvider */}
      <AppSocketProvider>
        <MatchStartedRedirect />
        <Outlet />
      </AppSocketProvider>
    </AuthProvider>
  )
}