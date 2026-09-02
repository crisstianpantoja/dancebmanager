import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from './index.js';
import { notifications, payments, plans, students } from './schema.js';
import { sanitize, stripNulls, type AnyRecord } from './mapping.js';
import { AuthError, requireSession, type SessionClaims } from './auth.js';

/**
 * Comprobantes de pago: el alumno los reporta, el administrador los revisa.
 *
 * Reglas que sostienen este archivo:
 *  - El alumno reporta un pago suyo y de nadie más: el dueño del cobro sale de
 *    la sesión, nunca del cuerpo de la petición.
 *  - El monto, el cupo y la vigencia los calcula el servidor a partir de la
 *    plantilla del plan. Lo único que aporta el alumno es el comprobante y la
 *    forma en que pagó, así que no puede regalarse un plan ni cambiar su precio.
 *  - Al subir el comprobante el plan queda activo de inmediato y la revisión
 *    queda pendiente. Aprobar confirma el dinero; rechazar devuelve el cobro a
 *    'pendiente' y con ello desactiva el plan.
 *  - Un comprobante rechazado no se borra: queda como historial de lo ocurrido.
 *
 * `/api/data` no acepta escrituras de la colección `payments` desde una cuenta
 * de alumno (ver db/api.ts), así que este endpoint es el único camino.
 */

/** Vigencia por defecto, en meses, de los planes que la usan. */
const VIGENCIA_POR_DEFECTO = 1;

/**
 * Tope del comprobante. `ImageUpload` puede entregar la imagen como data URL,
 * y una petición demasiado grande la rechazaría la plataforma con un error que
 * no dice nada: mejor avisar aquí con un mensaje que se entienda.
 */
const MAX_COMPROBANTE = 3_000_000;

const METODOS = ['tarjeta', 'pse', 'transferencia'] as const;

