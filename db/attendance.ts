import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from './index.js';
import { attendanceRecords, payments, sessions, students } from './schema.js';
import { sanitize, stripNulls, type AnyRecord } from './mapping.js';
import { AuthError, requireAdmin, type SessionClaims } from './auth.js';

/**
 * Registro y anulación de clases asistidas.
 *
 * Reglas que sostienen este archivo:
 *  - Sólo un administrador registra o anula. Se comprueba aquí, en el servidor,
 *    no en la interfaz: `/api/data` tampoco acepta escrituras a esta tabla.
 *  - Escanear el mismo carnet dos veces para la misma clase no descuenta dos
 *    veces: el segundo intento avisa y no toca el plan.
 *  - Un plan vencido, agotado o inexistente NO bloquea el registro. La clase
 *    queda marcada para cobrarla aparte y el administrador recibe el aviso.
 *  - Anular no borra: marca el registro y devuelve el crédito al plan del que
 *    salió, así el historial de lo ocurrido se conserva completo.
 *  - Una clase NO necesita estar en la agenda. Las privadas, por naturaleza, no
 *    lo están: llegan con `tipo: 'manual'` y sin clave, y el servidor les arma
 *    una con el alumno, la fecha y la hora. Es el mismo camino para una clase de
 *    academia que no estaba programada.
 *
 * El cliente calcula lo mismo en src/lib/planes.ts sólo para mostrarlo. Si
 * ambos difieren, manda lo que se decide aquí.
 */

/** Modalidades contra las que se puede cobrar una clase. */
const COBRABLES = ['Mensualidad', 'Paquete de clases'];

/**
 * Días desde el vencimiento dentro de los que el aviso se lee como «acaba de
 * terminar» en lugar de «hay que renovar».
 */
const RECIEN_VENCIDO_DIAS = 7;

/** Orígenes válidos de una clase. 'manual' es la que no está en la agenda. */
const TIPOS_DE_CLASE = ['academia', 'sesion', 'evento', 'programada', 'manual'];

/**
 * Clases que por definición juntan a varios alumnos en la misma hora. Un
 * alumno de plan privado no pertenece a ninguna de ellas; 'evento' queda fuera
 * porque a un evento entra cualquiera, y 'manual' es justamente por donde pasa
 * la privada. 'sesion' no está en la lista porque no se puede decidir por el
 * tipo: una sesión es de grupo o uno a uno según su propia fila (ver
 * `esClaseDeGrupo`).
 */
const CLASES_DE_GRUPO = ['academia', 'programada'];

/** Categorías reconocidas. Cualquier otra se guarda como nula. */
const CATEGORIAS = ['Básica', 'Intermedia', 'Avanzada', 'Grupo', 'Privada', 'Evento', 'Taller'];

export type EstadoPlan = 'cupo' | 'ilimitada' | 'sin_cupo' | 'vencido' | 'sin_plan';

export type ResultadoAsistencia =
  | 'registrada_cupo'
  | 'registrada_ilimitada'
  | 'registrada_sin_cupo'
  | 'registrada_vencido'
  | 'registrada_sin_plan'
  | 'duplicada';

export interface RegistroResultado {
  resultado: ResultadoAsistencia;
  /** 'success' | 'warning' | 'error': cómo debe pintarse el aviso. */
  tono: 'success' | 'warning' | 'error';
  titulo: string;
  detalle: string;
  alumno: { id: string; nombre: string };
  record: AnyRecord | null;
  plan: { concepto: string; restantes: number | null; vigenciaHasta: string | null } | null;
}

