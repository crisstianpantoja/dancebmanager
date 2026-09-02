import type { AppData } from '../store';
import type {
  AttendanceRecord,
  ClaseCategoria,
  ClaseOrigenTipo,
  PasswordResetRequest,
  Payment,
} from '../types';

const DATA_ENDPOINT = '/api/data';
const AUTH_ENDPOINT = '/api/auth';
const ATTENDANCE_ENDPOINT = '/api/asistencia';
const PAGOS_ENDPOINT = '/api/pagos';

export interface LoadResult {
  data: Partial<AppData>;
  /** true cuando la base de datos no tiene ningún registro todavía. */
  empty: boolean;
  /** false cuando la respuesta sólo trae los ajustes públicos. */
  authenticated: boolean;
}

/** Error de la API con el código HTTP, para distinguir un 401 de una caída. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Token de sesión en memoria. El store lo persiste; aquí sólo se guarda la
 * copia que acompaña a cada petición.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { ...extra };
  if (authToken) out.Authorization = `Bearer ${authToken}`;
  return out;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    /* la respuesta no era JSON */
  }
  return `HTTP ${response.status}`;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return (await response.json()) as T;
}

/**
 * Lee el estado de la aplicación. Con sesión válida llega todo; sin ella, sólo
 * los ajustes visuales que necesita la pantalla de inicio de sesión.
 */
export async function fetchAppData(): Promise<LoadResult> {
  return request<LoadResult>(DATA_ENDPOINT, {
    method: 'GET',
    headers: headers({ Accept: 'application/json' }),
    cache: 'no-store',
  });
}

/**
 * Guarda las colecciones indicadas. Cada colección enviada reemplaza por
 * completo a la almacenada. Las contraseñas se ignoran: el servidor conserva
 * las suyas.
 */
