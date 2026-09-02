import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  doublePrecision,
} from 'drizzle-orm/pg-core';

/**
 * Una tabla por colección de `AppData` (ver src/store.tsx).
 * Los ids son los mismos strings cortos que genera `generateId()` en el cliente,
 * así que se conservan tal cual en lugar de usar `serial`.
 * Las estructuras anidadas (competencias, asistencia, historial…) van en jsonb.
 */

export const teachers = pgTable('teachers', {
  id: text().primaryKey(),
  nombre: text().notNull().default(''),
  especialidad: text().notNull().default(''),
  contacto: text().notNull().default(''),
  documento: text(),
  /**
   * Columna heredada con contraseñas en texto plano. Ya no se escribe: al leer
   * se convierte a `passwordHash` y se deja en null (ver db/auth.ts).
   */
  password: text(),
  /** Hash bcrypt. Nunca sale de la base de datos hacia el cliente. */
  passwordHash: text('password_hash'),
  /** Obliga a definir una contraseña nueva en el siguiente inicio de sesión. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  activo: boolean().default(true),
  foto: text(),
  color: text().notNull().default('#e91e8c'),
  pagos: jsonb().$type<unknown[]>().default([]),
  planes: jsonb().$type<unknown[]>().default([]),
});

export const students = pgTable('students', {
  id: text().primaryKey(),
  nombre: text().notNull().default(''),
  contacto: text().notNull().default(''),
  documento: text(),
  /**
   * Columna heredada con contraseñas en texto plano. Ya no se escribe: al leer
   * se convierte a `passwordHash` y se deja en null (ver db/auth.ts).
   */
  password: text(),
  /** Hash bcrypt. Nunca sale de la base de datos hacia el cliente. */
  passwordHash: text('password_hash'),
  /** Obliga a definir una contraseña nueva en el siguiente inicio de sesión. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  activo: boolean().default(true),
  foto: text(),
  tipo: text().notNull().default('ambas'),
  nivel: text().notNull().default('Principiante'),
  rol: text().notNull().default('alumno'),
  cardTheme: text('card_theme'),
  academiaId: text('academia_id'),
  fechaIngreso: text('fecha_ingreso').notNull().default(''),
  notas: text().notNull().default(''),
  competencias: jsonb().$type<Record<string, number>>().default({}),
  historial: jsonb().$type<unknown[]>().default([]),
  creadoPor: text('creado_por'),
});

export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  profesorId: text('profesor_id'),
  titulo: text().notNull().default(''),
  tipo: text().notNull().default('privada'),
  estado: text(),
  planId: text('plan_id'),
  academiaId: text('academia_id'),
  categoria: text(),
  fecha: text().notNull().default(''),
  hora: text().notNull().default(''),
  duracion: integer().notNull().default(60),
  lugar: text().notNull().default(''),
  alumnoIds: jsonb('alumno_ids').$type<string[]>().default([]),
  notas: text().notNull().default(''),
  valor: doublePrecision(),
  asistencia: jsonb().$type<Record<string, string>>().default({}),
});

export const payments = pgTable('payments', {
  id: text().primaryKey(),
  alumnoId: text('alumno_id').notNull().default(''),
  /** Plantilla de la que salió el cobro, cuando se asignó desde un plan. */
  planId: text('plan_id'),
  modalidad: text().notNull().default('Clase suelta'),
  /** 'ilimitada' | 'con_tope'. Sólo aplica a las mensualidades. */
  tipoMensualidad: text('tipo_mensualidad'),
  /** Última fecha en que el plan sirve. Null = sin vencimiento. */
  fechaVencimiento: text('fecha_vencimiento'),
  concepto: text().notNull().default(''),
  monto: doublePrecision().notNull().default(0),
  fecha: text().notNull().default(''),
  /** 'pagado' | 'pendiente'. Un plan sólo está activo si está pagado. */
  estado: text().notNull().default('pendiente'),
  metodoPago: text('metodo_pago'),
  comprobanteUrl: text('comprobante_url'),
  /**
   * Estado de la revisión del comprobante que subió el alumno:
   * 'pendiente' | 'aprobado' | 'rechazado'. Null en los cobros que registra
   * el administrador, que no pasan por revisión.
   */
  verificacion: text(),
  /** Quién generó el cobro: 'admin' | 'alumno' | 'profesor'. */
  origen: text().notNull().default('admin'),
  /** Momento en que se subió el comprobante (ISO). */
  comprobanteFecha: text('comprobante_fecha'),
  revisadoPor: text('revisado_por'),
  revisadoEn: text('revisado_en'),
  clasesIncluidas: integer('clases_incluidas').notNull().default(0),
  clasesUsadas: integer('clases_usadas').notNull().default(0),
  notas: text().notNull().default(''),
});

