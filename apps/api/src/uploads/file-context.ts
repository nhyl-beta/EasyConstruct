// apps/api/src/uploads/file-context.ts (client demo change #3)
//
// What the system knows about a stored url when someone downloads it: the document it belongs to (and
// so its project and type), and whether that type is in the Legal category. Best effort: a file that
// belongs to a blueprint or a request attachment simply has no document context.
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { documents } from "../db/schema/documents.js";
import { isLegalType } from "../reference/document-types/service.js";
import type { FileContext } from "./download-audit.js";

export async function findFileContext(url: string): Promise<{ ctx: FileContext | null; sensitive: boolean }> {
  try {
    const [doc] = await db
      .select({ documentId: documents.documentId, title: documents.title, project: documents.project, docType: documents.type })
      .from(documents)
      .where(eq(documents.fileUrl, url))
      .limit(1);
    if (!doc) return { ctx: null, sensitive: false };
    return { ctx: doc, sensitive: await isLegalType(doc.docType) };
  } catch (err) {
    console.error("[uploads] could not look up file context", err);
    return { ctx: null, sensitive: false };
  }
}
