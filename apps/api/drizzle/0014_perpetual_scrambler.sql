CREATE TABLE "project_engineers" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_code" varchar(50) NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"added_by" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "project_engineers_project_user_unique" UNIQUE("project_code","user_id")
);
--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "assigned_engineer_id" integer;--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "assigned_engineer_name" varchar(100);--> statement-breakpoint
ALTER TABLE "project_engineers" ADD CONSTRAINT "project_engineers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_assigned_engineer_id_users_id_fk" FOREIGN KEY ("assigned_engineer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;