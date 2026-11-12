import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { LifecycleRepository } from "../repositories/lifecycle.repository";

// K1. A query (not local state) so the live inbox sync can invalidate it.
export function useMyActions() {
  const query = useQuery({
    queryKey: qk.lifecycle.myActions,
    queryFn: () => LifecycleRepository.getMyActions(),
    retry: false,
  });
  return { actions: query.data ?? [], loading: query.isLoading };
}
