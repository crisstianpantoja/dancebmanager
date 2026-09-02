CREATE TABLE "password_reset_requests" (
	"id" text PRIMARY KEY,
	"documento" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT 'student' NOT NULL,
	"user_id" text,
	"nombre" text DEFAULT '' NOT NULL,
	"contacto" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 1 NOT NULL,
	"creado_en" text DEFAULT '' NOT NULL,
	"atendido_por" text,
	"atendido_en" text
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verificacion" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "origen" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "comprobante_fecha" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "revisado_por" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "revisado_en" text;--> statement-breakpoint
-- Los cobros que quedaron con el estado heredado 'en_verificacion' pasan al
-- nuevo modelo: el plan queda activo y la revisión del comprobante pendiente.
UPDATE "payments"
SET "estado" = 'pagado', "verificacion" = 'pendiente', "origen" = 'alumno'
WHERE "estado" = 'en_verificacion';
