// apps/api/src/decision-support/service.ts (objectives fix 3.7)
//
// Records whether advice was shown, taken or dismissed, and summarizes it. The
// recording is best effort by design: a failure here is logged and never stops
// the action the person was actually doing.
import * as repo from "./repository.js";
import { summarizeEvents } from "./summary.js";

export type { NewEvent } from "./repository.js";

export const record = (userId: number, events: repo.NewEvent[]) => repo.insertEvents(userId, events);

/** For server code that records as a side effect of a real action: never throws. */
export const recordQuietly = async (userId: number, events: repo.NewEvent[]): Promise<void> => {
  try {
    await repo.insertEvents(userId, events);
  } catch (err) {
    console.error("[decision-support] could not record events", err);
  }
};

export const getSummary = async () => ({
  kinds: summarizeEvents(await repo.countByKindAndAction()),
  note: "Counts of advice shown, accepted and dismissed. Each person and item is counted once per action. Only the user id is stored.",
});
