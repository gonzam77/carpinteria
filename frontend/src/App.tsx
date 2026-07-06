import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { BudgetSettingsPage } from "./pages/BudgetSettingsPage";
import { CompanySettingsPage } from "./pages/CompanySettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { OptimizerSettingsPage } from "./pages/OptimizerSettingsPage";
import { OrdersPage } from "./pages/OrdersPage";
import { UsersPage } from "./pages/UsersPage";

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
        <Route path="pedidos/:id" element={<OrderDetailPage />} />
        <Route path="pedidos/:id/editar" element={<OrderFormPage />} />
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
