import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { BudgetSettingsPage } from "./pages/BudgetSettingsPage";
import { CompanySettingsPage } from "./pages/CompanySettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { ModuleCatalogPage } from "./pages/ModuleCatalogPage";
import { ModuleEditorPage } from "./pages/ModuleEditorPage";
import { ModuleOrderWizardPage } from "./pages/ModuleOrderWizardPage";
import { ModuleOrdersPage } from "./pages/ModuleOrdersPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { OptimizerSettingsPage } from "./pages/OptimizerSettingsPage";
import { OrdersPage } from "./pages/OrdersPage";
import { UsersPage } from "./pages/UsersPage";
import type { Rol } from "./types";

// Un detalle por solicitud: al pasar de una a otra (por ejemplo, saltando con el historial del navegador) se monta uno
// nuevo, sin la anterior cargada mientras llega la otra.
function OrderDetailRoute() {
  const { id } = useParams();
  return <OrderDetailPage key={id} />;
}

// Las dos rutas del detalle arman el mismo arbol (ProtectedRoute > OrderDetailRoute). Asi, cuando la misma solicitud
// pasa de /pedidos/:id a /modulos/:id o al reves segun su tipo (DECISIONES 43), React conserva la pantalla ya cargada en
// vez de montarla de nuevo y pedir todo otra vez. Sin roles, ProtectedRoute solo muestra la pantalla: la ruta padre ya
// exige la sesion.
const orderDetail = (roles?: Rol[]) => (
  <ProtectedRoute roles={roles}>
    <OrderDetailRoute />
  </ProtectedRoute>
);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage mode="google" />} />
      <Route path="/admin" element={<LoginPage mode="admin" />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="pedidos/nuevo" element={<OrderFormPage />} />
        <Route path="solicitar" element={<OrderFormPage />} />
        <Route path="mis-solicitudes" element={<OrdersPage />} />
        <Route path="pedidos/:id" element={orderDetail()} />
        <Route path="pedidos/:id/editar" element={<OrderFormPage />} />
        <Route
          path="modulos"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ModuleOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="modulos/nueva"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ModuleOrderWizardPage />
            </ProtectedRoute>
          }
        />
        {/* Hasta el detalle de modulos (F5.1), el detalle comun en la URL de la seccion (DECISIONES 43). */}
        <Route path="modulos/:id" element={orderDetail(["ADMIN"])} />
        <Route
          path="materiales"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <MaterialsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="usuarios"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-empresa"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <CompanySettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-optimizador"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <OptimizerSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-modulos"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ModuleCatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-modulos/nuevo"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ModuleEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-modulos/:id"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ModuleEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion-presupuesto"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <BudgetSettingsPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
