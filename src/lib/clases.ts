import type {
  Academy,
  ClaseCategoria,
  ClaseEstado,
  ClaseOrigenTipo,
  ClassOccurrence,
  DanceEvent,
  Session,
} from '../types';
import {
  categoriaDeNivel,
  claseKeyAcademia,
  claseKeyEvento,
  claseKeyProgramada,
  claseKeySesion,
} from './planes';
import { categoriaDeNivelClase, estadoDeClase } from './recurrencia';

/**
 * Clases programadas de un día, unificando las fuentes de la agenda: las clases
 * de la programación recurrente (que sí tienen fila por fecha), las clases
 * regulares de una academia (que se derivan de sus días de la semana y no
 * tienen fila propia), las sesiones sueltas y los eventos.
 *
 * Lo usan el registro de asistencia del administrador y el calendario del
 * alumno, así que ambos ven exactamente la misma programación.
 */

export interface ClaseProgramada {
  /** Identidad estable de la clase; con ella se liga la asistencia. */
  key: string;
  tipo: ClaseOrigenTipo;
  titulo: string;
  fecha: string;
  hora: string;
  duracion?: number;
  lugar?: string;
  categoria: ClaseCategoria;
  academiaId?: string;
  sessionId?: string;
  /**
   * Tipo de la sesión de la que salió: 'academia' es de grupo y 'privada' es
   * uno a uno. La agenda entrega ambas como `tipo: 'sesion'`, así que sin esto
   * no hay forma de distinguirlas.
   */
  sesionTipo?: Session['tipo'];
  eventId?: string;
  /** Clase de la programación recurrente, con fila propia en la base. */
  claseId?: string;
  /** Serie a la que pertenece, si salió de una recurrencia. */
  serieId?: string;
  /** true cuando esa fecha se editó por separado del resto de la serie. */
  esExcepcion?: boolean;
  nivel?: string;
  profesorIds?: string[];
  /** 0 o sin valor significa que la clase no tiene tope de alumnos. */
  cupoMaximo?: number;
  /** Estado ya resuelto contra el reloj: programada, en curso, finalizada… */
  estado?: ClaseEstado;
  /** Alumnos ya asociados a la clase, para la lista del registro manual. */
  alumnoIds?: string[];
  cancelada?: boolean;
  /** Subtítulo corto: profesor, academia o instructor. */
  detalle?: string;
}

export interface FuentesDeClases {
  academies: Academy[];
  sessions: Session[];
  events: DanceEvent[];
  /** Clases de la programación: únicas y las generadas por cada serie. */
  classOccurrences?: ClassOccurrence[];
  academyLogs?: Record<string, 'dictada' | 'cancelada'>;
}

function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Categoría de un evento del calendario según su tipo. */
function categoriaDeEvento(type: DanceEvent['type']): ClaseCategoria {
  if (type === 'taller') return 'Taller';
  if (type === 'evento_especial') return 'Evento';
  return 'Básica';
}

/**
 * Clases de una academia en una fecha. Se derivan de sus días fijos, así que
 * una academia sin ese día simplemente no aparece.
 */
export function clasesDeAcademia(
  academy: Academy,
  fecha: string,
  logs: Record<string, string> = {}
): ClaseProgramada | null {
  if (!academy.dias?.includes(diaSemana(fecha))) return null;

  return {
    key: claseKeyAcademia(academy.id, fecha, academy.hora),
    tipo: 'academia',
    titulo: academy.clase || academy.nombre,
    fecha,
    hora: academy.hora,
    duracion: academy.duracion,
    lugar: academy.lugar,
    categoria: categoriaDeNivel(academy.nivel),
    academiaId: academy.id,
    cancelada: logs[`${academy.id}_${fecha}`] === 'cancelada',
    detalle: academy.nombre,
  };
}

/** Clase de la programación → clase de la agenda, con su estado resuelto. */
export function claseProgramadaDeOcurrencia(clase: ClassOccurrence): ClaseProgramada {
  return {
    key: claseKeyProgramada(clase.id),
    tipo: 'programada',
    titulo: clase.nombre,
    fecha: clase.fecha,
    hora: clase.horaInicio,
    duracion: clase.duracion,
    lugar: [clase.sede, clase.salon].filter(Boolean).join(' · '),
    categoria: categoriaDeNivelClase(clase.nivel),
    academiaId: clase.academiaId || undefined,
    claseId: clase.id,
    serieId: clase.serieId || undefined,
    esExcepcion: clase.esExcepcion,
    nivel: clase.nivel,
    profesorIds: clase.profesorIds || [],
    cupoMaximo: clase.cupoMaximo,
    estado: estadoDeClase(clase),
    alumnoIds: clase.alumnoIds || [],
    cancelada: clase.estado === 'cancelada',
  };
}

