import { create } from "zustand";

export interface LocalProject {
  id: string;
  name: string;
  description?: string;
  environments: Array<{
    id: string;
    name: string;
    baseUrl: string;
  }>;
}

interface ProjectState {
  projects: LocalProject[];
  activeProjectId: string | null;
  addProject: (project: LocalProject) => void;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [
    {
      id: "demo-sharezin",
      name: "Sharezin",
      description: "Projeto exemplo — staging/local",
      environments: [
        { id: "dev", name: "Development", baseUrl: "http://localhost:3000" },
        {
          id: "staging",
          name: "Staging",
          baseUrl: "https://staging.api.sharezin.com",
        },
      ],
    },
  ],
  activeProjectId: "demo-sharezin",
  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  setActiveProject: (id) => set({ activeProjectId: id }),
}));
