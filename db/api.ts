import { db } from './index.js';
import {
  academies,
  academyLogs,
  academyPayments,
  attendanceRecords,
  classOccurrences,
  classSeries,
  events,
  expenses,
  gigs,
  notifications,
  payments,
  plans,
  sessions,
  settings,
  students,
  teachers,
} from './schema.js';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  LIST_COLLECTIONS,
  fromRowShape,
  sanitize,
  stripNulls,
  toRowShape,
  type AnyRecord,
  type ListCollection,
} from './mapping.js';
import {
  AuthError,
  ensurePasswordsHashed,
  ensureSeedAdmin,
  SEED_ADMIN_ID,
  requireSession,
  seedAdminRow,
  sessionFrom,
  type SessionClaims,
} from './auth.js';

/**
 * Lectura y escritura del estado de la aplicación en Netlify DB.
 *
 * El cliente siempre envía colecciones completas, así que cada escritura
 * reemplaza la tabla entera dentro de una transacción. Es la misma semántica
 * que tenía el guardado en localStorage, pero compartida entre dispositivos.
 *
 * Las credenciales quedan fuera de este flujo: ni salen en la lectura ni se
 * aceptan en la escritura. Todo lo que las toca está en db/auth.ts.
 *
 * La asistencia sigue el mismo criterio: se lee desde aquí, pero sólo se
 * escribe en db/attendance.ts, que exige administrador. `attendance_records`
 * no está en LIST_COLLECTIONS, así que ninguna escritura del cliente la alcanza
 * ni siquiera enviándola en el payload.
 *
 * La programación de clases (`class_series` y `class_occurrences`) funciona
 * igual: se lee desde aquí y se escribe únicamente en db/clases.ts, que también
 * exige administrador.
 */

/** Columnas que nunca cruzan la frontera del servidor. */
const CREDENTIAL_FIELDS = ['password', 'passwordHash'] as const;

/** Tablas cuyas credenciales hay que conservar al reemplazar la colección. */
const CREDENTIAL_TABLES: Partial<Record<ListCollection, PgTable>> = {
  students,
  teachers,
};

/**
 * Campos que sólo el administrador puede mover.
 *
 * Las clases consumidas y la asistencia de una sesión son el resultado de un
 * registro de asistencia, no algo que el alumno o el profesor editen. Como el
 * cliente manda la colección completa, un portal podría reenviarlos alterados;
 * en ese caso se restauran desde lo que ya había guardado.
 */
const ADMIN_ONLY_FIELDS: Partial<Record<ListCollection, string[]>> = {
  payments: ['clasesUsadas'],
  sessions: ['asistencia'],
};

/**
 * Colecciones que una cuenta de alumno no puede escribir.
 *
 * El portal del alumno reporta sus pagos por `/api/pagos`, que es quien calcula
 * el monto y la vigencia desde la plantilla del plan. Si además pudiera
 * reemplazar `payments` o `plans` desde aquí, le bastaría con reenviar la
 * colección para regalarse un plan o cambiarle el precio. El resto son datos
 * de gestión que su portal sólo lee.
 */
const ALUMNO_SIN_ESCRITURA: ListCollection[] = [
  'payments',
  'plans',
  'teachers',
  'academies',
  'academyPayments',
  'expenses',
  'gigs',
];

/** Postgres limita los parámetros por consulta, así que se inserta por lotes. */
function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function replaceList(tx: any, table: PgTable, rows: AnyRecord[]) {
  await tx.delete(table);
  for (const batch of chunk(rows)) {
    await tx.insert(table).values(batch);
  }
}

/** Quita hash y contraseña heredada de una fila antes de enviarla al cliente. */
function withoutCredentials(row: AnyRecord): AnyRecord {
  const out = stripNulls(row);
  for (const field of CREDENTIAL_FIELDS) delete out[field];
  return out;
}

export interface ReadResult {
  data: AnyRecord;
  /** true cuando no había ni un registro: el cliente puede subir sus datos locales. */
  empty: boolean;
  /** true cuando la petición traía una sesión válida y por tanto viene todo. */
  authenticated: boolean;
}

/**
 * Sin sesión sólo se entregan los ajustes visuales, que es lo único que
 * necesita la pantalla de inicio de sesión para pintarse.
 */
