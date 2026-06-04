import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Rol } from "../types";

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Rol[] }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