type Metodo = (typeof METODOS)[number];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function newId(): string {
  return crypto.randomBytes(6).toString('hex').slice(0, 10);
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hoyStr(): string {
  const now = new Date();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mes}-${dia}`;
}

/** Suma meses a una fecha 'YYYY-MM-DD' recortando el día si el mes es más corto. */
function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return fecha;
  const ultimoDia = new Date(y, m - 1 + meses + 1, 0).getDate();
  const destino = new Date(y, m - 1 + meses, Math.min(d, ultimoDia));
  const mes = String(destino.getMonth() + 1).padStart(2, '0');
  const dia = String(destino.getDate()).padStart(2, '0');
  return `${destino.getFullYear()}-${mes}-${dia}`;
}

/**
 * Último día en que el plan sirve. Un mes pagado el 1 de septiembre vale hasta
 * el 30 de septiembre. Es el mismo cálculo que `vencimientoDesde` en
 * src/lib/planes.ts, que sólo lo usa para mostrarlo.
 */
function vencimientoDesde(fecha: string, meses: number): string {
  const siguiente = sumarMeses(fecha, meses);
  const [y, m, d] = siguiente.split('-').map(Number);
  const anterior = new Date(y, m - 1, d - 1);
  const mes = String(anterior.getMonth() + 1).padStart(2, '0');
  const dia = String(anterior.getDate()).padStart(2, '0');
  return `${anterior.getFullYear()}-${mes}-${dia}`;
}

function usaCupo(row: AnyRecord): boolean {
  if (row.modalidad === 'Paquete de clases') return true;
  if (row.modalidad === 'Mensualidad') return row.tipoMensualidad !== 'ilimitada';
  return false;
}

function usaVigencia(row: AnyRecord): boolean {
  return row.modalidad === 'Mensualidad' || row.modalidad === 'Paquete de clases';
}

/** Clases que se guardan en el cobro según la modalidad de la plantilla. */
function clasesDePlan(row: AnyRecord): number {
  if (row.modalidad === 'Clase suelta') return 1;
  if (!usaCupo(row)) return 0;
  const capturadas = Number(row.clasesIncluidas ?? 0);
  return Number.isFinite(capturadas) && capturadas > 0 ? Math.round(capturadas) : 0;
}

/**
 * Meses de vigencia de un cobro que ya existía. Se deducen de lo que se guardó
 * al crearlo; si no alcanza, se usa el valor por defecto.
 */
function mesesDeVigencia(cobro: AnyRecord, hoy: string): number {
  const desde = texto(cobro.fecha) || hoy;
  const hasta = texto(cobro.fechaVencimiento);
  if (!hasta) return VIGENCIA_POR_DEFECTO;
  const [ay, am] = desde.split('-').map(Number);
  const [by, bm] = hasta.split('-').map(Number);
  if (!ay || !by) return VIGENCIA_POR_DEFECTO;
  const meses = (by - ay) * 12 + (bm - am);
  return meses > 0 ? meses : VIGENCIA_POR_DEFECTO;
}

/**
 * Comprobante aceptable: un enlace http(s) o una imagen incrustada. Cualquier
 * otro esquema («javascript:», por ejemplo) se rechaza, porque este valor se
 * termina pintando como enlace en el panel del administrador.
 */
function validarComprobante(value: unknown): string {
  const url = texto(value);
  if (!url) throw new AuthError('Adjunta el comprobante de tu pago');
  if (url.length > MAX_COMPROBANTE) {
    throw new AuthError(
      'La imagen del comprobante es demasiado grande. Sube una más liviana o pega un enlace.'
    );
  }
  const esEnlace = /^https?:\/\//i.test(url);
  const esImagen = /^data:image\/[a-z0-9.+-]+;base64,/i.test(url);
  if (!esEnlace && !esImagen) {
    throw new AuthError('El comprobante debe ser una imagen o un enlace que empiece por https://');
  }
  return url;
}

function validarMetodo(value: unknown): Metodo {
  const raw = texto(value).toLowerCase();
  // El portal ofrece «Bold» y «Transferencia»; en el cobro se guardan como el
  // medio real con el que entró el dinero.
  if (raw === 'bold' || raw === 'tarjeta') return 'tarjeta';
  return (METODOS as readonly string[]).includes(raw) ? (raw as Metodo) : 'transferencia';
}

async function crearNotificaciones(tx: any, rows: AnyRecord[]) {
  if (rows.length === 0) return;
  await tx.insert(notifications).values(rows as any);
}

function notificacion(input: {
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
}): AnyRecord {
  return sanitize(notifications, {
    id: `notif_${newId()}`,
    userId: input.userId,
    title: input.title,
    message: input.message,
    fecha: new Date().toISOString(),
    isRead: false,
    type: input.type,
  });
}

/** Cuentas que deben enterarse de un comprobante nuevo. */
async function administradores(tx: any): Promise<AnyRecord[]> {
  return (await tx
    .select({ id: students.id })
    .from(students)
    .where(eq(students.rol, 'administrador'))) as AnyRecord[];
}

function formatoMoneda(monto: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(monto || 0);
}

// ---------------------------------------------------------------------------
// El alumno reporta su pago
// ---------------------------------------------------------------------------

export interface ReporteResultado {
  ok: true;
  /** El cobro tal como quedó guardado. */
  payment: AnyRecord;
  titulo: string;
  detalle: string;
}

/**
 * El alumno sube el comprobante de un plan del catálogo o de un cobro que el
 * administrador le había dejado pendiente.
 *
 * En ambos casos el cobro queda 'pagado' —el plan sirve desde ya— con la
 * revisión pendiente.
 */
export async function reportarPago(
  claims: SessionClaims,
  body: AnyRecord
): Promise<ReporteResultado> {
  if (claims.scope !== 'student' || claims.rol !== 'alumno') {
    throw new AuthError('Sólo un alumno puede reportar el pago de su plan', 403);
  }

  const [alumno] = (await db
    .select()
    .from(students)
    .where(eq(students.id, claims.sub))) as AnyRecord[];
  if (!alumno) throw new AuthError('Tu cuenta no existe', 404);
  if (alumno.activo === false) {
    throw new AuthError('Tu cuenta está inactiva. Contacta al administrador.', 403);
  }

  const comprobanteUrl = validarComprobante(body.comprobanteUrl);
  const metodoPago = validarMetodo(body.metodoPago);
  const nota = texto(body.notas).slice(0, 300);
  const ahora = new Date().toISOString();
  const hoy = hoyStr();

  const paymentId = texto(body.paymentId);
  const planId = texto(body.planId);
  if (!paymentId && !planId) {
    throw new AuthError('Elige el plan o la clase que pagaste');
  }

  // Dos comprobantes del mismo cobro sin revisar sólo confunden al
  // administrador: el segundo se rechaza con un mensaje claro.
  const yaEnviados = (await db
    .select()
    .from(payments)
    .where(and(eq(payments.alumnoId, claims.sub), eq(payments.verificacion, 'pendiente')))) as AnyRecord[];

  let resultado: AnyRecord | null = null;
  let titulo = '';
  let detalle = '';

  if (paymentId) {
    const [cobro] = (await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))) as AnyRecord[];

    if (!cobro || cobro.alumnoId !== claims.sub) {
      throw new AuthError('Ese cobro no existe', 404);
    }
    if (cobro.verificacion === 'pendiente') {
      throw new AuthError('Ya enviaste un comprobante de ese cobro. Espera la revisión.', 409);
    }
    if (cobro.estado === 'pagado') {
      throw new AuthError('Ese cobro ya está pagado', 409);
    }

    // La vigencia de un cobro que nunca se pagó empieza a contar hoy, no en la
    // fecha en que el administrador lo registró.
    const fechaVencimiento = usaVigencia(cobro)
      ? vencimientoDesde(hoy, mesesDeVigencia(cobro, hoy))
      : (cobro.fechaVencimiento as string | null) ?? null;

    const cambios: AnyRecord = {
      estado: 'pagado',
      verificacion: 'pendiente',
      origen: 'alumno',
      metodoPago,
      comprobanteUrl,
      comprobanteFecha: ahora,
      fecha: hoy,
      fechaVencimiento,
      revisadoPor: null,
      revisadoEn: null,
      notas: nota,
    };

    await (db as any).transaction(async (tx: any) => {
      await tx.update(payments).set(cambios).where(eq(payments.id, paymentId));
      const admins = await administradores(tx);
      await crearNotificaciones(
        tx,
        admins.map((admin) =>
          notificacion({
            userId: admin.id as string,
            title: 'Comprobante por verificar',
            message: `${alumno.nombre || 'Un alumno'} reportó el pago de "${cobro.concepto}" (${formatoMoneda(
              Number(cobro.monto ?? 0)
            )}). El plan ya está activo, falta verificar el comprobante.`,
            type: 'warning',
          })
        )
      );
    });

    resultado = { ...cobro, ...cambios };
    titulo = 'Comprobante enviado';
    detalle = `Tu plan "${cobro.concepto}" ya está activo. El administrador verificará el comprobante.`;
  } else {
    const [plantilla] = (await db.select().from(plans).where(eq(plans.id, planId))) as AnyRecord[];
    if (!plantilla) throw new AuthError('Ese plan ya no está disponible', 404);
    if (plantilla.modalidad === 'Matrícula') {
      throw new AuthError('La matrícula la registra el administrador', 400);
    }

    if (yaEnviados.some((p) => p.planId === planId)) {
      throw new AuthError(
        'Ya enviaste un comprobante de ese plan y está en revisión. Espera la respuesta del administrador.',
        409
      );
    }

    const meses = Number(plantilla.vigenciaMeses ?? 0) || VIGENCIA_POR_DEFECTO;
    const row = sanitize(payments, {
      id: `pay_${newId()}`,
      alumnoId: claims.sub,
      planId,
      modalidad: plantilla.modalidad,
      tipoMensualidad:
        plantilla.modalidad === 'Mensualidad' ? plantilla.tipoMensualidad || 'con_tope' : null,
      concepto: plantilla.nombre,
      // El precio sale de la plantilla: el alumno no lo propone.
      monto: Number(plantilla.monto ?? 0),
      fecha: hoy,
      fechaVencimiento: usaVigencia(plantilla) ? vencimientoDesde(hoy, meses) : null,
      estado: 'pagado',
      verificacion: 'pendiente',
      origen: 'alumno',
      metodoPago,
      comprobanteUrl,
      comprobanteFecha: ahora,
      clasesIncluidas: clasesDePlan(plantilla),
      clasesUsadas: 0,
      notas: nota,
    });

    await (db as any).transaction(async (tx: any) => {
      await tx.insert(payments).values(row as any);
      const admins = await administradores(tx);
      await crearNotificaciones(
        tx,
        admins.map((admin) =>
          notificacion({
            userId: admin.id as string,
            title: 'Comprobante por verificar',
            message: `${alumno.nombre || 'Un alumno'} reportó el pago de "${plantilla.nombre}" (${formatoMoneda(
              Number(plantilla.monto ?? 0)
            )}). El plan ya está activo, falta verificar el comprobante.`,
            type: 'warning',
          })
        )
      );
    });

    resultado = row;
    titulo = 'Comprobante enviado';
    detalle =
      plantilla.modalidad === 'Clase suelta'
        ? 'Tu clase quedó registrada. El administrador verificará el comprobante.'
        : `Tu plan "${plantilla.nombre}" ya está activo. El administrador verificará el comprobante.`;
  }

  return { ok: true, payment: stripNulls(resultado as AnyRecord), titulo, detalle };
}

// ---------------------------------------------------------------------------
// El administrador revisa
// ---------------------------------------------------------------------------

export interface RevisionResultado {
  ok: true;
  payment: AnyRecord;
  titulo: string;
  detalle: string;
}

/**
 * Aprobar confirma que el dinero llegó. Rechazar devuelve el cobro a
 * 'pendiente', con lo que el plan deja de estar activo, y el comprobante queda
 * guardado para que se pueda consultar lo que se envió.
 */
export async function revisarPago(
  claims: SessionClaims,
  body: AnyRecord
): Promise<RevisionResultado> {
  if (claims.rol !== 'administrador' && claims.rol !== 'profesor') {
    throw new AuthError('Sólo el administrador puede verificar comprobantes', 403);
  }

  const paymentId = texto(body.paymentId);
  if (!paymentId) throw new AuthError('Falta el comprobante a revisar');

  const decision = texto(body.decision);
  if (decision !== 'aprobar' && decision !== 'rechazar') {
    throw new AuthError('La revisión sólo puede aprobar o rechazar');
  }

  const [cobro] = (await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))) as AnyRecord[];
  if (!cobro) throw new AuthError('Ese cobro no existe', 404);
  if (cobro.verificacion !== 'pendiente') {
    throw new AuthError('Ese comprobante ya fue revisado', 409);
  }

  const nota = texto(body.nota).slice(0, 300);
  const revisadoEn = new Date().toISOString();

  const cambios: AnyRecord =
    decision === 'aprobar'
      ? {
          estado: 'pagado',
          verificacion: 'aprobado',
          revisadoPor: claims.sub,
          revisadoEn,
          notas: nota || texto(cobro.notas),
        }
      : {
          // Sin pago verificado el plan no sigue activo.
          estado: 'pendiente',
          verificacion: 'rechazado',
          revisadoPor: claims.sub,
          revisadoEn,
          notas: nota || 'Comprobante rechazado. Sube uno válido o comunícate con el administrador.',
        };

  await (db as any).transaction(async (tx: any) => {
    await tx.update(payments).set(cambios).where(eq(payments.id, paymentId));
    await crearNotificaciones(tx, [
      notificacion({
        userId: cobro.alumnoId as string,
        title: decision === 'aprobar' ? 'Pago verificado' : 'Comprobante rechazado',
        message:
          decision === 'aprobar'
            ? `Tu pago de "${cobro.concepto}" quedó verificado. Tu plan sigue activo.`
            : `Tu comprobante de "${cobro.concepto}" fue rechazado. ${cambios.notas}`,
        type: decision === 'aprobar' ? 'success' : 'warning',
      }),
    ]);
  });

  return {
    ok: true,
    payment: stripNulls({ ...cobro, ...cambios }),
    titulo: decision === 'aprobar' ? 'Pago verificado' : 'Comprobante rechazado',
    detalle:
      decision === 'aprobar'
        ? `Se confirmó el pago de "${cobro.concepto}".`
        : `El cobro de "${cobro.concepto}" volvió a quedar pendiente.`,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Endpoint de comprobantes (`/api/pagos`).
 *
 * Cada acción comprueba por sí misma quién la puede ejecutar: reportar es del
 * alumno dueño del cobro, revisar es del administrador.
 */
export async function handlePagosRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    }

    const claims = await requireSession(request);
    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    switch (texto(body.action)) {
      case 'submit':
        return Response.json(await reportarPago(claims, body));

      case 'review':
        return Response.json(await revisarPago(claims, body));

      default:
        return Response.json({ error: `Acción no reconocida: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/pagos]', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}
