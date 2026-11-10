import type { DesignRequest } from "../types/request.types";

export interface NestedRequest {
  request: DesignRequest;
  /** Follow-ups of this request that are in the same list, oldest first. */
  followUps: DesignRequest[];
}

/**
 * B-208: a follow-up is its own numbered request (002-26 next to 001-26), but in the list it belongs under
 * the request it follows up. Top-level rows are the requests that are not follow-ups, plus any follow-up
 * whose original is not in this list (filtered out, or not visible), so a search for a follow-up's number
 * still finds it. The order of the incoming list is kept.
 */
export function nestFollowUps(requests: DesignRequest[]): NestedRequest[] {
  const ids = new Set(requests.map((r) => r.id));
  const children = new Map<number, DesignRequest[]>();
  for (const r of requests) {
    if (r.followUpOfId != null && ids.has(r.followUpOfId)) {
      children.set(r.followUpOfId, [...(children.get(r.followUpOfId) ?? []), r]);
    }
  }
  return requests
    .filter((r) => r.followUpOfId == null || !ids.has(r.followUpOfId))
    .map((request) => ({
      request,
      followUps: (children.get(request.id) ?? []).sort((a, b) => a.id - b.id),
    }));
}
