import { useEffect, useState } from "react";
import {
  tasksRepository,
  type AssigneeSuggestions,
  type AssignmentWarning,
} from "../repositories/task.repository";

const DEBOUNCE_MS = 400;

/**
 * Ranked assignee suggestions for the task being drafted. Read-only advice:
 * it refetches (debounced) as the title, due date or milestone change and
 * never saves anything. The title needs a couple of characters before it asks.
 */
export function useAssigneeSuggestions(input: {
  projectCode: string;
  title: string;
  dueDate?: string;
  milestoneId?: number;
}) {
  const { projectCode, title, dueDate, milestoneId } = input;
  const [data, setData] = useState<AssigneeSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(projectCode) && title.trim().length >= 2;

  useEffect(() => {
    if (!ready) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      tasksRepository
        .suggestAssignees({ projectCode, title: title.trim(), dueDate: dueDate || undefined, milestoneId })
        .then((res) => {
          if (cancelled) return;
          setData(res);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Couldn't load suggestions");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, projectCode, title, dueDate, milestoneId]);

  return { data, loading, error, ready };
}

/** Workload warnings for a person picked by hand; advisory, never blocks. */
export function useAssignmentWarnings(userId: number | null, dueDate?: string) {
  const [warnings, setWarnings] = useState<AssignmentWarning[]>([]);

  useEffect(() => {
    if (userId == null) {
      setWarnings([]);
      return;
    }
    let cancelled = false;
    tasksRepository
      .assignmentWarnings({ userId, dueDate: dueDate || undefined })
      .then((w) => {
        if (!cancelled) setWarnings(w);
      })
      .catch(() => {
        if (!cancelled) setWarnings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, dueDate]);

  return warnings;
}
