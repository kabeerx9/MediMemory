CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"diagnosis" text,
	"current_status_summary" text,
	"current_medications" text,
	"current_symptoms" text,
	"recent_changes" text,
	"latest_reports" text,
	"upcoming_appointments" text,
	"open_questions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"dose" text,
	"status" text DEFAULT 'current' NOT NULL,
	"start_date" text,
	"stop_date" text,
	"reason_started" text,
	"reason_stopped" text,
	"side_effects" text,
	"notes" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_proposal_items" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"target_type" text NOT NULL,
	"operation" text DEFAULT 'create' NOT NULL,
	"payload" jsonb NOT NULL,
	"source_excerpt" text,
	"confidence" text,
	"included" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"should_save" boolean DEFAULT true NOT NULL,
	"proposal_type" text NOT NULL,
	"proposed_date" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"missing_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doctor_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_status_patch" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"filename" text NOT NULL,
	"report_type" text,
	"report_date" text,
	"text_content" text NOT NULL,
	"summary" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptoms" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" text,
	"severity" text,
	"pattern" text,
	"possible_trigger" text,
	"related_medication" text,
	"notes" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entry_date" text NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_questions" ADD CONSTRAINT "doctor_questions_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_sources" ADD CONSTRAINT "health_sources_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_workspaces" ADD CONSTRAINT "health_workspaces_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_proposal_items" ADD CONSTRAINT "memory_proposal_items_proposal_id_memory_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."memory_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_proposals" ADD CONSTRAINT "memory_proposals_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_proposals" ADD CONSTRAINT "memory_proposals_source_id_health_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."health_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_files" ADD CONSTRAINT "report_files_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_workspace_id_health_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."health_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "chat_messages_workspace_idx" ON "chat_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_workspace_idx" ON "chat_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "doctor_questions_workspace_idx" ON "doctor_questions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "health_sources_workspace_idx" ON "health_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "health_workspaces_owner_idx" ON "health_workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "medications_workspace_idx" ON "medications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "memory_proposal_items_proposal_idx" ON "memory_proposal_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "memory_proposals_workspace_idx" ON "memory_proposals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "report_files_workspace_idx" ON "report_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "symptoms_workspace_idx" ON "symptoms" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "timeline_entries_workspace_idx" ON "timeline_entries" USING btree ("workspace_id");