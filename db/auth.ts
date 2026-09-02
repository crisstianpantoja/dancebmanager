import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './index.js';
import { authConfig, passwordResetRequests, students, teachers } from './schema.js';
import { sanitize, type AnyRecord } from './mapping.js';

/**
 * Todo lo relacionado con credenciales vive en el servidor.
 *
 * Reglas que sostienen este archivo:
 *  - Una contraseña sólo existe en claro durante la petición que la crea o la
 *    verifica. En la base de datos únicamente hay un hash bcrypt.
 *  - El cliente nunca recibe un hash, ni siquiera el administrador.
 *  - Las contraseñas temporales se devuelven una sola vez, en la respuesta de
 *    la acción que las genera, y quedan marcadas con `mustChangePassword`.
 */

/** Coste bcrypt: alto para frenar fuerza bruta, bajo para no agotar la función. */
const BCRYPT_ROUNDS = 10;

/** Duración de una sesión firmada. */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 8;

/** Ámbito de la credencial: la tabla donde vive el usuario. */
export type AuthScope = 'student' | 'teacher';

export type AppRole = 'alumno' | 'administrador' | 'profesor';

export interface SessionClaims {
  /** id del usuario. */
  sub: string;
  rol: AppRole;
  scope: AuthScope;
  /** Vencimiento en milisegundos epoch. */
  exp: number;
}

export interface PublicSession {
  token: string;
  user: {
    id: string;
    nombre: string;
    rol: AppRole;
    scope: AuthScope;
    mustChangePassword: boolean;
  };
}

