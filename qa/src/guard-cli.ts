import { guardOrExit } from "./guard.js";
const c = guardOrExit();
console.log(`QA guard OK\n  database: ${c.dbHost}:${c.dbPort}/${c.dbName}\n  web:      ${c.baseUrl}\n  api:      ${c.apiUrl}`);
