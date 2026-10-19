// Adds any missing seed document type (insert-if-missing, never touches an existing row).
// The migration 0034 already seeds them; this is for a database built another way (drizzle-kit push).
//   npm --prefix server run db:seed-document-types
import "dotenv/config";
import { seedMissing } from "../modules/documents/document-types/repository.js";

const added = await seedMissing("seed-script");
console.log(`Document types: ${added} added, ${added === 0 ? "nothing missing" : "done"}.`);
process.exit(0);
