import { Route, Routes } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { EndpointsPage } from "@/pages/endpoints/EndpointsPage";
import { ScansPage } from "@/pages/scans/ScansPage";
import { FindingsPage } from "@/pages/findings/FindingsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="endpoints" element={<EndpointsPage />} />
        <Route path="scans" element={<ScansPage />} />
        <Route path="findings" element={<FindingsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
