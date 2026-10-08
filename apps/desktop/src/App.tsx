import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { ProjectDashboardPage } from "@/pages/projects/ProjectDashboardPage";
import { EnvironmentsPage } from "@/pages/environments/EnvironmentsPage";
import { EnvironmentDetailPage } from "@/pages/environments/EnvironmentDetailPage";
import { FindingsPage } from "@/pages/findings/FindingsPage";
import { FlowEditorPage } from "@/pages/flows/FlowEditorPage";
import { FlowsPage } from "@/pages/flows/FlowsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

function LegacyEndpointsRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/environments`} replace />;
}

function LegacyScansRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/environments`} replace />;
}

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
          path="projects/:projectId/environments/:environmentId/*"
          element={<EnvironmentDetailPage />}
        />
        <Route
          path="projects/:projectId/endpoints"
          element={<LegacyEndpointsRedirect />}
        />
        <Route
          path="projects/:projectId/scans"
          element={<LegacyScansRedirect />}
        />
        <Route
          path="projects/:projectId/findings"
          element={<FindingsPage />}
        />
        <Route path="projects/:projectId/flows" element={<FlowsPage />} />
        <Route
          path="projects/:projectId/flows/:flowId"
          element={<FlowEditorPage />}
        />
        {/* Compatibilidade com rotas antigas (pré-IA) */}
        <Route path="endpoints" element={<Navigate to="/projects" replace />} />
        <Route path="scans" element={<Navigate to="/projects" replace />} />
        <Route path="findings" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  );
}
