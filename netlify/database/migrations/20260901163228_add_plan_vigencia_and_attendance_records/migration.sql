CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY,
	"alumno_id" text DEFAULT '' NOT NULL,
	"clase_key" text DEFAULT '' NOT NULL,
	"clase_tipo" text DEFAULT 'academia' NOT NULL,
	"titulo" text DEFAULT '' NOT NULL,
	"academia_id" text,
	"session_id" text,
	"event_id" text,
	"fecha" text DEFAULT '' NOT NULL,
	"hora" text DEFAULT '' NOT NULL,
	"categoria" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"registrado_por" text DEFAULT '' NOT NULL,
	"payment_id" text,
	"plan_concepto" text,
	"estado_plan" text DEFAULT 'sin_plan' NOT NULL,
	"consumio_cupo" boolean DEFAULT false NOT NULL,
	"notas" text DEFAULT '' NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_por" text,
	"anulado_en" text,
	"creado_en" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "nivel" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tipo_mensualidad" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fecha_vencimiento" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "tipo_mensualidad" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "vigencia_meses" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "academia_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "categoria" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "academia_id" text;