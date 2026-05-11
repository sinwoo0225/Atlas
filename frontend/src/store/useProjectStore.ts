import { create } from 'zustand';
import type { Project } from '../types';

interface ProjectStore {
  projects: Project[];
  selectedProjectId: number | null;
  setProjects: (projects: Project[]) => void;
  selectProject: (id: number | null) => void;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  removeProject: (id: number) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  selectedProjectId: null,
  setProjects: (projects) => set({ projects }),
  selectProject: (id) => set({ selectedProjectId: id }),
  addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
  updateProject: (p) => set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? p : x)) })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((x) => x.id !== id) })),
}));
