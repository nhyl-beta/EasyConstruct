import { ROLES } from "../../src/roles.js";
import { defineRoleSuite } from "./role-suite.js";
defineRoleSuite(ROLES.find((r) => r.slug === "human-resources")!);
