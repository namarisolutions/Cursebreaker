CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"error" text,
	"sent_by" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_sent_by_admins_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_sent_idx" ON "invites" USING btree ("sent_at");