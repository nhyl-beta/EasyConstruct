import type { RequestHandler, Router } from "express";

export interface ModuleMount {
  order: number;
  prefix: string;
  router: Router;
  middleware?: RequestHandler[];
}

export interface ApiModule {
  name: string;
  flag?: string;
  mounts: ModuleMount[];
  ownsTables: string[];
}
