import { financeStatuses } from "../status/finance";
import { hrStatuses } from "../status/hr";
//import { projectStatuses } from "./project";

export const STATUS_CONFIG = {
  ...financeStatuses,
  ...hrStatuses,
//  ...projectStatuses,
};