export const academies = pgTable('academies', {
  id: text().primaryKey(),
  nombre: text().notNull().default(''),
  clase: text().notNull().default(''),
  /** 'Básica' | 'Intermedia' | 'Avanzada'. Etiqueta la clase regular. */
  nivel: text(),
  lugar: text().notNull().default(''),
  contacto: text().notNull().default(''),
  dias: jsonb().$type<number[]>().default([]),
  hora: text().notNull().default(''),
  duracion: integer().notNull().default(60),
  pagoMonto: doublePrecision('pago_monto').notNull().default(0),
  pagoModalidad: text('pago_modalidad').notNull().default('Por clase'),
  color: text().notNull().default('#e91e8c'),
  notas: text().notNull().default(''),
});

export const academyPayments = pgTable('academy_payments', {
  id: text().primaryKey(),
  academyId: text('academy_id').notNull().default(''),
  mes: text().notNull().default(''),
  monto: doublePrecision().notNull().default(0),
  estado: text().notNull().default('pendiente'),
  metodoTransferencia: text('metodo_transferencia').notNull().default(''),
  fechaPago: text('fecha_pago'),
});

/** `academyLogs` es un Record<string, 'dictada' | 'cancelada'> en el cliente. */
export const academyLogs = pgTable('academy_logs', {
  key: text().primaryKey(),
  estado: text().notNull(),
});

export const plans = pgTable('plans', {
  id: text().primaryKey(),
  nombre: text().notNull().default(''),
  modalidad: text().notNull().default('Clase suelta'),
  /** 'ilimitada' | 'con_tope'. Sólo aplica a las mensualidades. */
  tipoMensualidad: text('tipo_mensualidad'),
  monto: doublePrecision().notNull().default(0),
  clasesIncluidas: integer('clases_incluidas').notNull().default(0),
  /** Meses de vigencia desde la fecha de pago. */
  vigenciaMeses: integer('vigencia_meses'),
});

export const expenses = pgTable('expenses', {
  id: text().primaryKey(),
  concepto: text().notNull().default(''),
  monto: doublePrecision().notNull().default(0),
  fecha: text().notNull().default(''),
  categoria: text().notNull().default(''),
  notas: text().notNull().default(''),
});

export const gigs = pgTable('gigs', {
  id: text().primaryKey(),
  tipo: text().notNull().default('contrato'),
  evento: text().notNull().default(''),
  lugar: text().notNull().default(''),
  fecha: text().notNull().default(''),
  hora: text().notNull().default(''),
  duracion: integer().notNull().default(60),
  pago: doublePrecision().notNull().default(0),
  estado: text().notNull().default('Cotizado'),
  contacto: text().notNull().default(''),
  notas: text().notNull().default(''),
  acompanado: boolean().default(false),
  acompanante: text(),
  pagoAcompanante: doublePrecision('pago_acompanante'),
});

export const notifications = pgTable('notifications', {
  id: text().primaryKey(),
  userId: text('user_id').notNull().default(''),
  title: text().notNull().default(''),
  message: text().notNull().default(''),
  fecha: text().notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  type: text().notNull().default('info'),
});

export const events = pgTable('events', {
  id: text().primaryKey(),
  title: text().notNull().default(''),
  type: text().notNull().default('clase_regular'),
  description: text(),
  instructor: text(),
  date: text().notNull().default(''),
  startTime: text('start_time').notNull().default(''),
  endTime: text('end_time').notNull().default(''),
  level: text(),
  capacity: integer(),
  enrolledStudents: jsonb('enrolled_students').$type<string[]>().default([]),
  price: doublePrecision(),
  imageUrl: text('image_url'),
});

