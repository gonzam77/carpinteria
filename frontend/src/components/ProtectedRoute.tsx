import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Rol } from "../types";

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Rol[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    const adminSection = roles?.includes("ADMIN") || location.pathname.startsWith("/usuarios") || location.pathname.startsWith("/materiales") || location.pathname.startsWith("/configuracion-");
    return <Navigate to={adminSection ? "/admin" : "/login"} replace />;
  }
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
