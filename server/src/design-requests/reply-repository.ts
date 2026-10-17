// server/src/design-requests/reply-repository.ts (client demo change #6)
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  designRequestFiles,
  designRequestRecipients,
  designRequestReplyTokens,
  designRequests,
  type DesignRequest,
  type DesignRequestFile,
  type DesignRequestRecipient,
  type DesignRequestReplyToken,
} from "../db/schema/design-requests.js";

export const insertToken = async (recipientId: number, tokenHash: string, expiresAt: Date): Promise<DesignRequestReplyToken> => {
  const [row] = await db.insert(designRequestReplyTokens).values({ recipientId, tokenHash, expiresAt }).returning();
  return row!;
};

export interface TokenContext {
  token: DesignRequestReplyToken;
  recipient: DesignRequestRecipient;
  request: DesignRequest;
}

/** The token, its recipient and its request, looked up by the hash of what was presented. */
export const findByTokenHash = async (tokenHash: string): Promise<TokenContext | null> => {
  const [row] = await db
    .select({ token: designRequestReplyTokens, recipient: designRequestRecipients, request: designRequests })
    .from(designRequestReplyTokens)
    .innerJoin(designRequestRecipients, eq(designRequestRecipients.id, designRequestReplyTokens.recipientId))
    .innerJoin(designRequests, eq(designRequests.id, designRequestRecipients.requestId))
    .where(eq(designRequestReplyTokens.tokenHash, tokenHash));
  return row ?? null;
};

export const findRequestFiles = (requestId: number): Promise<DesignRequestFile[]> =>
  db.select().from(designRequestFiles).where(and(eq(designRequestFiles.requestId, requestId), eq(designRequestFiles.stage, "request"))).orderBy(designRequestFiles.id);

export const findFile = async (fileId: number): Promise<DesignRequestFile | null> => {
  const [row] = await db.select().from(designRequestFiles).where(eq(designRequestFiles.id, fileId));
  return row ?? null;
};

/**
 * Single use, decided by the database: the first caller flips used_at and gets true, anyone else (a double
 * click, two tabs) gets false. A token that has expired cannot be claimed either.
 */
export const claimToken = async (tokenId: number, now: Date): Promise<boolean> => {
  const rows = await db
    .update(designRequestReplyTokens)
    .set({ usedAt: now })
    .where(and(eq(designRequestReplyTokens.id, tokenId), isNull(designRequestReplyTokens.usedAt), gt(designRequestReplyTokens.expiresAt, now)))
    .returning({ id: designRequestReplyTokens.id });
  return rows.length > 0;
};

export interface ReplyToSave {
  requestId: number;
  recipientId: number;
  responseText: string;
  responderName: string;
  responderPosition: string;
  now: Date;
  /** Move the request to client_replied (it was still waiting for the client). */
  markClientReplied: boolean;
  files: { url: string; filename: string; contentType: string; sizeBytes: number }[];
}

/** Saves one recipient's reply on the recipient, the request and its files, together. */
export const saveReply = async (r: ReplyToSave): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx
      .update(designRequestRecipients)
      .set({ repliedAt: r.now, responseText: r.responseText, responderName: r.responderName, responderPosition: r.responderPosition })
      .where(eq(designRequestRecipients.id, r.recipientId));
    // Every other link this person was sent is spent too: one reply per recipient.
    await tx
      .update(designRequestReplyTokens)
      .set({ usedAt: r.now })
      .where(and(eq(designRequestReplyTokens.recipientId, r.recipientId), isNull(designRequestReplyTokens.usedAt)));
    await tx
      .update(designRequests)
      .set({
        responseText: r.responseText,
        respondedByName: r.responderName,
        respondedByPosition: r.responderPosition,
        respondedAt: r.now,
        updatedAt: r.now,
        ...(r.markClientReplied ? { status: "client_replied" } : {}),
      })
      .where(eq(designRequests.id, r.requestId));
    // The first reply stamps client_replied_at; later replies leave it.
    await tx
      .update(designRequests)
      .set({ clientRepliedAt: r.now })
      .where(and(eq(designRequests.id, r.requestId), isNull(designRequests.clientRepliedAt)));
    if (r.files.length) {
      await tx.insert(designRequestFiles).values(
        r.files.map((f) => ({ ...f, requestId: r.requestId, stage: "response", uploadedByName: r.responderName.slice(0, 100), recipientId: r.recipientId })),
      );
    }
  });
};

export const findResponseFiles = (requestId: number): Promise<DesignRequestFile[]> =>
  db.select().from(designRequestFiles).where(and(eq(designRequestFiles.requestId, requestId), eq(designRequestFiles.stage, "response"))).orderBy(designRequestFiles.id);
