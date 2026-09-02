import type {
  AttendanceRecord,
  ClaseCategoria,
  Payment,
  PlanModalidad,
  PlanTemplate,
  TipoMensualidad,
} from '../types';
import { formatDateStr } from './utils';

/**
 * Reglas de los planes, tal como las ve el navegador: vigencia, cupo, avisos y
 * armado del cobro a partir de una plantilla.
 *
 * El descuento real al registrar una asistencia NO se decide aquí, sino en
 * `db/attendance.ts`, que es el único autorizado a escribir. Este archivo
 * calcula lo mismo sólo para mostrarlo; si ambos difirieran, manda el servidor.
 */

// ---------------------------------------------------------------------------
// Forma de cada modalidad
// ---------------------------------------------------------------------------

export const MODALIDADES: PlanModalidad[] = [
  'Mensualidad',
  'Paquete de clases',
  'Clase suelta',
  'Matrícula',
];

/** Vigencia por defecto, en meses, de los planes que la usan. */
export const VIGENCIA_POR_DEFECTO = 1;

/** Umbral a partir del cual se avisa al alumno que le quedan pocas clases. */
export const AVISO_POCAS_CLASES = 2;

/** Días de vigencia restantes que disparan el aviso de renovación. */
export const AVISO_DIAS_VIGENCIA = 3;

interface PlanShape {
  modalidad: PlanModalidad;
  tipoMensualidad?: TipoMensualidad;
}

/** Una mensualidad de acceso libre: valida vigencia, pero no descuenta cupo. */
export function esIlimitada(plan: PlanShape): boolean {
  return plan.modalidad === 'Mensualidad' && plan.tipoMensualidad === 'ilimitada';
}

/** ¿El plan lleva un número de clases incluidas que se va descontando? */
export function usaCupo(plan: PlanShape): boolean {
  if (plan.modalidad === 'Paquete de clases') return true;
  if (plan.modalidad === 'Mensualidad') return plan.tipoMensualidad !== 'ilimitada';
  return false;
}

/** ¿Se pide vigencia en el formulario? La clase suelta y la matrícula no la usan. */
export function usaVigencia(plan: PlanShape): boolean {
  return plan.modalidad === 'Mensualidad' || plan.modalidad === 'Paquete de clases';
}

/**
 * Modalidades contra las que se puede cobrar una asistencia. La clase suelta se
 * asigna al alumno pero no funciona como saldo, y la matrícula es un pago único
 * de inscripción.
 */
export function esCobrable(plan: PlanShape): boolean {
  return plan.modalidad === 'Mensualidad' || plan.modalidad === 'Paquete de clases';
}

/** Clases que se guardan en el plan según su modalidad. */
export function clasesDePlan(plan: PlanShape, capturadas: number): number {
  if (plan.modalidad === 'Clase suelta') return 1;
  if (!usaCupo(plan)) return 0;
  return Number.isFinite(capturadas) && capturadas > 0 ? Math.round(capturadas) : 0;
}

/** Texto de la tarjeta del plan: refleja la modalidad real, no una fija. */
export function describirCupo(plan: PlanTemplate): string | null {
  if (esIlimitada(plan)) return 'Clases ilimitadas';
  if (plan.modalidad === 'Clase suelta') return '1 clase';
  if (plan.modalidad === 'Matrícula') return null;
  if (!plan.clasesIncluidas) return null;
  return `${plan.clasesIncluidas} clases incluidas`;
}

export function describirVigencia(plan: PlanTemplate): string | null {
  if (!usaVigencia(plan)) return null;
  const meses = plan.vigenciaMeses || VIGENCIA_POR_DEFECTO;
  return meses === 1 ? 'Vigencia de 1 mes' : `Vigencia de ${meses} meses`;
}

// ---------------------------------------------------------------------------
// Fechas y vigencia
// ---------------------------------------------------------------------------

