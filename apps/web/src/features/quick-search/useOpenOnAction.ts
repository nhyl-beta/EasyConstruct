import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/**
 * Opens a page's own create dialog when the URL carries `?action=<key>` (what
 * the quick-search palette navigates to), then strips the param so it does
 * not linger or reopen the dialog on back/forward. `acceptNew` also honours
 * the older `?new=1` convention (used by the IT Designer users page and the
 * Consultant's advisory upload).
 *
 * Call it inside the component that owns the dialog's open state.
 */
export function useOpenOnAction(key: string, onOpen: () => void, options: { acceptNew?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });
  const acceptNew = options.acceptNew === true;

  useEffect(() => {
    const byAction = params.get("action") === key;
    const byNew = acceptNew && params.get("new") === "1";
    if (!byAction && !byNew) return;
    openRef.current();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (byAction) next.delete("action");
        if (byNew) next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams, key, acceptNew]);
}
