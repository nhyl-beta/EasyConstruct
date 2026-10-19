import { useEffect, useState } from "react";
import { RevisionRepository } from "../repositories/revision.repository";
import type { Revision, RevisionItemType } from "../types/revision.types";

/**
 * The current revision of every item of one type that the caller can see, keyed
 * by item id — one request, so list pages (designs, blueprints, documentation,
 * design reviews) can show "latest revision" per row without a request per row.
 */
export function useCurrentRevisions(itemType: RevisionItemType, enabled = true) {
  const [byItem, setByItem] = useState<Record<number, Revision>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    RevisionRepository.list({ itemType, currentOnly: true }, { page: 1, pageSize: 100 })
      .then((page) => {
        if (!cancelled) setByItem(Object.fromEntries(page.items.map((r) => [r.itemId, r])));
      })
      .catch(() => {
        if (!cancelled) setByItem({});
      });
    return () => {
      cancelled = true;
    };
  }, [itemType, enabled]);

  return byItem;
}
