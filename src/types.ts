export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  fecha: string;
  read: boolean;
  type: 'info' | 'warning' | 'success';
}

export interface StudentCompetencies {
  ritmo: number;
  movimiento: number;
  imagen: number;
  conexion: number;
}

export interface StudentEvaluation extends StudentCompetencies {
  fecha: string;
  nota: string;
}

export interface Student {
  id: string;
  nombre: string;
  contacto: string;
  documento?: string;
  activo?: boolean;
  /** true mientras la persona tenga una contraseña temporal sin cambiar. */
  mustChangePassword?: boolean;
  foto?: string;
  tipo: 'academia' | 'privada' | 'ambas';
  nivel: 'Principiante' | 'Intermedio' | 'Avanzado';
  rol: 'alumno' | 'administrador' | 'profesor';
  cardTheme?: 'magenta' | 'purple' | 'cyan' | 'amber';
  /** Academia a la que pertenece; alimenta su calendario de clases. */
  academiaId?: string;
  fechaIngreso: string;
  notas: string;
  competencias: StudentCompetencies;
  historial: StudentEvaluation[];
  creadoPor?: string;
}

export interface TeacherPayment { id: string; fecha: string; monto: number; concepto: string; }

export interface Teacher {
  id: string;
  nombre: string;
  especialidad: string;
  contacto: string;
  documento?: string;
  activo?: boolean;
  /** true mientras la persona tenga una contraseña temporal sin cambiar. */
  mustChangePassword?: boolean;
  foto?: string;
  color: string;
  pagos?: TeacherPayment[];
  planes?: PlanTemplate[];
}

export interface Session {
  profesorId?: string;
  id: string;
  titulo: string;
  tipo: 'academia' | 'privada';
  estado?: 'pendiente' | 'confirmada' | 'cancelada';
  planId?: string;
  /** Academia a la que pertenece la clase, cuando `tipo` es 'academia'. */
  academiaId?: string;
  /** Nivel o tipo especial, para el calendario del alumno. */
  categoria?: ClaseCategoria;
  fecha: string; // YYYY-MM-DD
  hora: string;
  duracion: number;
  lugar: string;
  alumnoIds: string[];
  notas: string;
  valor?: number;
  asistencia: Record<string, 'presente' | 'ausente' | 'justificado'>;
}

/**
 * Estado de la revisión del comprobante que subió el alumno. El plan se activa
 * en el momento de subirlo, así que 'pendiente' significa «activo, pero el
 * administrador todavía no ha confirmado el dinero».
 */
export type PagoVerificacion = 'pendiente' | 'aprobado' | 'rechazado';

/** Quién generó el cobro. */
export type PagoOrigen = 'admin' | 'alumno' | 'profesor';

/** Forma en que el alumno dice haber pagado. */
export type PagoMetodo = 'tarjeta' | 'pse' | 'transferencia';

export interface Payment {
  id: string;
  alumnoId: string;
  /** Plantilla de la que salió, cuando se asignó desde un plan. */
  planId?: string;
  modalidad: 'Paquete de clases' | 'Mensualidad' | 'Clase suelta' | 'Matrícula';
  /** Copiado del plan: distingue la mensualidad ilimitada de la que tiene tope. */
  tipoMensualidad?: TipoMensualidad;
  /** Se fija al cobrar (fecha + vigenciaMeses). Sin valor = sin vencimiento. */
  fechaVencimiento?: string;
  concepto: string;
  monto: number;
  fecha: string;
  /** Sólo un cobro 'pagado' activa el plan del alumno. */
  estado: 'pagado' | 'pendiente';
  metodoPago?: PagoMetodo;
  comprobanteUrl?: string;
  /** Sin valor en los cobros del administrador, que no pasan por revisión. */
  verificacion?: PagoVerificacion;
  origen?: PagoOrigen;
  /** Momento en que se subió el comprobante (ISO). */
  comprobanteFecha?: string;
  /** id de quien revisó el comprobante. */
  revisadoPor?: string;
  revisadoEn?: string;
  clasesIncluidas: number;
  clasesUsadas: number;
  notas: string;
}

/**
 * Solicitud de restablecimiento hecha desde el inicio de sesión. No cambia
 * ninguna credencial por sí sola: el administrador la atiende generando una
 * contraseña temporal.
 */
export interface PasswordResetRequest {
  id: string;
  documento: string;
  scope: 'student' | 'teacher';
  userId?: string;
  nombre: string;
  contacto: string;
  estado: 'pendiente' | 'atendida' | 'descartada';
  intentos: number;
  creadoEn: string;
  atendidoPor?: string;
  atendidoEn?: string;
}

export interface Academy {
  id: string;
  nombre: string;
  clase: string;
  /** Nivel de la clase regular, para etiquetar el calendario del alumno. */
  nivel?: 'Básica' | 'Intermedia' | 'Avanzada';
  lugar: string;
  contacto: string;
  dias: number[]; // 0=Dom ... 6=Sab
  hora: string;
  duracion: number;
  pagoMonto: number;
  pagoModalidad: 'Por clase' | 'Mensual fijo';
  color: string;
  notas: string;
}

