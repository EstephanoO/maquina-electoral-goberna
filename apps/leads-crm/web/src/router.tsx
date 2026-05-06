import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";

// Lazy-loaded pages (code splitting per route).
const LoginPage     = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const LeadsPage     = lazy(() => import("./pages/LeadsPage"));
const ChatPage      = lazy(() => import("./pages/ChatPage"));
const ReportsPage   = lazy(() => import("./pages/ReportsPage"));
const TrainingPage  = lazy(() => import("./pages/TrainingPage"));
const ProductsPage  = lazy(() => import("./pages/ProductsPage"));
const CampaignsPage   = lazy(() => import("./pages/CampaignsPage"));
const BotActivityPage = lazy(() => import("./pages/BotActivityPage"));
const SettingsPage    = lazy(() => import("./pages/SettingsPage"));

function RouteFallback() {
  return <div className="flex-1 flex items-center justify-center text-slate-400">Cargando…</div>;
}

function Suspended() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  );
}

// Auth guard that redirects to /login if no token.
function RequireAuth() {
  const token = localStorage.getItem("auth_token");
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell><Suspended /></AppShell>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={<RouteFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/",          element: <Navigate to="/chat" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/leads",     element: <LeadsPage /> },
      { path: "/leads/:id", element: <LeadsPage /> },
      { path: "/chat",      element: <ChatPage /> },
      { path: "/chat/:id",  element: <ChatPage /> },
      { path: "/reports",   element: <ReportsPage /> },
      { path: "/training",  element: <TrainingPage /> },
      { path: "/products",  element: <ProductsPage /> },
      { path: "/campaigns", element: <CampaignsPage /> },
      { path: "/bot",       element: <BotActivityPage /> },
      { path: "/settings",  element: <SettingsPage /> },
      { path: "/settings/:tab", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
