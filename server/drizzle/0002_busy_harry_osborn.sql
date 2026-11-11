DROP TABLE "couriers";--> statement-breakpoint
DROP TABLE "deliveries";--> statement-breakpoint
DROP TABLE "delivery_statuses";--> statement-breakpoint
DROP TABLE "products";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ad_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "adset_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "adset_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "campaign_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "form_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_organic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;