/** Error con código HTTP, para que el handler responda sin adivinar. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const TABLES = { student: students, teacher: teachers } as const;

function tableFor(scope: AuthScope) {
  return TABLES[scope];
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Sin O/0/I/1: se dictan por teléfono sin confundirse. */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Contraseña temporal legible, con la entropía suficiente para un solo uso. */
export function generateTempPassword(): string {
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/** Requisitos mínimos de una contraseña definida por la persona. */
export function assertPasswordPolicy(password: string, documento?: string | null) {
  const value = (password || '').trim();
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (documento && value === documento.trim()) {
    throw new AuthError('La contraseña no puede ser igual al número de documento');
  }
}

// ---------------------------------------------------------------------------
// Tokens de sesión
// ---------------------------------------------------------------------------

let cachedSecret: string | null = null;

/**
 * Secreto de firma. Se guarda en la base de datos para que todas las
 * invocaciones de la función lo compartan sin pedir configuración manual.
 */
async function getAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const [existing] = await db.select().from(authConfig).where(eq(authConfig.id, 1));
  if (existing?.secret) {
    cachedSecret = existing.secret;
    return cachedSecret;
  }

  const secret = crypto.randomBytes(32).toString('hex');
  await db.insert(authConfig).values({ id: 1, secret }).onConflictDoNothing();

  const [stored] = await db.select().from(authConfig).where(eq(authConfig.id, 1));
  cachedSecret = stored?.secret || secret;
  return cachedSecret;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function createToken(claims: Omit<SessionClaims, 'exp'>): Promise<string> {
  const secret = await getAuthSecret();
  const payload = base64url(JSON.stringify({ ...claims, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve las claims si el token es auténtico y no ha vencido; si no, null. */
export async function verifyToken(token: string | null | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const secret = await getAuthSecret();
  const expected = sign(payload, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (!claims?.sub || typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Lee el token del encabezado `Authorization: Bearer …`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function sessionFrom(request: Request): Promise<SessionClaims | null> {
  return verifyToken(bearerToken(request));
}

export async function requireSession(request: Request): Promise<SessionClaims> {
  const claims = await sessionFrom(request);
  if (!claims) throw new AuthError('Sesión no válida o vencida. Vuelve a iniciar sesión.', 401);
  return claims;
}

export async function requireAdmin(request: Request): Promise<SessionClaims> {
  const claims = await requireSession(request);
  if (claims.rol !== 'administrador') {
    throw new AuthError('Solo un administrador puede realizar esta acción', 403);
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Administrador sembrado
// ---------------------------------------------------------------------------

/** id de la cuenta sembrada. Se ignora al decidir si la base está vacía. */
export const SEED_ADMIN_ID = 'admin_1088593872';

/** Cuenta que se crea si la tabla de usuarios queda vacía. */
const SEED_ADMIN = {
  id: SEED_ADMIN_ID,
  documento: '1088593872',
  nombre: 'Administrador',
  contacto: '',
  activo: true,
  tipo: 'ambas',
  nivel: 'Avanzado',
  rol: 'administrador',
  notas: '',
  competencias: { ritmo: 0, movimiento: 0, imagen: 0, conexion: 0 },
  historial: [],
};

/**
 * Contraseña inicial del administrador sembrado. Se guarda hasheada y con
 * `mustChangePassword`, así que sólo sirve para el primer inicio de sesión.
 * Configurable con la variable de entorno `SEED_ADMIN_PASSWORD`.
 */
function seedAdminPassword(): string {
  return process.env.SEED_ADMIN_PASSWORD || 'Cambiar-Ahora-2026';
}

export async function seedAdminRow(): Promise<AnyRecord> {
  return sanitize(students, {
    ...SEED_ADMIN,
    fechaIngreso: new Date().toISOString().split('T')[0],
    passwordHash: await hashPassword(seedAdminPassword()),
    mustChangePassword: true,
  });
}

/**
 * Sin ningún usuario nadie podría entrar, así que se siembra el administrador.
 * Se comprueba antes de leer y antes de iniciar sesión.
 */
export async function ensureSeedAdmin(): Promise<void> {
  const [existing] = await db.select({ id: students.id }).from(students).limit(1);
  if (existing) return;
  await db.insert(students).values((await seedAdminRow()) as any).onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Migración de contraseñas heredadas
// ---------------------------------------------------------------------------

let hashingMigration: Promise<number> | null = null;

/**
 * Convierte a hash las contraseñas que quedaron en texto plano y borra la
 * columna heredada. Se ejecuta una vez por instancia de la función; es
 * idempotente, así que repetirla no tiene efecto.
 */
export function ensurePasswordsHashed(): Promise<number> {
  if (!hashingMigration) {
    hashingMigration = migratePlainPasswords().catch((error) => {
      // Un fallo no debe dejar la migración marcada como hecha.
      hashingMigration = null;
      throw error;
    });
  }
  return hashingMigration;
}

async function migratePlainPasswords(): Promise<number> {
  let migrated = 0;

  for (const scope of ['student', 'teacher'] as AuthScope[]) {
    const table = tableFor(scope) as any;
    const rows = (await db.select().from(table)) as AnyRecord[];

    for (const row of rows) {
      const plain = typeof row.password === 'string' ? row.password.trim() : '';
      if (!plain) continue;

      // Si ya hay hash, la columna heredada sólo sobra.
      const update: AnyRecord = { password: null };
      if (!row.passwordHash) update.passwordHash = await hashPassword(plain);

      await db.update(table).set(update).where(eq(table.id, row.id as string));
      migrated += 1;
    }
  }

  return migrated;
}

// ---------------------------------------------------------------------------
// Inicio de sesión
// ---------------------------------------------------------------------------

interface UserRow extends AnyRecord {
  id: string;
  nombre?: string;
  documento?: string | null;
  rol?: string;
  activo?: boolean | null;
  passwordHash?: string | null;
  mustChangePassword?: boolean | null;
}

async function findByDocumento(scope: AuthScope, documento: string): Promise<UserRow[]> {
  const table = tableFor(scope) as any;
  return (await db.select().from(table).where(eq(table.documento, documento))) as UserRow[];
}

/**
 * Verifica documento + contraseña y devuelve una sesión firmada.
 *
 * El mensaje de error es el mismo para «documento inexistente» y «contraseña
 * incorrecta»: así no se puede usar el login para averiguar qué documentos
 * están registrados.
 */
export async function login(input: {
  documento?: unknown;
  password?: unknown;
  rol?: unknown;
}): Promise<PublicSession> {
  await ensureSeedAdmin();
  await ensurePasswordsHashed();

  const documento = String(input.documento ?? '').trim();
  const password = String(input.password ?? '');
  const rol = String(input.rol ?? 'alumno') as AppRole;

  if (!documento) throw new AuthError('Ingresa tu número de documento');
  if (!password) throw new AuthError('Ingresa tu contraseña');

  const genericError = new AuthError('Documento o contraseña incorrectos', 401);

  const scope: AuthScope = rol === 'profesor' ? 'teacher' : 'student';
  const candidates = await findByDocumento(scope, documento);
  const matching = scope === 'teacher' ? candidates : candidates.filter((row) => row.rol === rol);

  if (matching.length === 0) throw genericError;

  for (const row of matching) {
    if (!(await verifyPassword(password, row.passwordHash))) continue;
    if (row.activo === false) throw new AuthError('Usuario inactivo. Contacta al administrador.', 403);

    const claims = { sub: row.id, rol, scope };
    return {
      token: await createToken(claims),
      user: {
        id: row.id,
        nombre: row.nombre || '',
        rol,
        scope,
        mustChangePassword: row.mustChangePassword === true,
      },
    };
  }

  throw genericError;
}

// ---------------------------------------------------------------------------
// Cambio y restablecimiento de contraseña
// ---------------------------------------------------------------------------

async function getUser(scope: AuthScope, id: string): Promise<UserRow> {
  const table = tableFor(scope) as any;
  const [row] = (await db.select().from(table).where(eq(table.id, id))) as UserRow[];
  if (!row) throw new AuthError('Usuario no encontrado', 404);
  return row;
}

/**
 * La persona define su propia contraseña. Cuando viene de un restablecimiento
 * no se pide la anterior: ya la acreditó al iniciar sesión con la temporal.
 */
export async function changeOwnPassword(
  claims: SessionClaims,
  input: { currentPassword?: unknown; newPassword?: unknown }
): Promise<{ ok: true }> {
  const user = await getUser(claims.scope, claims.sub);
  const newPassword = String(input.newPassword ?? '');

  assertPasswordPolicy(newPassword, user.documento);

  if (user.mustChangePassword !== true) {
    const currentPassword = String(input.currentPassword ?? '');
    if (!currentPassword) throw new AuthError('Ingresa tu contraseña actual');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError('La contraseña actual no es correcta', 401);
    }
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AuthError('La contraseña nueva debe ser distinta de la anterior');
  }

  const table = tableFor(claims.scope) as any;
  await db
    .update(table)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, password: null })
    .where(eq(table.id, claims.sub));

  return { ok: true };
}

/**
 * El administrador genera una contraseña temporal. Es el único momento en que
 * se ve, y sólo sirve para que la persona defina la suya.
 */
export async function resetPassword(input: {
  userId?: unknown;
  scope?: unknown;
}): Promise<{ tempPassword: string; nombre: string; documento: string }> {
  const scope: AuthScope = input.scope === 'teacher' ? 'teacher' : 'student';
  const userId = String(input.userId ?? '');
  if (!userId) throw new AuthError('Falta el usuario a restablecer');

  const user = await getUser(scope, userId);
  const tempPassword = generateTempPassword();

  const table = tableFor(scope) as any;
  await db
    .update(table)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, password: null })
    .where(eq(table.id, userId));

  return { tempPassword, nombre: user.nombre || '', documento: user.documento || '' };
}

// ---------------------------------------------------------------------------
// Solicitudes de restablecimiento desde el inicio de sesión
// ---------------------------------------------------------------------------

/**
 * Mensaje único de la solicitud. Es el mismo exista o no la cuenta: si
 * cambiara, la pantalla de inicio de sesión serviría para averiguar qué
 * documentos están registrados.
 */
const RESET_REQUEST_MESSAGE =
  'Recibimos tu solicitud. El administrador va a generar una contraseña temporal y te la entregará por tu medio de contacto.';

/**
 * El alumno pide desde el login que le restablezcan la contraseña.
 *
 * No cambia ninguna credencial: sólo deja constancia para que el administrador
 * la atienda. Si la cuenta no existe, no se guarda nada y la respuesta es
 * idéntica.
 *
 * Pedirlo dos veces no crea dos solicitudes: se reutiliza la pendiente y se
 * cuenta el intento, así la bandeja del administrador no se llena de copias.
 */
export async function requestPasswordReset(input: {
  documento?: unknown;
  rol?: unknown;
}): Promise<{ ok: true; message: string }> {
  const documento = String(input.documento ?? '').trim();
  if (!documento) throw new AuthError('Ingresa tu número de documento');

  const scope: AuthScope = String(input.rol ?? 'alumno') === 'profesor' ? 'teacher' : 'student';
  const [user] = await findByDocumento(scope, documento);

  if (user) {
    const [pendiente] = (await db
      .select()
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.documento, documento),
          eq(passwordResetRequests.estado, 'pendiente')
        )
      )) as AnyRecord[];

    if (pendiente) {
      await db
        .update(passwordResetRequests)
        .set({
          intentos: Number(pendiente.intentos ?? 1) + 1,
          creadoEn: new Date().toISOString(),
        })
        .where(eq(passwordResetRequests.id, pendiente.id as string));
    } else {
      await db.insert(passwordResetRequests).values({
        id: `req_${crypto.randomBytes(6).toString('hex').slice(0, 10)}`,
        documento,
        scope,
        userId: user.id,
        nombre: user.nombre || '',
        contacto: (user.contacto as string) || '',
        estado: 'pendiente',
        intentos: 1,
        creadoEn: new Date().toISOString(),
      } as any);
    }
  }

  return { ok: true, message: RESET_REQUEST_MESSAGE };
}

/** Solicitudes sin atender, de la más reciente atrás. Sólo para administradores. */
export async function listPasswordResetRequests(): Promise<AnyRecord[]> {
  const rows = (await db
    .select()
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.estado, 'pendiente'))) as AnyRecord[];
  return rows
    .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)))
    .map((row) => {
      const { userId, ...rest } = row;
      return { ...rest, userId: userId ?? undefined };
    });
}

