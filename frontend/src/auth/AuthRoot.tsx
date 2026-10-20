import { Outlet } from "react-router";
import { AppSocketProvider } from "../ws/AppSocketContext";
import { AuthProvider } from "./AuthContext";

export default function AuthRoot() {
  return (
    <AuthProvider>
      {/* o /ws/app depende da sessão, então mora dentro do AuthProvider */}
      <AppSocketProvider>
        <Outlet />
      </AppSocketProvider>
    </AuthProvider>
  )
}