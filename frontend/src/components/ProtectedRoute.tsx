import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Rol } from "../types";

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: Rol[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    const adminSection = roles?.includes("ADMIN") || location.pathname.startsWith("/usuarios") || location.pathname.startsWith("/materiales") || location.pathname.startsWith("/configuracion-") || location.pathname.startsWith("/modulos");
    // Se guarda la ruta para volver a ella despues de ingresar: si estaba cargando
    // una solicitud, ahi es donde aparece el aviso para recuperarla.
    return <Navigate to={adminSection ? "/admin" : "/login"} replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
