CREATE TABLE "academies" (
	"id" text PRIMARY KEY,
	"nombre" text DEFAULT '' NOT NULL,
	"clase" text DEFAULT '' NOT NULL,
	"lugar" text DEFAULT '' NOT NULL,
	"contacto" text DEFAULT '' NOT NULL,
	"dias" jsonb DEFAULT '[]',
	"hora" text DEFAULT '' NOT NULL,
	"duracion" integer DEFAULT 60 NOT NULL,
	"pago_monto" double precision DEFAULT 0 NOT NULL,
	"pago_modalidad" text DEFAULT 'Por clase' NOT NULL,
	"color" text DEFAULT '#e91e8c' NOT NULL,
	"notas" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_logs" (
	"key" text PRIMARY KEY,
	"estado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy_payments" (
	"id" text PRIMARY KEY,
	"academy_id" text DEFAULT '' NOT NULL,
	"mes" text DEFAULT '' NOT NULL,
	"monto" double precision DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"metodo_transferencia" text DEFAULT '' NOT NULL,
	"fecha_pago" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY,
	"title" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'clase_regular' NOT NULL,
	"description" text,
	"instructor" text,
	"date" text DEFAULT '' NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"end_time" text DEFAULT '' NOT NULL,
	"level" text,
	"capacity" integer,
	"enrolled_students" jsonb DEFAULT '[]',
	"price" double precision,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY,
	"concepto" text DEFAULT '' NOT NULL,
	"monto" double precision DEFAULT 0 NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"categoria" text DEFAULT '' NOT NULL,
	"notas" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gigs" (
	"id" text PRIMARY KEY,
	"tipo" text DEFAULT 'contrato' NOT NULL,
	"evento" text DEFAULT '' NOT NULL,
	"lugar" text DEFAULT '' NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"hora" text DEFAULT '' NOT NULL,
	"duracion" integer DEFAULT 60 NOT NULL,
	"pago" double precision DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'Cotizado' NOT NULL,
	"contacto" text DEFAULT '' NOT NULL,
	"notas" text DEFAULT '' NOT NULL,
	"acompanado" boolean DEFAULT false,
	"acompanante" text,
	"pago_acompanante" double precision
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY,
	"user_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"type" text DEFAULT 'info' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY,
	"alumno_id" text DEFAULT '' NOT NULL,
	"modalidad" text DEFAULT 'Clase suelta' NOT NULL,
	"concepto" text DEFAULT '' NOT NULL,
	"monto" double precision DEFAULT 0 NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"metodo_pago" text,
	"comprobante_url" text,
	"clases_incluidas" integer DEFAULT 0 NOT NULL,
	"clases_usadas" integer DEFAULT 0 NOT NULL,
	"notas" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY,
	"nombre" text DEFAULT '' NOT NULL,
	"modalidad" text DEFAULT 'Clase suelta' NOT NULL,
	"monto" double precision DEFAULT 0 NOT NULL,
	"clases_incluidas" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"profesor_id" text,
	"titulo" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT 'privada' NOT NULL,
	"estado" text,
	"plan_id" text,
	"fecha" text DEFAULT '' NOT NULL,
	"hora" text DEFAULT '' NOT NULL,
	"duracion" integer DEFAULT 60 NOT NULL,
	"lugar" text DEFAULT '' NOT NULL,
	"alumno_ids" jsonb DEFAULT '[]',
	"notas" text DEFAULT '' NOT NULL,
	"valor" double precision,
	"asistencia" jsonb DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"show_login_logo" boolean DEFAULT false,
	"login_logo_url" text,
	"login_background_url" text,
	"sidebar_logo_url" text,
	"student_portal_logo_url" text,
	"digital_card_logo_url" text,
	"primary_color" text,
	"bg_color" text,
	"surface_color" text,
	"text_color" text,
	"brand_name" text
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY,
	"nombre" text DEFAULT '' NOT NULL,
	"contacto" text DEFAULT '' NOT NULL,
	"documento" text,
	"password" text,
	"activo" boolean DEFAULT true,
	"foto" text,
	"tipo" text DEFAULT 'ambas' NOT NULL,
	"nivel" text DEFAULT 'Principiante' NOT NULL,
	"rol" text DEFAULT 'alumno' NOT NULL,
	"card_theme" text,
	"fecha_ingreso" text DEFAULT '' NOT NULL,
	"notas" text DEFAULT '' NOT NULL,
	"competencias" jsonb DEFAULT '{}',
	"historial" jsonb DEFAULT '[]',
	"creado_por" text
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" text PRIMARY KEY,
	"nombre" text DEFAULT '' NOT NULL,
	"especialidad" text DEFAULT '' NOT NULL,
	"contacto" text DEFAULT '' NOT NULL,
	"documento" text,
	"password" text,
	"activo" boolean DEFAULT true,
	"foto" text,
	"color" text DEFAULT '#e91e8c' NOT NULL,
	"pagos" jsonb DEFAULT '[]',
	"planes" jsonb DEFAULT '[]'
);
