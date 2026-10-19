import {
  useDesignCreateController,
  type DesignFormData,
} from "../controllers/design-create.controller";

export type { DesignFormData };

export const useDesignCreate = () => useDesignCreateController();