/**
 * El administrador atiende la solicitud: se genera la contraseña temporal (la
 * ve una sola vez) y la solicitud queda cerrada.
 */
export async function resolvePasswordResetRequest(
  claims: SessionClaims,
  input: { requestId?: unknown }
): Promise<{ tempPassword: string; nombre: string; documento: string }> {
  const requestId = String(input.requestId ?? '').trim();
  if (!requestId) throw new AuthError('Falta la solicitud a atender');

  const [solicitud] = (await db
    .select()
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.id, requestId))) as AnyRecord[];
  if (!solicitud) throw new AuthError('Esa solicitud no existe', 404);
  if (solicitud.estado !== 'pendiente') throw new AuthError('Esa solicitud ya fue atendida', 409);
  if (!solicitud.userId) throw new AuthError('La cuenta de esa solicitud ya no existe', 404);

  const result = await resetPassword({ userId: solicitud.userId, scope: solicitud.scope });

  await db
    .update(passwordResetRequests)
    .set({ estado: 'atendida', atendidoPor: claims.sub, atendidoEn: new Date().toISOString() })
    .where(eq(passwordResetRequests.id, requestId));

  return result;
}

/** Descarta una solicitud sin tocar la contraseña. */
export async function dismissPasswordResetRequest(
  claims: SessionClaims,
  input: { requestId?: unknown }
): Promise<{ ok: true }> {
  const requestId = String(input.requestId ?? '').trim();
  if (!requestId) throw new AuthError('Falta la solicitud a descartar');

  await db
    .update(passwordResetRequests)
    .set({ estado: 'descartada', atendidoPor: claims.sub, atendidoEn: new Date().toISOString() })
    .where(eq(passwordResetRequests.id, requestId));

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Alta de usuarios (individual y por lotes)
// ---------------------------------------------------------------------------

export interface NewUserInput {
  nombre?: unknown;
  documento?: unknown;
  rol?: unknown;
  contacto?: unknown;
  tipo?: unknown;
  nivel?: unknown;
  notas?: unknown;
  /** Academia a la que queda vinculado; alimenta su calendario de clases. */
  academiaId?: unknown;
}

export interface CreatedUser {
  id: string;
  nombre: string;
  documento: string;
  rol: AppRole;
  tempPassword: string;
}

const ROLES: AppRole[] = ['alumno', 'administrador', 'profesor'];
const TIPOS = ['academia', 'privada', 'ambas'];
const NIVELES = ['Principiante', 'Intermedio', 'Avanzado'];

function normalizeRole(value: unknown): AppRole {
  const raw = String(value ?? 'alumno').trim().toLowerCase();
  if (raw === 'admin' || raw === 'administrator') return 'administrador';
  if (raw === 'profe' || raw === 'teacher') return 'profesor';
  return (ROLES as string[]).includes(raw) ? (raw as AppRole) : 'alumno';
}

function pick(value: unknown, allowed: string[], fallback: string): string {
  const raw = String(value ?? '').trim();
  const found = allowed.find((option) => option.toLowerCase() === raw.toLowerCase());
  return found || fallback;
}

function newId(): string {
  return crypto.randomBytes(6).toString('hex').slice(0, 7);
}

/**
 * Crea uno o varios usuarios, cada uno con su contraseña temporal.
 *
 * Valida el lote completo antes de escribir nada: o entran todos, o no entra
 * ninguno. Así una fila mala de un CSV no deja media importación a medias.
 */
export async function createUsers(input: NewUserInput[]): Promise<CreatedUser[]> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new AuthError('No hay usuarios para crear');
  }
  if (input.length > 500) {
    throw new AuthError('Máximo 500 usuarios por importación');
  }

  const prepared = input.map((item, index) => ({
    row: index + 1,
    nombre: String(item.nombre ?? '').trim(),
    documento: String(item.documento ?? '').trim(),
    rol: normalizeRole(item.rol),
    contacto: String(item.contacto ?? '').trim(),
    tipo: pick(item.tipo, TIPOS, 'ambas'),
    nivel: pick(item.nivel, NIVELES, 'Principiante'),
    notas: String(item.notas ?? '').trim(),
    academiaId: String(item.academiaId ?? '').trim(),
  }));

  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const item of prepared) {
    if (!item.nombre) problems.push(`Fila ${item.row}: falta el nombre`);
    if (!item.documento) problems.push(`Fila ${item.row}: falta el documento`);
    if (item.documento) {
      const previous = seen.get(item.documento);
      if (previous) problems.push(`Fila ${item.row}: documento repetido en el archivo (fila ${previous})`);
      else seen.set(item.documento, item.row);
    }
  }

  const documentos = [...seen.keys()];
  if (documentos.length > 0) {
    const existing = (await db
      .select({ documento: students.documento })
      .from(students)
      .where(inArray(students.documento, documentos))) as { documento: string | null }[];
    const taken = new Set(existing.map((row) => row.documento));
    for (const item of prepared) {
      if (item.documento && taken.has(item.documento)) {
        problems.push(`Fila ${item.row}: el documento ${item.documento} ya existe`);
      }
    }
  }

  if (problems.length > 0) {
    throw new AuthError(problems.slice(0, 10).join(' · '));
  }

  const created: CreatedUser[] = [];
  const rows: AnyRecord[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const item of prepared) {
    const tempPassword = generateTempPassword();
    const id = newId();
    rows.push(
      sanitize(students, {
        id,
        nombre: item.nombre,
        documento: item.documento,
        contacto: item.contacto,
        rol: item.rol,
        tipo: item.tipo,
        nivel: item.nivel,
        notas: item.notas,
        academiaId: item.academiaId || null,
        fechaIngreso: today,
        activo: true,
        competencias: { ritmo: 0, movimiento: 0, imagen: 0, conexion: 0 },
        historial: [],
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      })
    );
    created.push({ id, nombre: item.nombre, documento: item.documento, rol: item.rol, tempPassword });
  }

  await db.insert(students).values(rows as any);
  return created;
}
