import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { ProjectDashboardPage } from "@/pages/projects/ProjectDashboardPage";
import { EnvironmentsPage } from "@/pages/environments/EnvironmentsPage";
import { EndpointsPage } from "@/pages/endpoints/EndpointsPage";
import { ScansPage } from "@/pages/scans/ScansPage";
import { FindingsPage } from "@/pages/findings/FindingsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="projects/:projectId" element={<ProjectDashboardPage />} />
        <Route
          path="projects/:projectId/environments"
          element={<EnvironmentsPage />}
        />
        <Route
          path="projects/:projectId/endpoints"
          element={<EndpointsPage />}
        />
        <Route path="projects/:projectId/scans" element={<ScansPage />} />
        <Route
          path="projects/:projectId/findings"
          element={<FindingsPage />}
        />
        {/* Compatibilidade com rotas antigas (pré-IA) */}
        <Route path="endpoints" element={<Navigate to="/projects" replace />} />
        <Route path="scans" element={<Navigate to="/projects" replace />} />
        <Route path="findings" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  );
}