export type PlanModalidad = 'Paquete de clases' | 'Mensualidad' | 'Clase suelta' | 'Matrícula';

/**
 * Una mensualidad puede ser de acceso libre o tener tope de clases. El resto de
 * las modalidades no usan este campo.
 */
export type TipoMensualidad = 'ilimitada' | 'con_tope';

export interface PlanTemplate {
  id: string;
  nombre: string;
  modalidad: PlanModalidad;
  /** Sólo para 'Mensualidad'. */
  tipoMensualidad?: TipoMensualidad;
  monto: number;
  /** Cupo de clases. 0 en los planes que no lo usan; 1 en 'Clase suelta'. */
  clasesIncluidas: number;
  /** Meses que el plan permanece vigente desde la fecha de pago. */
  vigenciaMeses?: number;
}

/**
 * Nivel de una clase regular, o tipo especial de una clase del calendario.
 * 'Privada' no aparece en la agenda de grupo: la usan las clases uno a uno,
 * que se registran a mano en el momento en que ocurren.
 */
export type ClaseCategoria = 'Básica' | 'Intermedia' | 'Avanzada' | 'Privada' | 'Evento' | 'Taller';

export interface Expense {
  id: string;
  concepto: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  categoria: string;
  notas: string;
}

export interface AcademyPayment {
  id: string;
  academyId: string;
  mes: string; // YYYY-MM
  monto: number;
  estado: 'pendiente' | 'pagado';
  metodoTransferencia: string; // Nequi, Daviplata, etc.
  fechaPago?: string;
}

export interface Gig {
  id: string;
  tipo: 'dj' | 'tallerista' | 'contrato';
  evento: string;
  lugar: string;
  fecha: string;
  hora: string;
  duracion: number;
  pago: number;
  estado: 'Cotizado' | 'Confirmado' | 'Pagado';
  contacto: string;
  notas: string;
  // Solo tallerista
  acompanado?: boolean;
  acompanante?: string;
  pagoAcompanante?: number;
}

export interface DanceEvent {
  id: string;
  title: string;
  type: 'clase_regular' | 'evento_especial' | 'taller';
  description?: string;
  instructor?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  level?: string; 
  capacity?: number;
  enrolledStudents: string[];
  price?: number;
  imageUrl?: string;
}

/** De dónde salió el registro de asistencia. */
export type AsistenciaOrigen = 'qr' | 'manual';

/**
 * Cómo quedó el cobro de la clase contra el plan del alumno.
 *  - 'cupo'      : se descontó una clase de un plan con tope.
 *  - 'ilimitada' : mensualidad de acceso libre vigente; no descuenta.
 *  - 'sin_cupo'  : el plan está vigente pero agotado.
 *  - 'vencido'   : el plan existe pero su vigencia terminó.
 *  - 'sin_plan'  : no hay ningún plan al que cobrarla.
 * Los tres últimos quedan pendientes de cobrar aparte.
 */
export type AsistenciaEstadoPlan = 'cupo' | 'ilimitada' | 'sin_cupo' | 'vencido' | 'sin_plan';

/**
 * De dónde sale la clase a la que se liga una asistencia. Las tres primeras
 * vienen de la agenda; 'manual' es la clase que el administrador registra en el
 * momento —una privada, o una de academia que no estaba programada— y que por
 * tanto no tiene ninguna fila de la agenda detrás.
 */
export type ClaseOrigenTipo = 'academia' | 'sesion' | 'evento' | 'manual';

/**
 * Registro de una clase tomada. Sólo el administrador los crea y los anula, y
 * únicamente a través de `/api/asistencia`: nunca se escriben desde el cliente.
 */
export interface AttendanceRecord {
  id: string;
  alumnoId: string;
  /** Identidad de la clase programada. Ver `claseKey()` en src/lib/planes.ts. */
  claseKey: string;
  claseTipo: ClaseOrigenTipo;
  titulo: string;
  academiaId?: string;
  sessionId?: string;
  eventId?: string;
  fecha: string; // YYYY-MM-DD
  hora: string;  // HH:mm
  categoria?: ClaseCategoria;
  origen: AsistenciaOrigen;
  /** id del administrador que lo registró. */
  registradoPor: string;
  /** Pago/plan al que se cobró la clase, si hubo alguno. */
  paymentId?: string;
  planConcepto?: string;
  estadoPlan: AsistenciaEstadoPlan;
  /** true cuando descontó una clase del cupo, y por tanto al anular la devuelve. */
  consumioCupo: boolean;
  notas?: string;
  anulado: boolean;
  anuladoPor?: string;
  anuladoEn?: string;
  creadoEn: string;
}

export interface AppSettings {
  showLoginLogo?: boolean;
  loginLogoUrl?: string;
  loginBackgroundUrl?: string;
  sidebarLogoUrl?: string;
  studentPortalLogoUrl?: string;
  teacherPortalLogoUrl?: string;
  
  digitalCardLogoUrl?: string;
  
  // Customization
  primaryColor?: string;
  bgColor?: string;
  surfaceColor?: string;
  textColor?: string;
  brandName?: string;
}