export function hoyStr(): string {
  const now = new Date();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mes}-${dia}`;
}

/** Suma meses a una fecha 'YYYY-MM-DD' recortando el día si el mes es más corto. */
export function sumarMeses(fecha: string, meses: number): string {
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
 * el 30 de septiembre, no hasta el 1 de octubre: es el mes calendario completo.
 */
export function vencimientoDesde(fecha: string, meses: number): string {
  const siguiente = sumarMeses(fecha, meses);
  const [y, m, d] = siguiente.split('-').map(Number);
  const anterior = new Date(y, m - 1, d - 1);
  const mes = String(anterior.getMonth() + 1).padStart(2, '0');
  const dia = String(anterior.getDate()).padStart(2, '0');
  return `${anterior.getFullYear()}-${mes}-${dia}`;
}

export function estaVigente(payment: Payment, hoy = hoyStr()): boolean {
  if (!payment.fechaVencimiento) return true;
  return payment.fechaVencimiento >= hoy;
}

/** Días que faltan para que venza. Negativo si ya venció. */
export function diasParaVencer(fechaVencimiento: string, hoy = hoyStr()): number {
  const [ay, am, ad] = fechaVencimiento.split('-').map(Number);
  const [by, bm, bd] = hoy.split('-').map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((a - b) / 86400000);
}

export function cupoRestante(payment: Payment): number {
  if (!usaCupo(payment)) return 0;
  return Math.max(0, (payment.clasesIncluidas || 0) - (payment.clasesUsadas || 0));
}

// ---------------------------------------------------------------------------
// Planes del alumno
// ---------------------------------------------------------------------------

/** Pagos del alumno contra los que se puede cobrar una clase. */
export function planesCobrables(payments: Payment[], alumnoId: string): Payment[] {
  return payments.filter((p) => p.alumnoId === alumnoId && p.estado === 'pagado' && esCobrable(p));
}

/**
 * Orden en que se consumen los planes: primero los cupos limitados con saldo,
 * del más antiguo al más nuevo, y el acceso ilimitado al final. Así el paquete
 * que va a vencer se aprovecha antes que la mensualidad libre.
 */
export function ordenDeConsumo(payments: Payment[], alumnoId: string, hoy = hoyStr()): Payment[] {
  const vigentes = planesCobrables(payments, alumnoId).filter((p) => estaVigente(p, hoy));
  const conCupo = vigentes
    .filter((p) => usaCupo(p) && cupoRestante(p) > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ilimitados = vigentes
    .filter((p) => esIlimitada(p))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return [...conCupo, ...ilimitados];
}

/** Planes que el alumno ve como activos: vigentes y con saldo (o ilimitados). */
export function planesActivos(payments: Payment[], alumnoId: string, hoy = hoyStr()): Payment[] {
  return planesCobrables(payments, alumnoId).filter(
    (p) => estaVigente(p, hoy) && (esIlimitada(p) || cupoRestante(p) > 0)
  );
}

// ---------------------------------------------------------------------------
// Comprobantes subidos por el alumno
// ---------------------------------------------------------------------------

/**
 * El alumno subió el comprobante y nadie lo ha revisado todavía.
 *
 * El plan ya está activo: la revisión confirma el dinero, no habilita el
 * acceso. Un comprobante rechazado sí devuelve el cobro a 'pendiente'.
 */
export function esperaVerificacion(payment: Payment): boolean {
  return payment.verificacion === 'pendiente';
}

export function fueRechazado(payment: Payment): boolean {
  return payment.verificacion === 'rechazado';
}

/** Bandeja del administrador: comprobantes por revisar, el más nuevo primero. */
export function pagosPorVerificar(payments: Payment[]): Payment[] {
  return payments
    .filter(esperaVerificacion)
    .sort((a, b) =>
      (b.comprobanteFecha || b.fecha).localeCompare(a.comprobanteFecha || a.fecha)
    );
}

/** Cobros del alumno que quedaron pendientes de pagar (incluye los rechazados). */
export function cobrosPendientes(payments: Payment[], alumnoId: string): Payment[] {
  return payments.filter((p) => p.alumnoId === alumnoId && p.estado === 'pendiente');
}

/**
 * Planes del catálogo que un alumno puede reportar como pagados. La matrícula
 * queda fuera: es un cobro de inscripción que registra el administrador.
 */
export function planesReportables(plans: PlanTemplate[]): PlanTemplate[] {
  return plans.filter((plan) => plan.modalidad !== 'Matrícula');
}

// ---------------------------------------------------------------------------
// Avisos para el alumno
// ---------------------------------------------------------------------------

export interface AvisoPlan {
  id: string;
  nivel: 'info' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
}

/**
 * Avisos informativos del portal del alumno. Nunca bloquean nada: el registro
 * de asistencia lo hace únicamente el administrador.
 */
export function avisosDePlan(payments: Payment[], alumnoId: string, hoy = hoyStr()): AvisoPlan[] {
  const avisos: AvisoPlan[] = [];

  for (const plan of planesCobrables(payments, alumnoId)) {
    const vigente = estaVigente(plan, hoy);

    if (esIlimitada(plan)) {
      if (!vigente) {
        avisos.push({
          id: plan.id,
          nivel: 'error',
          titulo: 'Mensualidad vencida',
          mensaje: `Tu plan "${plan.concepto}" venció el ${formatDateStr(plan.fechaVencimiento!)}. Renuévalo para seguir tomando clases.`,
        });
        continue;
      }
      if (plan.fechaVencimiento) {
        const dias = diasParaVencer(plan.fechaVencimiento, hoy);
        if (dias <= AVISO_DIAS_VIGENCIA) {
          avisos.push({
            id: plan.id,
            nivel: dias <= 1 ? 'error' : 'warning',
            titulo: dias <= 0 ? 'Tu mensualidad vence hoy' : `Tu mensualidad vence en ${dias} día${dias === 1 ? '' : 's'}`,
            mensaje: `"${plan.concepto}" está vigente hasta el ${formatDateStr(plan.fechaVencimiento)}. Renueva para no perder el acceso.`,
          });
        }
      }
      continue;
    }

    if (!usaCupo(plan)) continue;

    const restantes = cupoRestante(plan);

    if (!vigente) {
      if (restantes > 0) {
        avisos.push({
          id: plan.id,
          nivel: 'error',
          titulo: 'Plan vencido con clases sin usar',
          mensaje: `A "${plan.concepto}" le quedaban ${restantes} clase${restantes === 1 ? '' : 's'}, pero su vigencia terminó el ${formatDateStr(plan.fechaVencimiento!)}. Renueva para volver a usarlo.`,
        });
      }
      continue;
    }

    if (restantes === 0) {
      avisos.push({
        id: plan.id,
        nivel: 'error',
        titulo: 'Te quedaste sin clases',
        mensaje: `Ya usaste todas las clases de "${plan.concepto}". Renueva para seguir asistiendo.`,
      });
    } else if (restantes === 1) {
      avisos.push({
        id: plan.id,
        nivel: 'error',
        titulo: 'Te queda 1 clase',
        mensaje: `Te queda 1 clase de "${plan.concepto}". Renueva para no quedarte sin cupo.`,
      });
    } else if (restantes <= AVISO_POCAS_CLASES) {
      avisos.push({
        id: plan.id,
        nivel: 'warning',
        titulo: `Te quedan ${restantes} clases`,
        mensaje: `Te quedan ${restantes} clases de tu plan "${plan.concepto}". Renueva para no quedarte sin cupo.`,
      });
    }
  }

  return avisos;
}

// ---------------------------------------------------------------------------
// Cobro a partir de una plantilla
// ---------------------------------------------------------------------------

/**
 * Convierte una plantilla en el cobro del alumno, copiando lo que el registro
 * de asistencia necesita: tipo de mensualidad, cupo y fecha de vencimiento.
 *
 * La vigencia se congela al cobrar: editar el plan después no mueve la de los
 * alumnos que ya pagaron.
 */
export function cobroDesdePlan(
  plan: PlanTemplate,
  alumnoId: string,
  options: { id: string; fecha?: string; estado?: Payment['estado']; notas?: string } 
): Payment {
  const fecha = options.fecha || hoyStr();
  const meses = plan.vigenciaMeses || VIGENCIA_POR_DEFECTO;

  return {
    id: options.id,
    alumnoId,
    planId: plan.id,
    modalidad: plan.modalidad,
    tipoMensualidad: plan.modalidad === 'Mensualidad' ? plan.tipoMensualidad || 'con_tope' : undefined,
    concepto: plan.nombre,
    monto: plan.monto,
    fecha,
    fechaVencimiento: usaVigencia(plan) ? vencimientoDesde(fecha, meses) : undefined,
    estado: options.estado || 'pagado',
    clasesIncluidas: clasesDePlan(plan, plan.clasesIncluidas),
    clasesUsadas: 0,
    notas: options.notas || '',
  };
}

// ---------------------------------------------------------------------------
// Clases programadas: identidad y categorías
// ---------------------------------------------------------------------------

/**
 * Identidad de una clase programada, para ligarle la asistencia y detectar el
 * doble escaneo. Las clases regulares de una academia no tienen fila propia
 * (se derivan de sus días fijos), así que su clave se arma con fecha y hora,
 * igual que en `academyLogs`.
 */
export function claseKeyAcademia(academiaId: string, fecha: string, hora: string): string {
  return `A:${academiaId}:${fecha}:${hora}`;
}

export function claseKeySesion(sessionId: string): string {
  return `S:${sessionId}`;
}

export function claseKeyEvento(eventId: string): string {
  return `E:${eventId}`;
}

/**
 * Identidad de una clase registrada a mano, que no existe en la agenda: una
 * privada, o una de academia que no estaba programada. Se arma con el alumno,
 * la fecha y la hora porque es lo único que la identifica, y eso basta para que
 * el mismo alumno no quede registrado dos veces en la misma clase.
 *
 * El servidor la arma igual en `db/attendance.ts`; aquí sirve para mostrarla.
 */
export function claseKeyManual(alumnoId: string, fecha: string, hora: string): string {
  return `M:${alumnoId}:${fecha}:${hora}`;
}

export const CATEGORIAS: ClaseCategoria[] = [
  'Básica',
  'Intermedia',
  'Avanzada',
  'Privada',
  'Evento',
  'Taller',
];

/**
 * Categorías que el administrador puede elegir al registrar una clase a mano.
 * Los eventos y talleres se quedan fuera porque sí viven en la agenda.
 */
export const CATEGORIAS_MANUALES: ClaseCategoria[] = ['Privada', 'Básica', 'Intermedia', 'Avanzada'];

/** Un color por categoría, para que el calendario se lea de un vistazo. */
export const CATEGORIA_ESTILO: Record<ClaseCategoria, { color: string; badge: string; punto: string }> = {
  'Básica': { color: '#7CC3FF', badge: 'bg-accent-academy/20 text-accent-academy', punto: 'bg-accent-academy' },
  'Intermedia': { color: '#F5B841', badge: 'bg-pending/20 text-pending', punto: 'bg-pending' },
  'Avanzada': { color: '#F72585', badge: 'bg-magenta/20 text-magenta', punto: 'bg-magenta' },
  'Privada': { color: '#B32E7D', badge: 'bg-magenta-dark/30 text-magenta', punto: 'bg-magenta-dark' },
  'Evento': { color: '#B084F5', badge: 'bg-accent-dj/20 text-accent-dj', punto: 'bg-accent-dj' },
  'Taller': { color: '#37D9A6', badge: 'bg-success/20 text-success', punto: 'bg-success' },
};

export function estiloCategoria(categoria?: ClaseCategoria) {
  return CATEGORIA_ESTILO[categoria || 'Básica'];
}

/** Nivel de la academia → categoría del calendario. */
export function categoriaDeNivel(nivel?: string): ClaseCategoria {
  if (nivel === 'Intermedia' || nivel === 'Intermedio') return 'Intermedia';
  if (nivel === 'Avanzada' || nivel === 'Avanzado') return 'Avanzada';
  return 'Básica';
}

/**
 * Categoría con la que se abre el registro manual de un alumno concreto.
 *
 * El carnet dice de qué es el alumno: quien tiene plan privado toma clases uno
 * a uno, así que su clase suelta se asume privada. Para el de academia, en
 * cambio, se propone su propio nivel, que es la clase a la que entraría.
 */
export function categoriaSugerida(alumno: {
  tipo?: 'academia' | 'privada' | 'ambas';
  nivel?: string;
}): ClaseCategoria {
  if (alumno.tipo === 'privada' || alumno.tipo === 'ambas') return 'Privada';
  return categoriaDeNivel(alumno.nivel);
}

/** Título por defecto de una clase registrada a mano. */
export function tituloManual(categoria: ClaseCategoria): string {
  return categoria === 'Privada' ? 'Clase privada' : `Clase ${categoria.toLowerCase()}`;
}

/** Asistencias vigentes (sin anular) de un alumno, de la más reciente atrás. */
export function asistenciasDeAlumno(records: AttendanceRecord[], alumnoId: string): AttendanceRecord[] {
  return records
    .filter((r) => r.alumnoId === alumnoId && !r.anulado)
    .sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`));
}