interface ClaseInput {
  key?: unknown;
  tipo?: unknown;
  titulo?: unknown;
  fecha?: unknown;
  hora?: unknown;
  categoria?: unknown;
  academiaId?: unknown;
  sessionId?: unknown;
  eventId?: unknown;
  claseId?: unknown;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function newId(): string {
  return crypto.randomBytes(6).toString('hex').slice(0, 10);
}

function hoyStr(): string {
  const now = new Date();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mes}-${dia}`;
}

/** Hora local del servidor en 'HH:mm', para la clase que se registra ahora. */
function horaStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'YYYY-MM-DD' → '5 de octubre de 2026'. Vacío si la fecha no es válida. */
function fechaLarga(fecha?: string | null): string {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return fecha;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function diasEntre(desde: string, hasta: string): number {
  const [ay, am, ad] = desde.split('-').map(Number);
  const [by, bm, bd] = hasta.split('-').map(Number);
  if (!ay || !by) return 0;
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

function esIlimitada(row: AnyRecord): boolean {
  return row.modalidad === 'Mensualidad' && row.tipoMensualidad === 'ilimitada';
}

function usaCupo(row: AnyRecord): boolean {
  if (row.modalidad === 'Paquete de clases') return true;
  if (row.modalidad === 'Mensualidad') return row.tipoMensualidad !== 'ilimitada';
  return false;
}

function vigente(row: AnyRecord, hoy: string): boolean {
  const hasta = typeof row.fechaVencimiento === 'string' ? row.fechaVencimiento : '';
  return !hasta || hasta >= hoy;
}

function restante(row: AnyRecord): number {
  const incluidas = Number(row.clasesIncluidas ?? 0);
  const usadas = Number(row.clasesUsadas ?? 0);
  return Math.max(0, incluidas - usadas);
}

function texto(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
}

// ---------------------------------------------------------------------------
// Elección del plan al que se cobra
// ---------------------------------------------------------------------------

interface Eleccion {
  plan: AnyRecord | null;
  estado: EstadoPlan;
  consumeCupo: boolean;
  /** Plan que explica el motivo cuando no hay ninguno válido. */
  referencia: AnyRecord | null;
}

/**
 * Elige contra qué plan se cobra la clase.
 *
 * Primero los cupos limitados vigentes con saldo, del más antiguo al más nuevo,
 * para aprovechar el que está más cerca de vencer; el acceso ilimitado queda de
 * último porque no se agota. Si no hay ninguno válido, se devuelve el motivo
 * más útil para el aviso: agotado pesa más que vencido, y vencido más que la
 * ausencia total de plan.
 */
function elegirPlan(planes: AnyRecord[], hoy: string): Eleccion {
  const cobrables = planes.filter(
    (p) => p.estado === 'pagado' && COBRABLES.includes(String(p.modalidad))
  );

  const conCupo = cobrables
    .filter((p) => vigente(p, hoy) && usaCupo(p) && restante(p) > 0)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (conCupo.length > 0) {
    return { plan: conCupo[0], estado: 'cupo', consumeCupo: true, referencia: conCupo[0] };
  }

  const ilimitados = cobrables
    .filter((p) => vigente(p, hoy) && esIlimitada(p))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (ilimitados.length > 0) {
    return { plan: ilimitados[0], estado: 'ilimitada', consumeCupo: false, referencia: ilimitados[0] };
  }

  const agotados = cobrables
    .filter((p) => vigente(p, hoy) && usaCupo(p) && restante(p) === 0)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (agotados.length > 0) {
    return { plan: null, estado: 'sin_cupo', consumeCupo: false, referencia: agotados[0] };
  }

  const vencidos = cobrables
    .filter((p) => !vigente(p, hoy))
    .sort((a, b) =>
      String(b.fechaVencimiento ?? '').localeCompare(String(a.fechaVencimiento ?? ''))
    );
  if (vencidos.length > 0) {
    return { plan: null, estado: 'vencido', consumeCupo: false, referencia: vencidos[0] };
  }

  return { plan: null, estado: 'sin_plan', consumeCupo: false, referencia: null };
}

/** Aviso que ve el administrador al escanear. Informa; nunca bloquea. */
function mensaje(
  eleccion: Eleccion,
  nombre: string,
  hoy: string,
  // Cuando el administrador marcó «sin plan» a propósito, el aviso lo dice así
  // en lugar de sonar a que al alumno le falta algo.
  sinDescuento = false
): { resultado: ResultadoAsistencia; tono: 'success' | 'warning' | 'error'; titulo: string; detalle: string } {
  if (sinDescuento) {
    return {
      resultado: 'registrada_sin_plan',
      tono: 'warning',
      titulo: `Registrada sin plan · ${nombre}`,
      detalle:
        'La clase quedó registrada sin descontar de ningún plan, tal como se indicó, para cobrarla aparte.',
    };
  }

  const referencia = eleccion.referencia;
  const concepto = texto(referencia?.concepto, 'su plan');
  const hasta = texto(referencia?.fechaVencimiento);

  switch (eleccion.estado) {
    case 'ilimitada':
      return {
        resultado: 'registrada_ilimitada',
        tono: 'success',
        titulo: `En vigencia · ${nombre}`,
        detalle: hasta
          ? `Mensualidad ilimitada "${concepto}", vigente hasta el ${fechaLarga(hasta)}. Asistencia registrada.`
          : `Mensualidad ilimitada "${concepto}" activa. Asistencia registrada.`,
      };

    case 'cupo': {
      const quedan = Math.max(0, restante(eleccion.plan as AnyRecord) - 1);
      return {
        resultado: 'registrada_cupo',
        tono: 'success',
        titulo: `Asistencia registrada · ${nombre}`,
        detalle: `Se descontó 1 clase de "${concepto}". ${
          quedan === 0 ? 'No le quedan clases disponibles.' : `Le quedan ${quedan} clase${quedan === 1 ? '' : 's'}.`
        }`,
      };
    }

    case 'sin_cupo':
      return {
        resultado: 'registrada_sin_cupo',
        tono: 'error',
        titulo: `Sin cupo, debe renovar · ${nombre}`,
        detalle: `"${concepto}" ya no tiene clases disponibles. La clase queda registrada sin plan, para cobrarla aparte.`,
      };

    case 'vencido': {
      // Recién terminado se lee como el fin natural del plan; más atrás, como
      // un plan que llevan sin renovar.
      const dias = hasta ? diasEntre(hasta, hoy) : 0;
      const recien = dias >= 0 && dias <= RECIEN_VENCIDO_DIAS;
      return {
        resultado: 'registrada_vencido',
        tono: 'error',
        titulo: recien ? `Ya finalizó su mensualidad · ${nombre}` : `Debe renovar el plan · ${nombre}`,
        detalle: `"${concepto}" venció el ${fechaLarga(hasta)}. La clase queda registrada sin plan, para cobrarla aparte.`,
      };
    }

    default:
      return {
        resultado: 'registrada_sin_plan',
        tono: 'error',
        titulo: `Sin plan activo · ${nombre}`,
        detalle: 'No hay ningún plan vigente al que cobrar la clase. Queda registrada para cobrarla aparte.',
      };
  }
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/**
 * Clave de una clase que no está en la agenda. Con el alumno, la fecha y la
 * hora queda identificada, y eso es justo lo que hace falta para que el doble
 * escaneo del mismo carnet en la misma clase se detecte igual que en una clase
 * programada. Se arma aquí, no en el cliente, para que la detección no dependa
 * de lo que mande el navegador.
 */
function claveManual(alumnoId: string, fecha: string, hora: string): string {
  return `M:${alumnoId}:${fecha}:${hora}`;
}

/** Título con el que se guarda una clase registrada a mano. */
function tituloManual(categoria: string | null): string {
  if (categoria === 'Privada') return 'Clase privada';
  return categoria ? `Clase ${categoria.toLowerCase()}` : 'Clase suelta';
}

function leerClase(input: ClaseInput, alumnoId: string): {
  claseKey: string;
  claseTipo: string;
  titulo: string;
  fecha: string;
  hora: string;
  categoria: string | null;
  academiaId: string | null;
  sessionId: string | null;
  eventId: string | null;
  claseId: string | null;
} {
  const tipo = texto(input.tipo, 'academia');
  if (!TIPOS_DE_CLASE.includes(tipo)) {
    throw new AuthError(`Tipo de clase no reconocido: ${tipo}`);
  }

  // Sin fecha no hay registro posible, pero un registro manual sí puede llegar
  // sin hora: se toma la del momento, que es cuando la clase está ocurriendo.
  const fecha = texto(input.fecha, tipo === 'manual' ? hoyStr() : '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new AuthError('La fecha de la clase debe tener el formato YYYY-MM-DD');
  }

  const hora = texto(input.hora, tipo === 'manual' ? horaStr() : '');
  const categoriaCruda = texto(input.categoria);
  const categoria = CATEGORIAS.includes(categoriaCruda) ? categoriaCruda : null;

  // Una clase de la agenda siempre trae su clave; la manual no existe en
  // ninguna agenda, así que se le arma una en lugar de rechazarla.
  const claseKey = texto(input.key) || (tipo === 'manual' ? claveManual(alumnoId, fecha, hora) : '');
  if (!claseKey) throw new AuthError('Falta la clase a la que corresponde la asistencia');

  return {
    claseKey,
    claseTipo: tipo,
    titulo: texto(input.titulo, tipo === 'manual' ? tituloManual(categoria) : 'Clase'),
    fecha,
    hora,
    categoria,
    academiaId: texto(input.academiaId) || null,
    sessionId: texto(input.sessionId) || null,
    eventId: texto(input.eventId) || null,
    claseId: texto(input.claseId) || null,
  };
}

/**
 * ¿La clase junta a varios alumnos en la misma hora?
 *
 * Una sesión puede ser de academia —grupo— o privada —uno a uno—, y la agenda
 * entrega las dos como 'sesion' (ver clasesDelDia en src/lib/clases.ts), así
 * que el tipo de la clase no alcanza: hay que mirar la fila de la sesión. Una
 * sesión que ya no existe se trata como de grupo, que es el lado prudente para
 * un `sessionId` que no corresponde a nada.
 */
async function esClaseDeGrupo(clase: { claseTipo: string; sessionId: string | null }): Promise<boolean> {
  if (CLASES_DE_GRUPO.includes(clase.claseTipo)) return true;
  if (clase.claseTipo !== 'sesion') return false;
  if (!clase.sessionId) return true;

  const [sesion] = (await db
    .select({ tipo: sessions.tipo })
    .from(sessions)
    .where(eq(sessions.id, clase.sessionId))) as { tipo: string }[];

  return !sesion || sesion.tipo !== 'privada';
}

export async function registrarAsistencia(
  claims: SessionClaims,
  body: AnyRecord
): Promise<RegistroResultado> {
  const alumnoId = texto(body.alumnoId);
  if (!alumnoId) throw new AuthError('Falta el alumno');

  const clase = leerClase((body.clase ?? {}) as ClaseInput, alumnoId);
  const origen = body.origen === 'qr' ? 'qr' : 'manual';
  const notas = texto(body.notas);
  // Decisión explícita del administrador: registrar la clase sin cobrarla a
  // ningún plan. No es lo mismo que no tener plan, aunque acabe igual marcada.
  const sinDescuento = body.sinDescuento === true;
  const hoy = hoyStr();

  const [alumno] = (await db
    .select({ id: students.id, nombre: students.nombre, tipo: students.tipo })
    .from(students)
    .where(eq(students.id, alumnoId))) as { id: string; nombre: string; tipo: string }[];
  if (!alumno) throw new AuthError('El carnet no corresponde a ningún alumno registrado', 404);

  // Red de seguridad del servidor: el carnet de un alumno de plan privado no
  // puede quedar pegado a la clase de grupo que esté abierta en pantalla. Lo
  // que sí se registra con normalidad es un evento —abierto a cualquiera— y su
  // propia clase privada de la agenda, que es uno a uno igual que la manual.
  if (alumno.tipo === 'privada' && (await esClaseDeGrupo(clase))) {
    throw new AuthError(
      `${alumno.nombre || 'El alumno'} tiene plan privado: su asistencia se registra como clase privada, no contra una clase de grupo.`,
      409
    );
  }

  // Doble escaneo de la misma clase: se avisa y no se vuelve a descontar.
  const previos = (await db
    .select()
    .from(attendanceRecords)
    .where(
      and(eq(attendanceRecords.alumnoId, alumnoId), eq(attendanceRecords.claseKey, clase.claseKey))
    )) as AnyRecord[];
  const yaRegistrada = previos.find((row) => row.anulado !== true);
  if (yaRegistrada) {
    return {
      resultado: 'duplicada',
      tono: 'warning',
      titulo: `Ya estaba registrada · ${alumno.nombre}`,
      detalle: `La asistencia de ${alumno.nombre} a esta clase ya se había registrado. No se descontó una segunda clase.`,
      alumno: { id: alumno.id, nombre: alumno.nombre || '' },
      record: stripNulls(yaRegistrada),
      plan: null,
    };
  }

  const planesDelAlumno = (await db
    .select()
    .from(payments)
    .where(eq(payments.alumnoId, alumnoId))) as AnyRecord[];

  const eleccion: Eleccion = sinDescuento
    ? { plan: null, estado: 'sin_plan', consumeCupo: false, referencia: null }
    : elegirPlan(planesDelAlumno, hoy);
  const aviso = mensaje(eleccion, alumno.nombre || 'Alumno', hoy, sinDescuento);

  const row = sanitize(attendanceRecords, {
    id: newId(),
    alumnoId,
    claseKey: clase.claseKey,
    claseTipo: clase.claseTipo,
    titulo: clase.titulo,
    academiaId: clase.academiaId,
    sessionId: clase.sessionId,
    eventId: clase.eventId,
    claseId: clase.claseId,
    fecha: clase.fecha,
    hora: clase.hora,
    categoria: clase.categoria,
    origen,
    registradoPor: claims.sub,
    paymentId: eleccion.plan?.id ?? null,
    planConcepto: eleccion.plan ? texto(eleccion.plan.concepto) : null,
    estadoPlan: eleccion.estado,
    consumioCupo: eleccion.consumeCupo,
    notas,
    anulado: false,
    creadoEn: new Date().toISOString(),
  });

  await (db as any).transaction(async (tx: any) => {
    await tx.insert(attendanceRecords).values(row as any);

    if (eleccion.consumeCupo && eleccion.plan) {
      await tx
        .update(payments)
        .set({ clasesUsadas: Number(eleccion.plan.clasesUsadas ?? 0) + 1 })
        .where(eq(payments.id, eleccion.plan.id as string));
    }

    // Una clase con fila propia también refleja la asistencia en la sesión, que
    // es de donde la leen las pantallas que ya existían.
    if (clase.claseTipo === 'sesion' && clase.sessionId) {
      const [sesion] = (await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, clase.sessionId))) as AnyRecord[];
      if (sesion) {
        const asistencia = { ...((sesion.asistencia as Record<string, string>) || {}) };
        asistencia[alumnoId] = 'presente';
        // Solo la marca de asistencia: `alumnoIds` es el roster de matrícula y
        // registrar una asistencia no matricula a nadie.
        await tx.update(sessions).set({ asistencia }).where(eq(sessions.id, clase.sessionId));
      }
    }
  });

  const plan = eleccion.plan
    ? {
        concepto: texto(eleccion.plan.concepto),
        restantes: eleccion.consumeCupo ? Math.max(0, restante(eleccion.plan) - 1) : null,
        vigenciaHasta: texto(eleccion.plan.fechaVencimiento) || null,
      }
    : null;

  return {
    ...aviso,
    alumno: { id: alumno.id, nombre: alumno.nombre || '' },
    record: stripNulls(row),
    plan,
  };
}

// ---------------------------------------------------------------------------
// Anulación
// ---------------------------------------------------------------------------

export async function anularAsistencia(
  claims: SessionClaims,
  body: AnyRecord
): Promise<{ ok: true; record: AnyRecord; devolvio: boolean }> {
  const recordId = texto(body.recordId);
  if (!recordId) throw new AuthError('Falta el registro a anular');

  const [record] = (await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.id, recordId))) as AnyRecord[];
  if (!record) throw new AuthError('El registro de asistencia no existe', 404);
  if (record.anulado === true) throw new AuthError('Ese registro ya estaba anulado', 409);

  const anuladoEn = new Date().toISOString();
  let devolvio = false;

  await (db as any).transaction(async (tx: any) => {
    await tx
      .update(attendanceRecords)
      .set({ anulado: true, anuladoPor: claims.sub, anuladoEn })
      .where(eq(attendanceRecords.id, recordId));

    // El crédito vuelve al plan del que salió, no al «último» plan del alumno.
    if (record.consumioCupo === true && typeof record.paymentId === 'string') {
      const [plan] = (await tx
        .select()
        .from(payments)
        .where(eq(payments.id, record.paymentId))) as AnyRecord[];
      if (plan) {
        await tx
          .update(payments)
          .set({ clasesUsadas: Math.max(0, Number(plan.clasesUsadas ?? 0) - 1) })
          .where(eq(payments.id, record.paymentId));
        devolvio = true;
      }
    }

    if (record.claseTipo === 'sesion' && typeof record.sessionId === 'string') {
      const [sesion] = (await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, record.sessionId))) as AnyRecord[];
      if (sesion) {
        const asistencia = { ...((sesion.asistencia as Record<string, string>) || {}) };
        delete asistencia[record.alumnoId as string];
        await tx.update(sessions).set({ asistencia }).where(eq(sessions.id, record.sessionId));
      }
    }
  });

  return {
    ok: true,
    record: stripNulls({ ...record, anulado: true, anuladoPor: claims.sub, anuladoEn }),
    devolvio,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Endpoint de asistencia (`/api/asistencia`).
 *
 * `requireAdmin` es la única puerta: un alumno o un profesor recibe 403 aunque
 * haya construido la petición a mano.
 */
export async function handleAttendanceRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    }

    const claims = await requireAdmin(request);

    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    switch (String(body.action ?? '')) {
      case 'register':
        return Response.json(await registrarAsistencia(claims, body));

      case 'void':
        return Response.json(await anularAsistencia(claims, body));

      default:
        return Response.json({ error: `Acción no reconocida: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/asistencia]', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}