/**
 * Todas las clases de un día, ordenadas por hora.
 *
 * `academiaId` limita el resultado a una academia: es lo que necesita el
 * calendario del alumno, que sólo debe ver la programación de la suya.
 */
export function clasesDelDia(
  fuentes: FuentesDeClases,
  fecha: string,
  filtro: { academiaId?: string } = {}
): ClaseProgramada[] {
  const logs = fuentes.academyLogs || {};
  const soloDe = filtro.academiaId;
  const clases: ClaseProgramada[] = [];

  // Las clases de la programación se guardan una por fecha, así que basta con
  // filtrar por fecha; incluidas las canceladas, que siguen en el historial.
  for (const clase of fuentes.classOccurrences || []) {
    if (clase.fecha !== fecha) continue;
    if (soloDe && clase.academiaId !== soloDe) continue;
    clases.push(claseProgramadaDeOcurrencia(clase));
  }

  for (const academy of fuentes.academies) {
    if (soloDe && academy.id !== soloDe) continue;
    const clase = clasesDeAcademia(academy, fecha, logs);
    if (clase) clases.push(clase);
  }

  for (const session of fuentes.sessions) {
    if (session.fecha !== fecha) continue;
    if (session.estado === 'cancelada') continue;
    // Una clase privada no es programación de la academia: no se le muestra al
    // alumno en el calendario de su academia.
    if (soloDe && session.academiaId !== soloDe) continue;
    clases.push({
      key: claseKeySesion(session.id),
      tipo: 'sesion',
      titulo: session.titulo,
      fecha: session.fecha,
      hora: session.hora,
      duracion: session.duracion,
      lugar: session.lugar,
      categoria: session.categoria || (session.tipo === 'academia' ? 'Básica' : 'Intermedia'),
      academiaId: session.academiaId,
      sessionId: session.id,
      sesionTipo: session.tipo,
      alumnoIds: session.alumnoIds,
    });
  }

  for (const event of fuentes.events) {
    if (event.date !== fecha) continue;
    // Los eventos son abiertos: se muestran también dentro de una academia.
    clases.push({
      key: claseKeyEvento(event.id),
      tipo: 'evento',
      titulo: event.title,
      fecha: event.date,
      hora: event.startTime,
      lugar: event.description,
      categoria: categoriaDeEvento(event.type),
      eventId: event.id,
      alumnoIds: event.enrolledStudents,
      detalle: event.instructor,
    });
  }

  return clases.sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * Alumnos de una sesión: los matriculados más los que asistieron sin estarlo.
 *
 * Registrar una asistencia no matricula a nadie —`alumnoIds` es el roster que
 * se define al crear la clase, ver db/attendance.ts—, así que mirar sólo el
 * roster dejaría fuera a quien llegó suelto y su «presente» no se vería en
 * ninguna parte.
 */
export function alumnosDeSesion(session: Session): string[] {
  return [...new Set([...(session.alumnoIds || []), ...Object.keys(session.asistencia || {})])];
}

/**
 * ¿La clase junta a varios alumnos en la misma hora?
 *
 * El carnet de un alumno de plan privado no se registra contra ninguna de
 * ellas: su clase es uno a uno. Un evento es abierto y admite a cualquiera, y
 * una sesión privada ya es uno a uno, así que ambos quedan fuera. El servidor
 * decide lo mismo por su cuenta en db/attendance.ts; esto sólo evita mandarle
 * una petición que va a rechazar.
 */
export function esClaseDeGrupo(clase: ClaseProgramada): boolean {
  if (clase.tipo === 'sesion') return clase.sesionTipo !== 'privada';
  return clase.tipo === 'academia' || clase.tipo === 'programada';
}

/**
 * Fechas con clase dentro de un rango, para marcar los días del calendario.
 * Se evalúa día por día porque las clases de academia son recurrentes.
 */
export function diasConClase(
  fuentes: FuentesDeClases,
  desde: string,
  hasta: string,
  filtro: { academiaId?: string } = {}
): Map<string, ClaseProgramada[]> {
  const mapa = new Map<string, ClaseProgramada[]>();
  const [y, m, d] = desde.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);

  while (true) {
    const mes = String(cursor.getMonth() + 1).padStart(2, '0');
    const dia = String(cursor.getDate()).padStart(2, '0');
    const fecha = `${cursor.getFullYear()}-${mes}-${dia}`;
    if (fecha > hasta) break;

    const clases = clasesDelDia(fuentes, fecha, filtro);
    if (clases.length > 0) mapa.set(fecha, clases);
    cursor.setDate(cursor.getDate() + 1);
  }

  return mapa;
}
