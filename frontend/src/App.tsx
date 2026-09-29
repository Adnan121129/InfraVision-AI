import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { FullScreenLoader, RequireAuth, RequireRole } from "./components/RequireAuth";
import { MetaProvider } from "./contexts/MetaContext";
import { RealtimeProvider } from "./contexts/RealtimeContext";
import { AppLayout } from "./layouts/AppLayout";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AssetsPage = lazy(() => import("./pages/assets/AssetsPage"));
const AssetDetailPage = lazy(() => import("./pages/assets/AssetDetailPage"));
const InspectionsPage = lazy(() => import("./pages/inspections/InspectionsPage"));
const NewInspectionPage = lazy(() => import("./pages/inspections/NewInspectionPage"));
const InspectionResultPage = lazy(() => import("./pages/inspections/InspectionResultPage"));
const AIAnalysisPage = lazy(() => import("./pages/AIAnalysisPage"));
const AlertsPage = lazy(() => import("./pages/AlertsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ModelsPage = lazy(() => import("./pages/ModelsPage"));
const ArchitecturePage = lazy(() => import("./pages/ArchitecturePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <MetaProvider>
                <RealtimeProvider>
                  <AppLayout />
                </RealtimeProvider>
              </MetaProvider>
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="inspections" element={<InspectionsPage />} />
          <Route
            path="inspections/new"
            element={
              <RequireRole role="INSPECTOR">
                <NewInspectionPage />
              </RequireRole>
            }
          />
          <Route path="inspections/:id" element={<InspectionResultPage />} />
          <Route path="analysis" element={<AIAnalysisPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="architecture" element={<ArchitecturePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="admin/users"
            element={
              <RequireRole role="ADMINISTRATOR">
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/settings"
            element={
              <RequireRole role="ADMINISTRATOR">
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
