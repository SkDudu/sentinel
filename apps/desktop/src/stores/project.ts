import { create } from "zustand";
import { api, type ProjectDto } from "@/services/api";

const ACTIVE_KEY = "sentinel.activeProjectId";

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

interface ProjectState {
  projects: ProjectDto[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  setActiveProject: (id: string | null) => void;
  createProject: (input: {
    name: string;
    description?: string;
  }) => Promise<ProjectDto>;
  updateProject: (
    id: string,
    input: { name?: string; description?: string | null },
  ) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createEnvironment: (
    projectId: string,
    input: {
      name: string;
      baseUrl: string;
      authType?: string;
      productionSafetyMode?: boolean;
      secret?: string;
    },
  ) => Promise<void>;
  updateEnvironment: (
    id: string,
    input: {
      name?: string;
      baseUrl?: string;
      authType?: string;
      productionSafetyMode?: boolean;
    },
  ) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setEnvironmentSecret: (id: string, secret: string) => Promise<void>;
  clearEnvironmentSecret: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: readActiveId(),
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.listProjects();
      const current = get().activeProjectId;
      const stillExists = projects.some((p) => p.id === current);
      const nextActive =
        stillExists && current
          ? current
          : (projects[0]?.id ?? null);
      writeActiveId(nextActive);
      set({ projects, activeProjectId: nextActive, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Falha ao carregar",
      });
    }
  },

  setActiveProject: (id) => {
    writeActiveId(id);
    set({ activeProjectId: id });
  },

  createProject: async (input) => {
    const created = await api.createProject(input);
    await get().loadProjects();
    get().setActiveProject(created.id);
    return created;
  },

  updateProject: async (id, input) => {
    await api.updateProject(id, input);
    await get().loadProjects();
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    if (get().activeProjectId === id) {
      writeActiveId(null);
      set({ activeProjectId: null });
    }
    await get().loadProjects();
  },

  createEnvironment: async (projectId, input) => {
    const { secret, ...rest } = input;
    const created = await api.createEnvironment(projectId, rest);
    if (secret?.trim()) {
      await api.setEnvironmentSecret(created.id, secret.trim());
    }
    await get().loadProjects();
  },

  updateEnvironment: async (id, input) => {
    await api.updateEnvironment(id, input);
    await get().loadProjects();
  },

  deleteEnvironment: async (id) => {
    await api.deleteEnvironment(id);
    await get().loadProjects();
  },

  setEnvironmentSecret: async (id, secret) => {
    await api.setEnvironmentSecret(id, secret);
    await get().loadProjects();
  },

  clearEnvironmentSecret: async (id) => {
    await api.clearEnvironmentSecret(id);
    await get().loadProjects();
  },
}));