/**
 * Clases tomadas. Sólo el administrador las crea y las anula, y únicamente a
 * través de `/api/attendance`: esta tabla no se escribe nunca desde `/api/data`
 * (ver SERVER_ONLY_COLLECTIONS en db/api.ts).
 *
 * Anular no borra la fila: la marca y devuelve el crédito al plan, de modo que
 * el historial de lo ocurrido se conserva completo.
 */
export const attendanceRecords = pgTable('attendance_records', {
  id: text().primaryKey(),
  alumnoId: text('alumno_id').notNull().default(''),
  /** Identidad de la clase programada, para detectar el doble escaneo. */
  claseKey: text('clase_key').notNull().default(''),
  claseTipo: text('clase_tipo').notNull().default('academia'),
  titulo: text().notNull().default(''),
  academiaId: text('academia_id'),
  sessionId: text('session_id'),
  eventId: text('event_id'),
  /** Clase de la programación recurrente, cuando la asistencia salió de ahí. */
  claseId: text('clase_id'),
  fecha: text().notNull().default(''),
  hora: text().notNull().default(''),
  categoria: text(),
  origen: text().notNull().default('manual'),
  registradoPor: text('registrado_por').notNull().default(''),
  /** Pago al que se cobró la clase, si hubo alguno con saldo vigente. */
  paymentId: text('payment_id'),
  planConcepto: text('plan_concepto'),
  estadoPlan: text('estado_plan').notNull().default('sin_plan'),
  consumioCupo: boolean('consumio_cupo').notNull().default(false),
  notas: text().notNull().default(''),
  anulado: boolean().notNull().default(false),
  anuladoPor: text('anulado_por'),
  anuladoEn: text('anulado_en'),
  creadoEn: text('creado_en').notNull().default(''),
});

/** Fila única (id = 1) con los ajustes globales de la app. */
export const settings = pgTable('settings', {
  id: integer().primaryKey().default(1),
  showLoginLogo: boolean('show_login_logo').default(false),
  loginLogoUrl: text('login_logo_url'),
  loginBackgroundUrl: text('login_background_url'),
  sidebarLogoUrl: text('sidebar_logo_url'),
  studentPortalLogoUrl: text('student_portal_logo_url'),
  teacherPortalLogoUrl: text('teacher_portal_logo_url'),
  digitalCardLogoUrl: text('digital_card_logo_url'),
  primaryColor: text('primary_color'),
  bgColor: text('bg_color'),
  surfaceColor: text('surface_color'),
  textColor: text('text_color'),
  brandName: text('brand_name'),
});

/**
 * Solicitudes de restablecimiento de contraseña hechas desde la pantalla de
 * inicio de sesión.
 *
 * Nunca salen por `/api/data`: contienen documento y contacto de la persona, y
 * sólo el administrador las consulta, a través de `/api/auth`. Crear una
 * solicitud no cambia ninguna credencial: la contraseña temporal la genera el
 * administrador al atenderla.
 */
export const passwordResetRequests = pgTable('password_reset_requests', {
  id: text().primaryKey(),
  /** Documento con el que la persona intenta entrar. */
  documento: text().notNull().default(''),
  /** 'student' | 'teacher': la tabla donde vive la cuenta. */
  scope: text().notNull().default('student'),
  userId: text('user_id'),
  nombre: text().notNull().default(''),
  contacto: text().notNull().default(''),
  /** 'pendiente' | 'atendida' | 'descartada'. */
  estado: text().notNull().default('pendiente'),
  /** Veces que se pidió mientras la solicitud seguía pendiente. */
  intentos: integer().notNull().default(1),
  creadoEn: text('creado_en').notNull().default(''),
  atendidoPor: text('atendido_por'),
  atendidoEn: text('atendido_en'),
});

/**
 * Fila única (id = 1) con el secreto con el que se firman los tokens de sesión.
 * Va en su propia tabla porque `settings` se reemplaza por completo en cada
 * guardado del cliente, y el secreto no debe viajar nunca al navegador.
 */
export const authConfig = pgTable('auth_config', {
  id: integer().primaryKey().default(1),
  secret: text().notNull(),
});

