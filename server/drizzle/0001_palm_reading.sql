CREATE TABLE "palm_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hand" text NOT NULL,
	"image_path" text NOT NULL,
	"media_type" text NOT NULL,
	"lang" text NOT NULL,
	"quick" jsonb,
	"detailed" jsonb,
	"detailed_price_paise" integer,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "palm_reading_id" uuid;--> statement-breakpoint
ALTER TABLE "palm_readings" ADD CONSTRAINT "palm_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "palm_user_idx" ON "palm_readings" USING btree ("user_id","created_at");