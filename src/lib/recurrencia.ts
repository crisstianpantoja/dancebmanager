import type {
  ClaseCategoria,
  ClaseEstado,
  ClaseNivel,
  ClassOccurrence,
  ClassSeries,
  Frecuencia,
  ReglaRecurrencia,
} from '../types';

/**
 * Reglas de la programación recurrente: qué fechas genera una serie, en qué
 * estado se muestra cada clase y cuántos cupos le quedan.
 *
 * Este archivo es puro —no toca la base de datos ni el DOM— y lo importan las
 * dos orillas: la pantalla de programación, para mostrar de antemano las clases
 * que se van a crear, y `db/clases.ts`, que es quien realmente las escribe. Es
 * a propósito: si el cálculo estuviera duplicado, la vista previa podría
 * prometer unas fechas y el servidor guardar otras.
 *
 * Toda la aritmética de fechas se hace en UTC sobre cadenas 'YYYY-MM-DD', para
 * que el resultado no cambie según la zona horaria del navegador o de la
 * función que la ejecute. Las horas del reloj (¿ya empezó la clase?) sí usan la
 * hora local, porque ahí lo que importa es el reloj de quien mira.
 */

const DIA_MS = 86400000;
const SEMANA_MS = 7 * DIA_MS;

/** Tope de clases que puede generar una sola serie. Corta rangos absurdos. */
export const LIMITE_CLASES = 400;

/** Nombres de los días, empezando en domingo para indexar con `getDay()`. */
export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/** Orden de lectura del horario semanal: la semana de la academia empieza el lunes. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** Niveles sugeridos. El campo acepta cualquier texto además de estos. */
export const NIVELES_CLASE: ClaseNivel[] = ['Básico', 'Intermedio', 'Avanzado', 'Grupo'];

export const FRECUENCIAS: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: 'semanal', etiqueta: 'Todas las semanas' },
  { valor: 'cada_2_semanas', etiqueta: 'Cada 2 semanas' },
  { valor: 'personalizada', etiqueta: 'Personalizada' },
];