/**
 * Programación recurrente de clases.
 *
 * Una serie guarda **la regla** (día de la semana, hora, frecuencia y el rango
 * de fechas en que está activa); las clases concretas se materializan en
 * `class_occurrences`, una fila por fecha. Se generan al guardar la serie en
 * lugar de derivarse al leer, que es lo que hacen las clases de `academies`,
 * porque una fecha suelta tiene que poder cambiar de hora, de salón o quedar
 * cancelada sin arrastrar a las demás.
 *
 * Sólo el administrador las escribe, y únicamente a través de `/api/clases`:
 * ninguna de las dos tablas está en LIST_COLLECTIONS (ver db/mapping.ts), así
 * que un guardado del cliente no las alcanza ni enviándolas en el payload.
 */
export const classSeries = pgTable('class_series', {
  id: text().primaryKey(),
  nombre: text().notNull().default(''),
  /** 'Básico' | 'Intermedio' | 'Avanzado' | 'Grupo' | texto libre. */
  nivel: text().notNull().default('Básico'),
  profesorIds: jsonb('profesor_ids').$type<string[]>().default([]),
  /** 0=Dom … 6=Sáb. Una serie puede repetirse en más de un día. */
  diasSemana: jsonb('dias_semana').$type<number[]>().default([]),
  horaInicio: text('hora_inicio').notNull().default(''),
  horaFin: text('hora_fin').notNull().default(''),
  duracion: integer().notNull().default(60),
  sede: text().notNull().default(''),
  salon: text().notNull().default(''),
  /** 0 = sin límite de alumnos. */
  cupoMaximo: integer('cupo_maximo').notNull().default(0),
  fechaInicio: text('fecha_inicio').notNull().default(''),
  fechaFin: text('fecha_fin').notNull().default(''),
  /** 'semanal' | 'cada_2_semanas' | 'personalizada'. */
  frecuencia: text().notNull().default('semanal'),
  /** Semanas entre repeticiones. Sólo se consulta en 'personalizada'. */
  intervaloSemanas: integer('intervalo_semanas').notNull().default(1),
  academiaId: text('academia_id'),
  /** Alumnos matriculados en la serie; cada clase nueva los hereda. */
  alumnoIds: jsonb('alumno_ids').$type<string[]>().default([]),
  color: text().notNull().default('#F72585'),
  notas: text().notNull().default(''),
  /** 'activa' | 'cancelada'. */
  estado: text().notNull().default('activa'),
  /** Serie de la que se desprendió al cortar con «esta clase y las siguientes». */
  serieOrigenId: text('serie_origen_id'),
  creadoEn: text('creado_en').notNull().default(''),
});

/**
 * Una clase concreta del calendario. `serieId` en null es una clase única.
 *
 * Los datos van copiados de la serie en lugar de leerse a través de ella: así
 * una excepción (`esExcepcion`) es simplemente una fila con valores distintos,
 * y el calendario se pinta sin resolver herencia.
 *
 * `estado` sólo guarda 'programada' o 'cancelada'. «En curso» y «Finalizada»
 * se derivan de la fecha y la hora al mostrarlas (ver `estadoDeClase()` en
 * src/lib/recurrencia.ts), para que no dependan de que algo corra a diario.
 */
export const classOccurrences = pgTable('class_occurrences', {
  id: text().primaryKey(),
  /** null en una clase única, sin recurrencia detrás. */
  serieId: text('serie_id'),
  fecha: text().notNull().default(''),
  horaInicio: text('hora_inicio').notNull().default(''),
  horaFin: text('hora_fin').notNull().default(''),
  duracion: integer().notNull().default(60),
  nombre: text().notNull().default(''),
  nivel: text().notNull().default('Básico'),
  profesorIds: jsonb('profesor_ids').$type<string[]>().default([]),
  sede: text().notNull().default(''),
  salon: text().notNull().default(''),
  cupoMaximo: integer('cupo_maximo').notNull().default(0),
  alumnoIds: jsonb('alumno_ids').$type<string[]>().default([]),
  academiaId: text('academia_id'),
  notas: text().notNull().default(''),
  /** 'programada' | 'cancelada'. */
  estado: text().notNull().default('programada'),
  /** true cuando esta fecha se editó aparte: una edición de la serie no la pisa. */
  esExcepcion: boolean('es_excepcion').notNull().default(false),
  motivoCancelacion: text('motivo_cancelacion'),
  canceladaEn: text('cancelada_en'),
  canceladaPor: text('cancelada_por'),
  creadoEn: text('creado_en').notNull().default(''),
});
