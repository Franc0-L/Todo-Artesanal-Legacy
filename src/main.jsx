import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/app.css";

const ClientOrder = lazy(() => import("./pages/ClientOrder.jsx"));
const AdminLogin = lazy(() => import("./pages/AdminLogin.jsx"));
const AdminPanel = lazy(() => import("./pages/AdminPanel.jsx"));
const NuevaSemana = lazy(() => import("./pages/NuevaSemana.jsx"));
const Platos = lazy(() => import("./pages/Platos.jsx"));
const Clientes = lazy(() => import("./pages/Clientes.jsx"));
const HistorialSemanas = lazy(() => import("./pages/HistorialSemanas.jsx"));
const Cancelaciones = lazy(() => import("./pages/Cancelaciones.jsx"));
const HistorialCliente = lazy(() => import("./pages/HistorialCliente.jsx"));
const Menus = lazy(() => import("./pages/Menus.jsx"));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div>Cargando...</div>}>
        <Routes>
          <Route path="/menu/:token" element={<ClientOrder />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/admin/nueva-semana" element={<NuevaSemana />} />
          <Route path="/admin/platos" element={<Platos />} />
          <Route path="/admin/menus" element={<Menus />} />
          <Route path="/admin/clientes" element={<Clientes />} />
          <Route
            path="/admin/historial-semanas"
            element={<HistorialSemanas />}
          />
          <Route path="/admin/cancelaciones" element={<Cancelaciones />} />
          <Route
            path="/admin/historial-cliente"
            element={<HistorialCliente />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