export const ETIQUETA_ESTADO: Record<ClaseEstado, string> = {
  programada: 'Programada',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

/** Un color por estado, para que el calendario se lea de un vistazo. */
export const ESTILO_ESTADO: Record<ClaseEstado, string> = {
  programada: 'bg-accent-academy/20 text-accent-academy',
  en_curso: 'bg-success/20 text-success',
  finalizada: 'bg-ink-muted/20 text-ink-muted',
  cancelada: 'bg-error/20 text-error',
};

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

export function esFechaValida(fecha: unknown): fecha is string {
  return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

export function esHoraValida(hora: unknown): hora is string {
  return typeof hora === 'string' && /^\d{2}:\d{2}$/.test(hora);
}

/** 'YYYY-MM-DD' → milisegundos epoch a medianoche UTC. */
function aUTC(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Milisegundos epoch → 'YYYY-MM-DD' leído en UTC. */
function deUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha. 0=Dom … 6=Sáb. */
export function diaSemanaDe(fecha: string): number {
  return new Date(aUTC(fecha)).getUTCDay();
}

export function sumarDias(fecha: string, dias: number): string {
  return deUTC(aUTC(fecha) + dias * DIA_MS);
}

/** Día anterior. Se usa para cerrar una serie justo antes de una fecha. */
export function diaAnterior(fecha: string): string {
  return sumarDias(fecha, -1);
}

/** Fecha de hoy en 'YYYY-MM-DD', según el reloj de quien ejecuta. */
export function hoyISO(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/** Lunes de la semana a la que pertenece la fecha. */
function lunesDeLaSemana(fecha: string): string {
  const dia = diaSemanaDe(fecha);
  // Domingo (0) cierra la semana que empezó el lunes anterior, seis días antes.
  return sumarDias(fecha, -((dia + 6) % 7));
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function horaDeMinutos(minutos: number): string {
  const dentroDelDia = ((minutos % 1440) + 1440) % 1440;
  const h = String(Math.floor(dentroDelDia / 60)).padStart(2, '0');
  const m = String(dentroDelDia % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Minutos entre dos horas del mismo día. Una clase que cruza la medianoche
 * (23:00 → 00:30) se lee como si terminara al día siguiente.
 */
export function duracionEntre(horaInicio: string, horaFin: string): number {
  if (!esHoraValida(horaInicio) || !esHoraValida(horaFin)) return 0;
  const inicio = minutosDeHora(horaInicio);
  const fin = minutosDeHora(horaFin);
  return fin >= inicio ? fin - inicio : fin + 1440 - inicio;
}

/** Hora de finalización a partir del inicio y la duración en minutos. */
export function horaFinDesde(horaInicio: string, duracion: number): string {
  if (!esHoraValida(horaInicio)) return '';
  return horaDeMinutos(minutosDeHora(horaInicio) + Math.max(0, Math.round(duracion)));
}

// ---------------------------------------------------------------------------
// Generación de fechas
// ---------------------------------------------------------------------------

/** Semanas entre repeticiones según la frecuencia elegida. Nunca menor que 1. */
export function intervaloDeSemanas(regla: {
  frecuencia: Frecuencia;
  intervaloSemanas?: number;
}): number {
  if (regla.frecuencia === 'cada_2_semanas') return 2;
  if (regla.frecuencia === 'personalizada') {
    const n = Math.round(Number(regla.intervaloSemanas));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 1;
  }
  return 1;
}

/**
 * Fechas que genera una regla de recurrencia, en orden y sin repetidas.
 *
 * El intervalo se cuenta en semanas completas desde el lunes de la semana en
 * que arranca la serie, no desde la fecha de inicio: así una serie de lunes y
 * jueves cada dos semanas mantiene juntos los dos días de la misma semana en
 * lugar de irse desfasando uno respecto del otro.
 *
 * Devuelve una lista vacía si falta un dato o si el rango está al revés, en vez
 * de inventar fechas.
 */
export function fechasDeRecurrencia(regla: ReglaRecurrencia, limite = LIMITE_CLASES): string[] {
  const dias = [...new Set((regla.diasSemana || []).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (dias.length === 0) return [];
  if (!esFechaValida(regla.fechaInicio) || !esFechaValida(regla.fechaFin)) return [];
  if (regla.fechaFin < regla.fechaInicio) return [];

  const paso = intervaloDeSemanas(regla);
  const anclaMs = aUTC(lunesDeLaSemana(regla.fechaInicio));
  const finMs = aUTC(regla.fechaFin);
  const fechas: string[] = [];

  for (let semana = 0; fechas.length < limite; semana += paso) {
    const semanaMs = anclaMs + semana * SEMANA_MS;
    // Ningún día de una semana que empieza después del final puede entrar.
    if (semanaMs > finMs) break;
    for (const dia of dias) {
      const fecha = deUTC(semanaMs + ((dia + 6) % 7) * DIA_MS);
      if (fecha < regla.fechaInicio || fecha > regla.fechaFin) continue;
      fechas.push(fecha);
    }
  }

  return fechas.slice(0, limite).sort();
}

// ---------------------------------------------------------------------------
// Estado y cupos
// ---------------------------------------------------------------------------

/**
 * Estado con el que se muestra una clase.
 *
 * Sólo 'cancelada' está guardada; «en curso» y «finalizada» se deducen del
 * reloj de quien mira, de modo que el calendario está al día sin que nada
 * tenga que recorrer la tabla cada noche.
 */
export function estadoDeClase(
  clase: Pick<ClassOccurrence, 'fecha' | 'horaInicio' | 'horaFin' | 'estado'>,
  ahora: Date = new Date()
): ClaseEstado {
  if (clase.estado === 'cancelada') return 'cancelada';
  if (!esFechaValida(clase.fecha) || !esHoraValida(clase.horaInicio)) return 'programada';

  const [y, m, d] = clase.fecha.split('-').map(Number);
  const inicioMin = minutosDeHora(clase.horaInicio);
  const inicio = new Date(y, m - 1, d, Math.floor(inicioMin / 60), inicioMin % 60);
  // Sin hora de finalización se asume una hora, que es lo que dura una clase
  // normal: sin ella, «en curso» duraría un instante y nunca se vería.
  const minutos = esHoraValida(clase.horaFin)
    ? duracionEntre(clase.horaInicio, clase.horaFin)
    : 60;
  const fin = new Date(inicio.getTime() + minutos * 60000);

  if (ahora < inicio) return 'programada';
  if (ahora <= fin) return 'en_curso';
  return 'finalizada';
}

/** Cupos libres. `null` cuando la clase no tiene tope de alumnos. */
export function cuposDisponibles(
  clase: Pick<ClassOccurrence, 'cupoMaximo' | 'alumnoIds'>
): number | null {
  if (!clase.cupoMaximo || clase.cupoMaximo <= 0) return null;
  return Math.max(0, clase.cupoMaximo - (clase.alumnoIds?.length || 0));
}

/** Texto corto de ocupación: «12 / 20 cupos» o «Sin límite». */
export function describirCupos(
  clase: Pick<ClassOccurrence, 'cupoMaximo' | 'alumnoIds'>
): string {
  const inscritos = clase.alumnoIds?.length || 0;
  const libres = cuposDisponibles(clase);
  if (libres === null) return `${inscritos} inscritos · sin límite`;
  return `${libres} de ${clase.cupoMaximo} cupos libres`;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** «Todos los lunes», «Lunes y jueves cada 2 semanas»… */
export function describirRecurrencia(regla: {
  diasSemana: number[];
  frecuencia: Frecuencia;
  intervaloSemanas?: number;
}): string {
  const dias = ORDEN_SEMANA.filter((d) => regla.diasSemana?.includes(d)).map(
    (d) => DIAS_SEMANA[d]
  );
  if (dias.length === 0) return 'Sin días definidos';

  const lista =
    dias.length === 1
      ? dias[0]
      : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;

  if (regla.frecuencia === 'semanal') {
    return dias.length === 1 ? `Todos los ${lista.toLowerCase()}` : `Cada ${lista.toLowerCase()}`;
  }
  const paso = intervaloDeSemanas(regla);
  return `${lista} · cada ${paso} semanas`;
}

/** Nivel de la programación → categoría con la que se pinta en la agenda. */
export function categoriaDeNivelClase(nivel?: string): ClaseCategoria {
  switch ((nivel || '').trim().toLowerCase()) {
    case 'intermedio':
    case 'intermedia':
      return 'Intermedia';
    case 'avanzado':
    case 'avanzada':
      return 'Avanzada';
    case 'grupo':
      return 'Grupo';
    case 'taller':
      return 'Taller';
    default:
      return 'Básica';
  }
}

/** Nombres de los profesores a cargo, en el orden en que se eligieron. */
export function nombresDeProfesores(
  profesorIds: string[] | undefined,
  profesores: { id: string; nombre: string }[]
): string {
  if (!profesorIds || profesorIds.length === 0) return '';
  return profesorIds
    .map((id) => profesores.find((p) => p.id === id)?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre))
    .join(', ');
}

/** Datos de la serie que se copian a cada clase que genera. */
export function datosHeredables(serie: ClassSeries) {
  return {
    nombre: serie.nombre,
    nivel: serie.nivel,
    profesorIds: serie.profesorIds || [],
    horaInicio: serie.horaInicio,
    horaFin: serie.horaFin,
    duracion: serie.duracion,
    sede: serie.sede,
    salon: serie.salon,
    cupoMaximo: serie.cupoMaximo,
    academiaId: serie.academiaId,
    alumnoIds: serie.alumnoIds || [],
    notas: serie.notas,
  };
}
