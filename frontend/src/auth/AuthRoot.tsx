import { Outlet } from "react-router";
import { AppSocketProvider } from "../ws/AppSocketContext";
import { FriendsPresenceProvider } from "../ws/FriendsPresence";
import MatchStartedRedirect from "../ws/MatchStartedRedirect";
import { AuthProvider } from "./AuthContext";

export default function AuthRoot() {
  return (
    <AuthProvider>
      {/* o /ws/app depende da sessão, então mora dentro do AuthProvider */}
      <AppSocketProvider>
        {/* dentro do socket, para escutar o welcome que chega logo depois do login */}
        <FriendsPresenceProvider>
          <MatchStartedRedirect />
          <Outlet />
        </FriendsPresenceProvider>
      </AppSocketProvider>
    </AuthProvider>
  )
}
