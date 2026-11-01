import { ROLES } from "../../src/roles.js";
import { defineCrawlSuite } from "./crawl-suite.js";
defineCrawlSuite(ROLES.find((r) => r.slug === "site-personnel")!);
