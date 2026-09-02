CREATE TABLE "auth_config" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"secret" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;