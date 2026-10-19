ALTER TABLE "employees" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "file_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;