export async function readPublic(): Promise<ReadResult> {
  await ensureSeedAdmin();
  const settingsRows = await db.select().from(settings);
  const { id: _id, ...settingsRow } = (settingsRows[0] ?? {}) as AnyRecord;
  return { empty: false, authenticated: false, data: { settings: stripNulls(settingsRow) } };
}

export async function readAll(): Promise<ReadResult> {
  await ensureSeedAdmin();
  await ensurePasswordsHashed();

  const [
    teacherRows,
    studentRows,
    sessionRows,
    paymentRows,
    academyRows,
    gigRows,
    planRows,
    expenseRows,
    academyPaymentRows,
    eventRows,
    notificationRows,
    academyLogRows,
    attendanceRows,
    seriesRows,
    occurrenceRows,
    settingsRows,
  ] = await Promise.all([
    db.select().from(teachers),
    db.select().from(students),
    db.select().from(sessions),
    db.select().from(payments),
    db.select().from(academies),
    db.select().from(gigs),
    db.select().from(plans),
    db.select().from(expenses),
    db.select().from(academyPayments),
    db.select().from(events),
    db.select().from(notifications),
    db.select().from(academyLogs),
    db.select().from(attendanceRecords),
    db.select().from(classSeries),
    db.select().from(classOccurrences),
    db.select().from(settings),
  ]);

  // La cuenta sembrada no cuenta como contenido: con sólo ella, la base sigue
  // «vacía» y el cliente puede subir lo que tuviera guardado en el navegador.
  const realStudents = (studentRows as AnyRecord[]).filter((row) => row.id !== SEED_ADMIN_ID);

  const empty = [
    teacherRows,
    realStudents,
    sessionRows,
    paymentRows,
    academyRows,
    gigRows,
    planRows,
    expenseRows,
    academyPaymentRows,
    eventRows,
    notificationRows,
    academyLogRows,
    settingsRows,
  ].every((rows) => rows.length === 0);

  const studentList = studentRows as AnyRecord[];

  const logs: Record<string, string> = {};
  for (const row of academyLogRows as AnyRecord[]) {
    logs[row.key as string] = row.estado as string;
  }

  const { id: _settingsId, ...settingsRow } = (settingsRows[0] ?? {}) as AnyRecord;
  const clean = (rows: unknown[]) => (rows as AnyRecord[]).map(stripNulls);

  return {
    empty,
    authenticated: true,
    data: {
      teachers: (teacherRows as AnyRecord[]).map(withoutCredentials),
      students: studentList.map(withoutCredentials),
      sessions: clean(sessionRows),
      payments: clean(paymentRows),
      academies: clean(academyRows),
      gigs: clean(gigRows),
      plans: clean(planRows),
      expenses: clean(expenseRows),
      academyPayments: clean(academyPaymentRows),
      events: clean(eventRows),
      notifications: clean(notificationRows).map((row) => fromRowShape('notifications', row)),
      attendanceRecords: clean(attendanceRows),
      classSeries: clean(seriesRows),
      classOccurrences: clean(occurrenceRows).sort((a, b) =>
        `${a.fecha} ${a.horaInicio}`.localeCompare(`${b.fecha} ${b.horaInicio}`)
      ),
      academyLogs: logs,
      settings: stripNulls(settingsRow),
    },
  };
}

/**
 * Documento duplicado: se rechaza si la escritura *aumenta* las repeticiones.
 *
 * Los duplicados que ya estaban en la base se toleran para no bloquear todos
 * los guardados hasta que alguien los limpie a mano, pero no se puede crear ni
 * editar un usuario para que choque con otro.
 */
function assertUniqueDocumentos(incoming: AnyRecord[], stored: AnyRecord[]) {
  const count = (rows: AnyRecord[]) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const documento = typeof row.documento === 'string' ? row.documento.trim() : '';
      if (!documento) continue;
      map.set(documento, (map.get(documento) ?? 0) + 1);
    }
    return map;
  };

  const before = count(stored);
  for (const [documento, after] of count(incoming)) {
    if (after > 1 && after > (before.get(documento) ?? 0)) {
      throw new AuthError(`Ya existe un usuario con el documento ${documento}`, 409);
    }
  }
}

