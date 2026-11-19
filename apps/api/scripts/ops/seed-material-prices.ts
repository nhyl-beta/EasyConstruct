import "dotenv/config";
import { seedMissing } from "../../src/modules/finance/material-prices/repository.js";

const added = await seedMissing();
console.log(`Material price references: ${added} added, ${added === 0 ? "nothing missing" : "done"}.`);
process.exit(0);