export async function saveAppData(patch: Partial<AppData>): Promise<void> {
  await request<unknown>(DATA_ENDPOINT, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
}

// ---------------------------------------------------------------------------
// Credenciales
// ---------------------------------------------------------------------------

export type AuthScope = 'student' | 'teacher';
export type AppRole = 'alumno' | 'administrador' | 'profesor';

export interface SessionUser {
  id: string;
  nombre: string;
  rol: AppRole;
  scope: AuthScope;
  mustChangePassword: boolean;
}

function authRequest<T>(payload: Record<string, unknown>): Promise<T> {
  return request<T>(AUTH_ENDPOINT, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function apiLogin(documento: string, password: string, rol: AppRole) {
  return authRequest<{ token: string; user: SessionUser }>({ action: 'login', documento, password, rol });
}

export function apiChangePassword(input: { currentPassword?: string; newPassword: string }) {
  return authRequest<{ ok: true }>({ action: 'change-password', ...input });
}

/** Devuelve la contraseña temporal generada. Es la única vez que se ve. */
export function apiResetPassword(userId: string, scope: AuthScope = 'student') {
  return authRequest<{ tempPassword: string; nombre: string; documento: string }>({
    action: 'reset-password',
    userId,
    scope,
  });
}

/**
 * Solicita un restablecimiento desde el inicio de sesión, sin sesión abierta.
 * La respuesta es la misma exista o no la cuenta, para que esta pantalla no
 * sirva para averiguar qué documentos están registrados.
 */
export function apiRequestPasswordReset(documento: string, rol: AppRole = 'alumno') {
  return authRequest<{ ok: true; message: string }>({ action: 'request-reset', documento, rol });
}

/** Solicitudes sin atender. Sólo responde a un administrador. */
export function apiListResetRequests() {
  return authRequest<{ requests: PasswordResetRequest[] }>({ action: 'list-reset-requests' });
}

/** Atiende una solicitud: devuelve la contraseña temporal una única vez. */
export function apiResolveResetRequest(requestId: string) {
  return authRequest<{ tempPassword: string; nombre: string; documento: string }>({
    action: 'resolve-reset-request',
    requestId,
  });
}

export function apiDismissResetRequest(requestId: string) {
  return authRequest<{ ok: true }>({ action: 'dismiss-reset-request', requestId });
}

export interface NewUserPayload {
  nombre: string;
  documento: string;
  rol?: string;
  contacto?: string;
  tipo?: string;
  nivel?: string;
  notas?: string;
  academiaId?: string;
}

export interface CreatedUser {
  id: string;
  nombre: string;
  documento: string;
  rol: AppRole;
  tempPassword: string;
}

/** Crea usuarios (uno o en lote); cada uno recibe una contraseña temporal. */
export function apiCreateUsers(users: NewUserPayload[]) {
  return authRequest<{ created: CreatedUser[] }>({ action: 'create-users', users });
}

// ---------------------------------------------------------------------------
// Asistencia
// ---------------------------------------------------------------------------

export type ResultadoAsistencia =
  | 'registrada_cupo'
  | 'registrada_ilimitada'
  | 'registrada_sin_cupo'
  | 'registrada_vencido'
  | 'registrada_sin_plan'
  | 'duplicada';

export interface RegistroAsistencia {
  resultado: ResultadoAsistencia;
  tono: 'success' | 'warning' | 'error';
  titulo: string;
  detalle: string;
  alumno: { id: string; nombre: string };
  record: AttendanceRecord | null;
  plan: { concepto: string; restantes: number | null; vigenciaHasta: string | null } | null;
}

export interface ClaseParaRegistro {
  /**
   * Identidad de la clase. Obligatoria para las clases de la agenda; en una
   * clase manual se puede omitir y el servidor la arma con alumno, fecha y hora.
   */
  key?: string;
  tipo: ClaseOrigenTipo;
  titulo: string;
  fecha: string;
  hora: string;
  categoria?: ClaseCategoria;
  academiaId?: string;
  sessionId?: string;
  eventId?: string;
}

function attendanceRequest<T>(payload: Record<string, unknown>): Promise<T> {
  return request<T>(ATTENDANCE_ENDPOINT, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

/**
 * Registra la asistencia de un alumno a una clase. El servidor decide contra
 * qué plan se cobra y devuelve el aviso ya redactado: sólo responde a un
 * administrador, así que la interfaz no es la única barrera.
 *
 * `sinDescuento` es la decisión explícita del administrador de no tocar ningún
 * plan —la clase queda registrada para cobrarla aparte—; sin él, el servidor
 * elige el plan que corresponda.
 */
export function apiRegisterAttendance(input: {
  alumnoId: string;
  clase: ClaseParaRegistro;
  origen: 'qr' | 'manual';
  notas?: string;
  sinDescuento?: boolean;
}) {
  return attendanceRequest<RegistroAsistencia>({ action: 'register', ...input });
}

/** Anula un registro sin borrarlo y devuelve el cupo al plan del que salió. */
export function apiVoidAttendance(recordId: string) {
  return attendanceRequest<{ ok: true; record: AttendanceRecord; devolvio: boolean }>({
    action: 'void',
    recordId,
  });
}

// ---------------------------------------------------------------------------
// Comprobantes de pago
// ---------------------------------------------------------------------------

function pagosRequest<T>(payload: Record<string, unknown>): Promise<T> {
  return request<T>(PAGOS_ENDPOINT, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export interface ResultadoComprobante {
  ok: true;
  payment: Payment;
  titulo: string;
  detalle: string;
}

/**
 * El alumno reporta el pago de un plan del catálogo (`planId`) o de un cobro
 * que ya tenía pendiente (`paymentId`).
 *
 * El monto, el cupo y la vigencia los calcula el servidor desde la plantilla:
 * aquí sólo viajan el comprobante y la forma de pago.
 */
export function apiReportarPago(input: {
  planId?: string;
  paymentId?: string;
  metodoPago: 'bold' | 'transferencia';
  comprobanteUrl: string;
  notas?: string;
}) {
  return pagosRequest<ResultadoComprobante>({ action: 'submit', ...input });
}

/** Aprueba o rechaza un comprobante. Rechazar devuelve el cobro a 'pendiente'. */
export function apiRevisarPago(input: {
  paymentId: string;
  decision: 'aprobar' | 'rechazar';
  nota?: string;
}) {
  return pagosRequest<ResultadoComprobante>({ action: 'review', ...input });
}