/** Reemplaza únicamente las colecciones presentes en `payload`. */
export async function writeCollections(
  payload: AnyRecord,
  claims?: SessionClaims | null
): Promise<string[]> {
  const written: string[] = [];
  const esAdmin = claims?.rol === 'administrador';

  await (db as any).transaction(async (tx: any) => {
    for (const name of Object.keys(LIST_COLLECTIONS) as ListCollection[]) {
      if (!(name in payload)) continue;
      // Se ignora en silencio: el portal del alumno nunca las manda, y una
      // petición armada a mano no debe poder tocarlas.
      if (claims?.rol === 'alumno' && ALUMNO_SIN_ESCRITURA.includes(name)) continue;
      const items = payload[name];
      if (!Array.isArray(items)) continue;

      const table = LIST_COLLECTIONS[name];

      // El id es la clave primaria: un duplicado abortaría la transacción,
      // así que se conserva la última aparición de cada uno.
      const byId = new Map<string, AnyRecord>();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = sanitize(table, toRowShape(name, item as AnyRecord));
        if (typeof row.id !== 'string' || row.id === '') continue;
        // Una contraseña enviada por el cliente se descarta sin excepción.
        for (const field of CREDENTIAL_FIELDS) delete row[field];
        delete row.mustChangePassword;
        byId.set(row.id, row);
      }
      const rows = [...byId.values()];

      const protegidos = esAdmin ? undefined : ADMIN_ONLY_FIELDS[name];
      if (protegidos) {
        // Se comparan contra lo guardado, no contra lo enviado: una fila nueva
        // creada desde un portal empieza sin consumo y sin asistencia.
        const stored = (await tx.select().from(table)) as AnyRecord[];
        const previos = new Map(stored.map((row) => [row.id as string, row]));
        for (const row of rows) {
          const anterior = previos.get(row.id as string);
          for (const field of protegidos) {
            if (anterior && anterior[field] !== null && anterior[field] !== undefined) {
              row[field] = anterior[field];
            } else {
              delete row[field];
            }
          }
        }
      }

      if (CREDENTIAL_TABLES[name]) {
        const stored = (await tx.select().from(table)) as AnyRecord[];

        // Alumnos y profesores entran con su documento: en ambos debe ser único.
        assertUniqueDocumentos(rows, stored);

        // La colección se reescribe completa, así que hay que volver a poner
        // el hash y el flag que el cliente nunca vio.
        const credentials = new Map(
          stored.map((row) => [
            row.id as string,
            {
              password: row.password ?? null,
              passwordHash: row.passwordHash ?? null,
              mustChangePassword: row.mustChangePassword === true,
            },
          ])
        );
        for (const row of rows) {
          const kept = credentials.get(row.id as string);
          if (!kept) continue;
          if (kept.password !== null) row.password = kept.password;
          if (kept.passwordHash !== null) row.passwordHash = kept.passwordHash;
          row.mustChangePassword = kept.mustChangePassword;
        }
      }

      await replaceList(tx, table, rows);

      // Sin ningún administrador nadie podría volver a entrar, así que se
      // restaura la cuenta sembrada como red de seguridad.
      if (name === 'students' && !rows.some((row) => row.rol === 'administrador')) {
        await tx.insert(table).values((await seedAdminRow()) as any);
      }

      written.push(name);
    }

    if ('academyLogs' in payload && payload.academyLogs && typeof payload.academyLogs === 'object') {
      const rows = Object.entries(payload.academyLogs as Record<string, unknown>)
        .filter(([key, estado]) => key && typeof estado === 'string')
        .map(([key, estado]) => ({ key, estado: estado as string }));
      await replaceList(tx, academyLogs, rows);
      written.push('academyLogs');
    }

    if (
      'settings' in payload &&
      payload.settings &&
      typeof payload.settings === 'object' &&
      claims?.rol !== 'alumno'
    ) {
      const row = sanitize(settings, { ...(payload.settings as AnyRecord), id: 1 });
      await tx.delete(settings);
      await tx.insert(settings).values(row as any);
      written.push('settings');
    }
  });

  return written;
}

/** Handler compartido por la Netlify Function y el servidor Express de desarrollo. */
export async function handleDataRequest(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      const claims = await sessionFrom(request);
      return Response.json(claims ? await readAll() : await readPublic());
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const claims = await requireSession(request);
      const payload = (await request.json()) as AnyRecord;
      if (!payload || typeof payload !== 'object') {
        return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
      }
      const written = await writeCollections(payload, claims);
      return Response.json({ ok: true, written });
    }

    return Response.json({ error: 'Método no permitido' }, { status: 405 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/data]', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}
