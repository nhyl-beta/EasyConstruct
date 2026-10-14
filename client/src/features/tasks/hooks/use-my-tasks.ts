// client/src/features/tasks/hooks/use-my-tasks.ts — NEW
import { useCallback, useEffect, useState } from "react";
import {
  tasksRepository,
  type CreateTaskInput,
  type TaskCompletionInput,
  type TaskRecord,
  type TaskWithWarnings,
} from "../repositories/task.repository";

const NEXT_STATUS: Record<string, string | null> = {
  Pending: "In Progress",
  "In Progress": "Completed",
  Completed: null,
};

export function useMyTasks() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tasksRepository.listMine();
      setTasks(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // `completion` carries the note/attachment the completion dialog collects.
  // Rethrows so the dialog can keep itself open and show the server's message
  // (e.g. a missing note) instead of closing over a failed save.
  const advance = useCallback(
    async (task: TaskRecord, completion: TaskCompletionInput = {}) => {
      const next = NEXT_STATUS[task.status];
      if (!next) return;
      setUpdatingId(task.id);
      try {
        await tasksRepository.updateStatus(task.id, next, completion);
        await refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to update task";
        setError(message);
        throw new Error(message);
      } finally {
        setUpdatingId(null);
      }
    },
    [refresh],
  );

  const [creating, setCreating] = useState(false);

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<TaskWithWarnings | null> => {
      setCreating(true);
      setError(null);
      try {
        const { data } = await tasksRepository.create(input);
        await refresh();
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create task");
        return null;
      } finally {
        setCreating(false);
      }
    },
    [refresh],
  );

  const counts = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "Pending").length,
    inProgress: tasks.filter((t) => t.status === "In Progress").length,
    completed: tasks.filter((t) => t.status === "Completed").length,
    overdue: tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "Completed",
    ).length,
  };

  return { tasks, counts, loading, error, updatingId, advance, refresh, createTask, creating };
}