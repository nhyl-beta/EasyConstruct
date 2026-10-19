// types/design-review.types.ts
export interface DesignReview {
  id: number;
  code: string;
  designId: number;
  discipline: string | null;
  priority: string;
  reviewers: string | null;
  requestedBy: string;
  status: string;
  submittedAt: string | null;
  dueDate: string | null;
  completedAt: string | null;
}