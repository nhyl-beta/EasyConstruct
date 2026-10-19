import type {
  AIInsight,
  FinancialRisk,
} from "@/features/finance/types/finance.types";
import { useCallback, useState } from "react";
import { FEATURES } from "@/config/features";

interface UseFinanceAiInsightsResult {
  insights: AIInsight[];
  risks: FinancialRisk[];
  isLoading: boolean;
  error: string | null;
  acknowledge: (id: string) => Promise<void>;
  dismiss: (id: string) => void;
}

// /api/finance/ai-insights and /api/finance/risks are commented out
// server-side (apps/api/src/routes/finance.ts) — this used to fetch them
// anyway and silently swallow the 404s. With FEATURES.aiPlaceholders off,
// this never calls them at all rather than hitting routes that don't exist.
export function useFinanceAiInsightsController(): UseFinanceAiInsightsResult {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [risks, setRisks] = useState<FinancialRisk[]>([]);
  const [isLoading, setIsLoading] = useState(FEATURES.aiPlaceholders);
  const [error, setError] = useState<string | null>(null);

  // Acknowledge is a client-side dismissal for now — add a persisted
  // "acknowledged_at" column on ai_insights if this needs to survive reloads.
  const acknowledge = useCallback(async (id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const dismiss = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { insights, risks, isLoading, error, acknowledge, dismiss };
}
