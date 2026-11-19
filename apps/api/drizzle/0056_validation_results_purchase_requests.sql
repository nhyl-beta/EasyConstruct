-- Let validation_results carry a Purchase Request's line items too, not only a workflow's.
-- Procurement spend (Purchase Requests) gets the same decision-support cost check that
-- Budget Change Request / Change Order Request already get: each line is matched against
-- reference_snapshots (EstimationPro.ai) and a verdict/variance is recorded.
-- ADDITIVE ONLY: workflow_id's NOT NULL is relaxed (not dropped) and one nullable column is
-- added. A guard constraint keeps every row pointed at exactly one parent. Safe to run twice.
ALTER TABLE "validation_results" ALTER COLUMN "workflow_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "validation_results" ADD COLUMN IF NOT EXISTS "purchase_request_id" varchar(32);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validation_results_purchase_request_id_fk') THEN
    ALTER TABLE "validation_results"
      ADD CONSTRAINT "validation_results_purchase_request_id_fk"
      FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validation_results_one_parent_chk') THEN
    ALTER TABLE "validation_results"
      ADD CONSTRAINT "validation_results_one_parent_chk"
      CHECK (("workflow_id" IS NOT NULL) <> ("purchase_request_id" IS NOT NULL));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "validation_results_purchase_request_idx" ON "validation_results" ("purchase_request_id");
