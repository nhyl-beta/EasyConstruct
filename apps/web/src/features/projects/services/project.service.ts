import { Project } from "../types/project.types";
import { ProjectRepository } from "../repositories/project.repository";
import { ProjectsKpi } from "../types/project.types";

export const ProjectService = {
  async fetchAll(): Promise<Project[]> {
    return ProjectRepository.list();
  },

  async fetchById(code: string) {
    return ProjectRepository.getById(code);
  },

  // business logic: filtering / searching / pagination happen here so views remain thin
  async queryProjects({ q, status, risk, page = 1, perPage = 20 }: any) {
    const all = await ProjectRepository.list();
    let filtered = all;
    if (q) {
      const term = q.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term),
      );
    }
    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }
    if (risk && risk !== "any") {
      filtered = filtered.filter((p) => p.risk === risk);
    }
    const total = filtered.length;
    const start = (page - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage);
    return { data: pageItems, total };
  },

  calcKpis(projects: Project[]): ProjectsKpi {
    const total = projects.length;
    const onTrack = projects.filter((p) => p.status.toLowerCase().includes("on track")).length;
    const atRisk = projects.filter((p) => p.status.toLowerCase().includes("risk")).length;
    const delayed = projects.filter((p) => p.status.toLowerCase().includes("delay")).length;
    return { total, onTrack, atRisk, delayed };
  },
};
