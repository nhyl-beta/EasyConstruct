import { ROLES } from "../../src/roles.js";
import { defineFunctionalSuite } from "./functional-suite.js";
defineFunctionalSuite(ROLES.find((r) => r.slug === "it-designer")!);
