import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/config/features";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export interface Step {
  number: number;
  title: string;
  subtitle?: string;
}

interface MultiStepPageProps {
  title: string;
  description: string;
  steps: Step[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  isLastStep: boolean;
  isFirstStep: boolean;
  submitting?: boolean;
  submitLabel?: string;
  error?: string | null;
  aiHint?: string;
  children: React.ReactNode;
}

export function MultiStepPage({
  title,
  description,
  steps,
  currentStep,
  onNext,
  onBack,
  onCancel,
  onSubmit,
  isLastStep,
  isFirstStep,
  submitting,
  submitLabel = "Create ✓",
  error,
  aiHint,
  children,
}: MultiStepPageProps) {
  return (
    <div className="flex-1 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title={title}
          description={description}
          breadcrumbLabel={title}
          className="mb-5"
        />

        <div className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Left — stepper */}
          <div className="flex w-72 shrink-0 flex-col justify-between border-r border-border bg-muted/20 p-6">
            <div className="space-y-1">
              {steps.map((step, i) => {
                const done = step.number < currentStep;
                const active = step.number === currentStep;
                const upcoming = step.number > currentStep;
                return (
                  <div key={step.number} className="relative">
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-xl px-3 py-3 transition-colors",
                        active && "bg-primary/10",
                        !active && "hover:bg-muted/40",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          done && "bg-primary text-primary-foreground",
                          active &&
                            "bg-primary text-primary-foreground ring-4 ring-primary/20",
                          upcoming &&
                            "border-2 border-border bg-background text-muted-foreground",
                        )}
                      >
                        {done ? "✓" : step.number}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "text-sm font-medium leading-tight",
                            active && "text-foreground",
                            !active && "text-muted-foreground",
                          )}
                        >
                          {step.title}
                        </div>
                        <div className="mt-0.5 text-overline leading-snug text-muted-foreground">
                          {step.subtitle}
                        </div>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={cn(
                          "absolute left-[22px] top-[46px] h-3 w-0.5",
                          done ? "bg-primary" : "bg-border",
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {FEATURES.aiPlaceholders && aiHint && (
              <div className="mt-6 rounded-xl border border-ai/20 bg-ai-soft/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-ai" />
                  <span className="text-xs font-semibold text-ai">
                    Need help?
                  </span>
                </div>
                <p className="text-overline leading-relaxed text-muted-foreground">
                  {aiHint}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3 h-7 w-full rounded-lg text-xs text-ai hover:bg-ai/10"
                >
                  <Sparkles className="mr-1 h-3 w-3" /> Generate with AI
                </Button>
              </div>
            )}
          </div>

          {/* Right — form content */}
          <div className="flex flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-8">
              {error && (
                <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
                  {error}
                </div>
              )}
              {children}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border bg-card px-8 py-5">
              <Button
                variant="ghost"
                onClick={onCancel}
                className="rounded-xl"
                disabled={submitting}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-3">
                {!isFirstStep && (
                  <Button
                    variant="outline"
                    onClick={onBack}
                    className="rounded-xl"
                    disabled={submitting}
                  >
                    Back
                  </Button>
                )}
                {isLastStep ? (
                  <Button
                    onClick={onSubmit}
                    className="rounded-xl px-6"
                    disabled={submitting}
                  >
                    {submitting ? "Creating…" : submitLabel}
                  </Button>
                ) : (
                  <Button onClick={onNext} className="rounded-xl px-6">
                    Next →
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
