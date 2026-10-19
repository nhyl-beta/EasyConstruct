export type AppIdentity = {
  name: string;
  role: keyof typeof import("./role-tab").ROLE_CONFIGS;
  avatar?: string;
};

export const MOCK_IDENTITY: AppIdentity = {
  name: "Nhyl Cyrus Gervasio",
  role: "project_manager",
};
