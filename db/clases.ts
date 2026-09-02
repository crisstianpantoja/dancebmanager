import crypto from 'node:crypto';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from './index.js';
import { attendanceRecords, classOccurrences, classSeries } from './schema.js';
import { sanitize, stripNulls, type AnyRecord } from './mapping.js';
import { AuthError, requireAdmin, type SessionClaims } from './auth.js';
import {
  LIMITE_CLASES,
  diaAnterior,
  duracionEntre,
  esFechaValida,
  esHoraValida,
  fechasDeRecurrencia,
  horaFinDesde,
  intervaloDeSemanas,
} from '../src/lib/recurrencia.js';

/**
 * Programación de clases: series recurrentes y las clases que generan.
 *
 * Reglas que sostienen este archivo:
 *  - Sólo un administrador escribe aquí, y se comprueba en el servidor:
 *    `/api/data` no acepta escrituras a `class_series` ni a `class_occurrences`
 *    (ninguna de las dos está en LIST_COLLECTIONS), así que la interfaz no es
 *    la única barrera.
 *  - Las clases se materializan al guardar la serie, una fila por fecha. Es lo
 *    que permite que un lunes concreto cambie de hora o quede cancelado sin
 *    tocar los demás lunes.
 *  - Cancelar nunca borra: la clase queda con estado 'cancelada' y se conserva
 *    en el historial. Borrar de verdad sólo se permite mientras no haya
 *    asistencia registrada, es decir, mientras la clase no haya ocurrido.
 *  - Una clase editada aparte queda marcada como excepción (`esExcepcion`), y
 *    desde ese momento una edición de la serie no la vuelve a pisar. Las
 *    canceladas y las que ya tienen asistencia se respetan igual.
 *
 * Las fechas las calcula `fechasDeRecurrencia()` en src/lib/recurrencia.ts, el
 * mismo módulo que usa la pantalla para mostrar de antemano las clases que se
 * van a crear: así la vista previa y lo que se guarda no pueden divergir.
 */

/** Alcance de una edición o una cancelación dentro de una serie. */
const ALCANCES = ['solo_esta', 'esta_y_siguientes', 'toda_serie'] as const;
type Alcance = (typeof ALCANCES)[number];

const FRECUENCIAS = ['semanal', 'cada_2_semanas', 'personalizada'];

/** Campos que una clase copia de su serie. */
const CAMPOS_HEREDABLES = [
  'nombre',
  'nivel',
  'profesorIds',
  'horaInicio',
  'horaFin',
  'duracion',
  'sede',
  'salon',
  'cupoMaximo',
  'academiaId',
  'alumnoIds',
  'notas',
] as const;

/** Campos que definen *cuándo* se repite: cambiarlos exige regenerar fechas. */
const CAMPOS_DE_REGLA = [
  'diasSemana',
  'fechaInicio',
  'fechaFin',
  'frecuencia',
  'intervaloSemanas',
] as const;

function newId(): string {
  return crypto.randomBytes(6).toString('hex').slice(0, 10);
}

function ahoraISO(): string {
  return new Date().toISOString();
}

function texto(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
}

function entero(value: unknown, fallback = 0): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Lista de ids: descarta lo que no sea texto y quita repetidos. */
function idsDe(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = texto(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Días de la semana válidos (0=Dom … 6=Sáb), ordenados y sin repetidos. */
function diasDe(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<number>();
  for (const item of value) {
    const n = Math.round(Number(item));
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Horas y duración de una clase. Se acepta la hora de finalización o la
 * duración —el formulario pide una de las dos— y se completa la que falte, de
 * modo que la fila siempre tiene ambas.
 */
function leerHorario(
  body: AnyRecord,
  previo?: { horaInicio: string; horaFin: string; duracion: number }
): { horaInicio: string; horaFin: string; duracion: number } {
  const horaInicio = texto(body.horaInicio, previo?.horaInicio ?? '');
  if (!esHoraValida(horaInicio)) {
    throw new AuthError('La hora de inicio debe tener el formato HH:mm');
  }

  const horaFinPedida = texto(body.horaFin);
  const duracionPedida = body.duracion === undefined ? 0 : entero(body.duracion, 0);

  if (horaFinPedida) {
    if (!esHoraValida(horaFinPedida)) {
      throw new AuthError('La hora de finalización debe tener el formato HH:mm');
    }
    const duracion = duracionEntre(horaInicio, horaFinPedida);
    if (duracion <= 0) {
      throw new AuthError('La clase debe terminar después de la hora en que empieza');
    }
    return { horaInicio, horaFin: horaFinPedida, duracion };
  }

  if (duracionPedida > 0) {
    return {
      horaInicio,
      horaFin: horaFinDesde(horaInicio, duracionPedida),
      duracion: duracionPedida,
    };
  }

  // Ni una ni otra: si se está editando, se conserva lo que ya duraba.
  const duracion = previo?.duracion && previo.duracion > 0 ? previo.duracion : 60;
  return { horaInicio, horaFin: horaFinDesde(horaInicio, duracion), duracion };
}

/**
 * Campo de texto opcional. Un campo ausente hereda lo que ya había guardado;
 * uno presente pero vacío es la orden de borrarlo, así que no se hereda nada.
 */
function opcional(body: AnyRecord, previo: AnyRecord | undefined, campo: string): string {
  return body[campo] === undefined ? texto(previo?.[campo]) : texto(body[campo]);
}

/** Campos comunes a una serie y a una clase única. */
function leerComunes(body: AnyRecord, previo?: AnyRecord) {
  const nombre = texto(body.nombre, texto(previo?.nombre));
  if (!nombre) throw new AuthError('La clase necesita un nombre');

  const horario = leerHorario(
    body,
    previo
      ? {
          horaInicio: texto(previo.horaInicio),
          horaFin: texto(previo.horaFin),
          duracion: entero(previo.duracion, 60),
        }
      : undefined
  );

  const cupoMaximo = Math.max(
    0,
    body.cupoMaximo === undefined ? entero(previo?.cupoMaximo, 0) : entero(body.cupoMaximo, 0)
  );

  return {
    nombre,
    nivel: texto(opcional(body, previo, 'nivel'), 'Básico'),
    profesorIds: body.profesorIds === undefined ? idsDe(previo?.profesorIds) : idsDe(body.profesorIds),
    ...horario,
    sede: opcional(body, previo, 'sede'),
    salon: opcional(body, previo, 'salon'),
    cupoMaximo,
    // Vacío, y no null, porque `sanitize` descarta los nulos: con null puesto,
    // desligar la academia no llegaría nunca a la fila.
    academiaId: opcional(body, previo, 'academiaId'),
    alumnoIds: body.alumnoIds === undefined ? idsDe(previo?.alumnoIds) : idsDe(body.alumnoIds),
    notas: opcional(body, previo, 'notas'),
  };
}

/** Regla de repetición, ya validada. */
function leerRegla(body: AnyRecord, previo?: AnyRecord) {
  const diasSemana = body.diasSemana === undefined ? diasDe(previo?.diasSemana) : diasDe(body.diasSemana);
  if (diasSemana.length === 0) {
    throw new AuthError('Elige al menos un día de la semana para la recurrencia');
  }

  const fechaInicio = texto(body.fechaInicio, texto(previo?.fechaInicio));
  const fechaFin = texto(body.fechaFin, texto(previo?.fechaFin));
  if (!esFechaValida(fechaInicio)) throw new AuthError('La fecha de inicio es obligatoria');
  if (!esFechaValida(fechaFin)) throw new AuthError('La fecha de finalización es obligatoria');
  if (fechaFin < fechaInicio) {
    throw new AuthError('La recurrencia debe terminar después de la fecha en que empieza');
  }

  const frecuencia = texto(body.frecuencia, texto(previo?.frecuencia, 'semanal'));
  if (!FRECUENCIAS.includes(frecuencia)) {
    throw new AuthError(`Frecuencia no reconocida: ${frecuencia}`);
  }

  const regla = {
    diasSemana,
    fechaInicio,
    fechaFin,
    frecuencia: frecuencia as 'semanal' | 'cada_2_semanas' | 'personalizada',
    intervaloSemanas:
      body.intervaloSemanas === undefined
        ? entero(previo?.intervaloSemanas, 1)
        : entero(body.intervaloSemanas, 1),
  };
  // Se normaliza para que la fila guarde el intervalo que realmente se aplica.
  regla.intervaloSemanas = intervaloDeSemanas(regla);
  return regla;
}

/** Fila de clase a partir de una serie y una fecha. */
function filaDeClase(serie: AnyRecord, fecha: string, extra: AnyRecord = {}): AnyRecord {
  return sanitize(classOccurrences, {
    id: newId(),
    serieId: serie.id,
    fecha,
    horaInicio: serie.horaInicio,
    horaFin: serie.horaFin,
    duracion: serie.duracion,
    nombre: serie.nombre,
    nivel: serie.nivel,
    profesorIds: serie.profesorIds ?? [],
    sede: serie.sede,
    salon: serie.salon,
    cupoMaximo: serie.cupoMaximo,
    alumnoIds: serie.alumnoIds ?? [],
    academiaId: serie.academiaId,
    notas: serie.notas,
    estado: 'programada',
    esExcepcion: false,
    creadoEn: ahoraISO(),
    ...extra,
  });
}

/** Sólo los campos heredables que el cuerpo de la petición trae de verdad. */
function parcheHeredable(body: AnyRecord, normalizado: AnyRecord): AnyRecord {
  const parche: AnyRecord = {};
  for (const campo of CAMPOS_HEREDABLES) {
    if (body[campo] !== undefined) parche[campo] = normalizado[campo];
  }
  // La duración y la hora de finalización se derivan una de la otra: si cambió
  // cualquiera de las tres, viajan las tres juntas.
  if (body.horaInicio !== undefined || body.horaFin !== undefined || body.duracion !== undefined) {
    parche.horaInicio = normalizado.horaInicio;
    parche.horaFin = normalizado.horaFin;
    parche.duracion = normalizado.duracion;
  }
  return parche;
}

function tocaLaRegla(body: AnyRecord): boolean {
  return CAMPOS_DE_REGLA.some((campo) => body[campo] !== undefined);
}

function alcanceDe(value: unknown): Alcance {
  const alcance = texto(value, 'solo_esta');
  if (!(ALCANCES as readonly string[]).includes(alcance)) {
    throw new AuthError(`Alcance no reconocido: ${alcance}`);
  }
  return alcance as Alcance;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface EstadoProgramacion {
  classSeries: AnyRecord[];
  classOccurrences: AnyRecord[];
}

/** Programación completa. Es lo que se devuelve tras cada escritura. */
export async function leerProgramacion(): Promise<EstadoProgramacion> {
  const [series, clases] = await Promise.all([
    db.select().from(classSeries),
    db.select().from(classOccurrences),
  ]);
  return {
    classSeries: (series as AnyRecord[]).map(stripNulls),
    classOccurrences: (clases as AnyRecord[])
      .map(stripNulls)
      .sort((a, b) =>
        `${a.fecha} ${a.horaInicio}`.localeCompare(`${b.fecha} ${b.horaInicio}`)
      ),
  };
}

/** Clases de una serie con asistencia registrada: no se pueden borrar. */
async function conAsistencia(tx: any, claseIds: string[]): Promise<Set<string>> {
  if (claseIds.length === 0) return new Set();
  const rows = (await tx
    .select({ claseId: attendanceRecords.claseId })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.claseId, claseIds))) as AnyRecord[];
  return new Set(rows.map((row) => texto(row.claseId)).filter(Boolean));
}

async function serieDe(tx: any, serieId: string): Promise<AnyRecord> {
  const [serie] = (await tx
    .select()
    .from(classSeries)
    .where(eq(classSeries.id, serieId))) as AnyRecord[];
  if (!serie) throw new AuthError('La serie de clases no existe', 404);
  return serie;
}

async function claseDe(tx: any, claseId: string): Promise<AnyRecord> {
  const [clase] = (await tx
    .select()
    .from(classOccurrences)
    .where(eq(classOccurrences.id, claseId))) as AnyRecord[];
  if (!clase) throw new AuthError('La clase no existe', 404);
  return clase;
}

function clasesDeSerie(tx: any, serieId: string): Promise<AnyRecord[]> {
  return tx.select().from(classOccurrences).where(eq(classOccurrences.serieId, serieId));
}

/** Postgres limita los parámetros por consulta, así que se inserta por lotes. */
async function insertarClases(tx: any, filas: AnyRecord[]) {
  for (let i = 0; i < filas.length; i += 200) {
    await tx.insert(classOccurrences).values(filas.slice(i, i + 200) as any);
  }
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

/**
 * Crea una serie recurrente y todas sus clases dentro del periodo.
 *
 * Si la regla no genera ninguna fecha se rechaza en lugar de guardar una serie
 * vacía: normalmente significa que el día elegido no cae dentro del rango.
 */
async function crearSerie(claims: SessionClaims, body: AnyRecord) {
  const comunes = leerComunes(body);
  const regla = leerRegla(body);
  const fechas = fechasDeRecurrencia(regla);
  if (fechas.length === 0) {
    throw new AuthError(
      'Esa recurrencia no genera ninguna clase. Revisa los días y el periodo elegidos.'
    );
  }

  const fila = sanitize(classSeries, {
    id: newId(),
    ...comunes,
    ...regla,
    color: texto(body.color, '#F72585'),
    estado: 'activa',
    creadoEn: ahoraISO(),
  });

  await (db as any).transaction(async (tx: any) => {
    await tx.insert(classSeries).values(fila as any);
    await insertarClases(
      tx,
      fechas.map((fecha) => filaDeClase(fila, fecha))
    );
  });

  return {
    mensaje: `Se programaron ${fechas.length} clases de «${comunes.nombre}».`,
    creadas: fechas.length,
  };
}

/** Crea una clase única: una sola fecha, sin recurrencia detrás. */
async function crearClaseUnica(_claims: SessionClaims, body: AnyRecord) {
  const comunes = leerComunes(body);
  const fecha = texto(body.fecha);
  if (!esFechaValida(fecha)) throw new AuthError('La fecha de la clase es obligatoria');

  const fila = sanitize(classOccurrences, {
    id: newId(),
    serieId: null,
    fecha,
    ...comunes,
    estado: 'programada',
    esExcepcion: false,
    creadoEn: ahoraISO(),
  });

  await db.insert(classOccurrences).values(fila as any);
  return { mensaje: `Clase «${comunes.nombre}» programada.`, creadas: 1 };
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

/**
 * Edita una clase de una serie con el alcance que eligió el administrador.
 *
 *  - 'solo_esta'         : la fecha queda como excepción y deja de seguir a la
 *                          serie. Es el caso del lunes que se corre a las 8.
 *  - 'esta_y_siguientes' : la serie se corta el día anterior y nace otra desde
 *                          esta fecha con los datos nuevos. Se hace así, y no
 *                          parcheando fila por fila, porque el cambio puede ser
 *                          del propio día de la semana o de la frecuencia.
 *  - 'toda_serie'        : se actualiza la serie y se regeneran sus fechas.
 */
async function editarClase(claims: SessionClaims, body: AnyRecord) {
  const claseId = texto(body.claseId);
  if (!claseId) throw new AuthError('Falta la clase que se quiere editar');
  const alcance = alcanceDe(body.alcance);
  const cambios = (body.cambios ?? {}) as AnyRecord;

  return (db as any).transaction(async (tx: any) => {
    const clase = await claseDe(tx, claseId);
    const serieId = texto(clase.serieId);

    // Una clase única no tiene serie: cualquier alcance se reduce a ella misma.
    if (!serieId || alcance === 'solo_esta') {
      const comunes = leerComunes(cambios, clase);
      const fechaNueva = cambios.fecha === undefined ? texto(clase.fecha) : texto(cambios.fecha);
      if (!esFechaValida(fechaNueva)) throw new AuthError('La fecha de la clase es obligatoria');

      const fila = sanitize(classOccurrences, {
        ...comunes,
        fecha: fechaNueva,
        // Sólo una clase de serie se marca como excepción; la única no lo es.
        esExcepcion: Boolean(serieId),
      });
      await tx.update(classOccurrences).set(fila as any).where(eq(classOccurrences.id, claseId));
      return {
        mensaje: serieId
          ? 'La clase de esa fecha se modificó sin afectar al resto de la serie.'
          : 'Clase actualizada.',
      };
    }

    const serie = await serieDe(tx, serieId);

    if (alcance === 'toda_serie') {
      return editarSerieCompleta(tx, serie, cambios);
    }

    const corte = texto(clase.fecha);
    // Si el corte cae en el arranque de la serie, no hay nada que dividir:
    // «esta y las siguientes» son todas.
    if (corte <= texto(serie.fechaInicio)) {
      return editarSerieCompleta(tx, serie, cambios);
    }

    return dividirSerie(tx, serie, corte, cambios);
  });
}

/** Aplica los cambios a la serie entera y vuelve a cuadrar sus fechas. */
async function editarSerieCompleta(tx: any, serie: AnyRecord, cambios: AnyRecord) {
  const comunes = leerComunes(cambios, serie);
  const regla = leerRegla(cambios, serie);
  const fechas = fechasDeRecurrencia(regla);
  if (fechas.length === 0) {
    throw new AuthError(
      'Con esos cambios la serie no tendría ninguna clase. Revisa los días y el periodo.'
    );
  }

  const actualizada = sanitize(classSeries, {
    ...serie,
    ...comunes,
    ...regla,
    color: texto(cambios.color, texto(serie.color, '#F72585')),
  });
  await tx.update(classSeries).set(actualizada as any).where(eq(classSeries.id, serie.id as string));

  const resultado = await cuadrarFechas(tx, actualizada, fechas, cambios);
  return {
    mensaje: [
      'Se actualizó toda la serie',
      resultado.creadas ? `${resultado.creadas} clases nuevas` : '',
      resultado.retiradas ? `${resultado.retiradas} retiradas` : '',
      resultado.respetadas ? `${resultado.respetadas} respetadas por tener cambios propios` : '',
    ]
      .filter(Boolean)
      .join(' · ') + '.',
  };
}

/**
 * Deja la serie con exactamente las fechas de `fechas`.
 *
 * Lo que nunca se toca: las excepciones, las canceladas y las que ya tienen
 * asistencia registrada. Una clase así representa algo que ocurrió o que se
 * decidió aparte, y regenerar la serie no debe borrar ese historial; si su
 * fecha ya no forma parte de la recurrencia, se queda igual en su día.
 */
async function cuadrarFechas(
  tx: any,
  serie: AnyRecord,
  fechas: string[],
  cambios: AnyRecord
): Promise<{ creadas: number; retiradas: number; respetadas: number }> {
  const existentes = (await clasesDeSerie(tx, serie.id as string)) as AnyRecord[];
  const intocables = await conAsistencia(
    tx,
    existentes.map((row) => texto(row.id))
  );

  const parche = parcheHeredable(cambios, leerComunes(cambios, serie));
  const objetivo = new Set(fechas);
  const porFecha = new Map<string, AnyRecord>();
  const sobrantes: AnyRecord[] = [];
  let respetadas = 0;

  for (const row of existentes) {
    const fecha = texto(row.fecha);
    if (objetivo.has(fecha) && !porFecha.has(fecha)) {
      porFecha.set(fecha, row);
    } else {
      sobrantes.push(row);
    }
  }

  // Fechas que se conservan: se les aplica lo que cambió, salvo si la clase
  // tiene vida propia.
  for (const [, row] of porFecha) {
    const id = texto(row.id);
    const propia = row.esExcepcion === true || row.estado === 'cancelada' || intocables.has(id);
    if (propia) {
      respetadas += 1;
      continue;
    }
    if (Object.keys(parche).length > 0) {
      await tx
        .update(classOccurrences)
        .set(sanitize(classOccurrences, parche) as any)
        .where(eq(classOccurrences.id, id));
    }
  }

  // Fechas que ya no corresponden a la recurrencia.
  const aBorrar: string[] = [];
  for (const row of sobrantes) {
    const id = texto(row.id);
    if (row.esExcepcion === true || row.estado === 'cancelada' || intocables.has(id)) {
      respetadas += 1;
      continue;
    }
    aBorrar.push(id);
  }
  if (aBorrar.length > 0) {
    await tx.delete(classOccurrences).where(inArray(classOccurrences.id, aBorrar));
  }

  // Fechas nuevas.
  const nuevas = fechas
    .filter((fecha) => !porFecha.has(fecha))
    .slice(0, LIMITE_CLASES)
    .map((fecha) => filaDeClase(serie, fecha));
  await insertarClases(tx, nuevas);

  return { creadas: nuevas.length, retiradas: aBorrar.length, respetadas };
}

/**
 * Corta la serie justo antes de `corte` y crea otra, con los datos nuevos, que
 * arranca ese día. La original conserva su historial: sus clases anteriores al
 * corte, más las canceladas o con asistencia que hubiera después.
 */
async function dividirSerie(tx: any, serie: AnyRecord, corte: string, cambios: AnyRecord) {
  const comunes = leerComunes(cambios, serie);
  // La serie nueva empieza en el corte, salvo que se pida arrancarla más tarde.
  // Nunca antes: lo anterior al corte sigue siendo de la serie original, y una
  // fecha de inicio previa generaría clases duplicadas sobre las que se quedan.
  const inicioPedido = texto(cambios.fechaInicio);
  const fechaInicio = inicioPedido > corte ? inicioPedido : corte;
  const reglaPedida = leerRegla({ ...cambios, fechaInicio }, serie);
  const fechas = fechasDeRecurrencia(reglaPedida);
  if (fechas.length === 0) {
    throw new AuthError(
      'Con esos cambios no quedaría ninguna clase desde esa fecha. Revisa los días y el periodo.'
    );
  }

  // Lo anterior al corte sigue perteneciendo a la serie original.
  await tx
    .update(classSeries)
    .set({ fechaFin: diaAnterior(corte) })
    .where(eq(classSeries.id, serie.id as string));

  const posteriores = ((await tx
    .select()
    .from(classOccurrences)
    .where(
      and(eq(classOccurrences.serieId, serie.id as string), gte(classOccurrences.fecha, corte))
    )) as AnyRecord[]);
  const intocables = await conAsistencia(
    tx,
    posteriores.map((row) => texto(row.id))
  );

  // De lo que venía después del corte sólo se conserva lo que es historial:
  // una clase cancelada o con asistencia registrada. El resto lo reemplaza la
  // serie nueva.
  const conservadas = new Set<string>();
  const aBorrar: string[] = [];
  for (const row of posteriores) {
    const id = texto(row.id);
    if (row.estado === 'cancelada' || intocables.has(id)) {
      conservadas.add(texto(row.fecha));
      continue;
    }
    aBorrar.push(id);
  }
  if (aBorrar.length > 0) {
    await tx.delete(classOccurrences).where(inArray(classOccurrences.id, aBorrar));
  }

  const nueva = sanitize(classSeries, {
    ...serie,
    ...comunes,
    ...reglaPedida,
    id: newId(),
    color: texto(cambios.color, texto(serie.color, '#F72585')),
    estado: 'activa',
    // Se apunta al tronco, no al eslabón anterior, para poder seguir la
    // programación completa por más veces que se haya cortado.
    serieOrigenId: texto(serie.serieOrigenId, texto(serie.id)),
    creadoEn: ahoraISO(),
  });
  await tx.insert(classSeries).values(nueva as any);

  const filas = fechas
    .filter((fecha) => !conservadas.has(fecha))
    .map((fecha) => filaDeClase(nueva, fecha));
  await insertarClases(tx, filas);

  return {
    mensaje: `Se actualizaron ${filas.length} clases desde esa fecha. Las anteriores quedaron como estaban.`,
    creadas: filas.length,
  };
}

// ---------------------------------------------------------------------------
// Cancelar y reprogramar
// ---------------------------------------------------------------------------

/**
 * Cancela clases con el alcance elegido. Nunca borra filas: la clase queda con
 * estado 'cancelada' y sigue apareciendo en el historial.
 *
 * Al cancelar «esta y las siguientes», la serie se cierra el día anterior para
 * que deje de programar clases nuevas, y las que ya existían más allá quedan
 * canceladas en su fecha.
 */
async function cancelarClases(claims: SessionClaims, body: AnyRecord) {
  const claseId = texto(body.claseId);
  if (!claseId) throw new AuthError('Falta la clase que se quiere cancelar');
  const alcance = alcanceDe(body.alcance);
  const motivo = texto(body.motivo);

  return (db as any).transaction(async (tx: any) => {
    const clase = await claseDe(tx, claseId);
    const serieId = texto(clase.serieId);
    const marca = {
      estado: 'cancelada',
      motivoCancelacion: motivo || null,
      canceladaEn: ahoraISO(),
      canceladaPor: claims.sub,
    };

    if (!serieId || alcance === 'solo_esta') {
      await tx
        .update(classOccurrences)
        .set({ ...marca, esExcepcion: Boolean(serieId) })
        .where(eq(classOccurrences.id, claseId));
      return { mensaje: 'La clase de esa fecha quedó cancelada.' };
    }

    const serie = await serieDe(tx, serieId);
    const todas = (await clasesDeSerie(tx, serieId)) as AnyRecord[];

    if (alcance === 'toda_serie') {
      const ids = todas
        .filter((row) => row.estado !== 'cancelada')
        .map((row) => texto(row.id))
        .filter(Boolean);
      if (ids.length > 0) {
        await tx.update(classOccurrences).set(marca).where(inArray(classOccurrences.id, ids));
      }
      await tx
        .update(classSeries)
        .set({ estado: 'cancelada' })
        .where(eq(classSeries.id, serieId));
      return { mensaje: `Se canceló la serie completa (${ids.length} clases).` };
    }

    const corte = texto(clase.fecha);
    const ids = todas
      .filter((row) => texto(row.fecha) >= corte && row.estado !== 'cancelada')
      .map((row) => texto(row.id))
      .filter(Boolean);
    if (ids.length > 0) {
      await tx.update(classOccurrences).set(marca).where(inArray(classOccurrences.id, ids));
    }

    if (corte <= texto(serie.fechaInicio)) {
      await tx.update(classSeries).set({ estado: 'cancelada' }).where(eq(classSeries.id, serieId));
    } else {
      // La serie deja de generar clases desde el corte, pero las canceladas se
      // conservan aunque queden fuera de su periodo.
      await tx
        .update(classSeries)
        .set({ fechaFin: diaAnterior(corte) })
        .where(eq(classSeries.id, serieId));
    }

    return { mensaje: `Se cancelaron ${ids.length} clases desde esa fecha.` };
  });
}

/** Devuelve una clase cancelada al estado programada. */
async function reprogramarClase(_claims: SessionClaims, body: AnyRecord) {
  const claseId = texto(body.claseId);
  if (!claseId) throw new AuthError('Falta la clase que se quiere reactivar');
  // Se comprueba antes de actualizar: un id que ya no existe debe decirlo, no
  // devolver un «listo» que no cambió nada.
  await claseDe(db, claseId);

  await db
    .update(classOccurrences)
    .set({ estado: 'programada', motivoCancelacion: null, canceladaEn: null, canceladaPor: null })
    .where(eq(classOccurrences.id, claseId));

  return { mensaje: 'La clase volvió a quedar programada.' };
}

// ---------------------------------------------------------------------------
// Borrar
// ---------------------------------------------------------------------------

/**
 * Borra de verdad. Sólo se permite mientras no haya asistencia registrada: una
 * clase que ya ocurrió se cancela, no se borra, para no perder el historial.
 */
async function borrarSerie(_claims: SessionClaims, body: AnyRecord) {
  const serieId = texto(body.serieId);
  if (!serieId) throw new AuthError('Falta la serie que se quiere eliminar');

  return (db as any).transaction(async (tx: any) => {
    const serie = await serieDe(tx, serieId);
    const clases = (await clasesDeSerie(tx, serieId)) as AnyRecord[];
    const intocables = await conAsistencia(
      tx,
      clases.map((row) => texto(row.id))
    );
    if (intocables.size > 0) {
      throw new AuthError(
        'Esta serie ya tiene asistencia registrada. Cancélala en lugar de eliminarla para conservar el historial.',
        409
      );
    }

    await tx.delete(classOccurrences).where(eq(classOccurrences.serieId, serieId));
    await tx.delete(classSeries).where(eq(classSeries.id, serieId));
    return { mensaje: `Se eliminó la programación de «${texto(serie.nombre)}».` };
  });
}

async function borrarClase(_claims: SessionClaims, body: AnyRecord) {
  const claseId = texto(body.claseId);
  if (!claseId) throw new AuthError('Falta la clase que se quiere eliminar');

  return (db as any).transaction(async (tx: any) => {
    await claseDe(tx, claseId);
    const intocables = await conAsistencia(tx, [claseId]);
    if (intocables.size > 0) {
      throw new AuthError(
        'Esta clase ya tiene asistencia registrada. Cancélala en lugar de eliminarla para conservar el historial.',
        409
      );
    }
    await tx.delete(classOccurrences).where(eq(classOccurrences.id, claseId));
    return { mensaje: 'Clase eliminada.' };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const ACCIONES: Record<
  string,
  (claims: SessionClaims, body: AnyRecord) => Promise<{ mensaje: string; creadas?: number }>
> = {
  'create-series': crearSerie,
  'create-single': crearClaseUnica,
  'update-occurrence': editarClase,
  'cancel-occurrence': cancelarClases,
  'restore-occurrence': reprogramarClase,
  'delete-series': borrarSerie,
  'delete-occurrence': borrarClase,
};

/**
 * Handler compartido por la Netlify Function y el servidor Express de
 * desarrollo. `requireAdmin` es la única puerta: un alumno o un profesor
 * recibe 403 aunque haya construido la petición a mano.
 *
 * Cada respuesta devuelve la programación completa ya releída. Es un puñado de
 * filas y ahorra al navegador tener que adivinar cómo quedó una operación que
 * puede haber creado, movido y cancelado clases a la vez.
 */
export async function handleClasesRequest(request: Request): Promise<Response> {
  try {
    if (request.method === 'GET') {
      await requireAdmin(request);
      return Response.json({ ok: true, ...(await leerProgramacion()) });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    }

    const claims = await requireAdmin(request);
    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const accion = ACCIONES[texto(body.action)];
    if (!accion) {
      return Response.json({ error: `Acción no reconocida: ${texto(body.action)}` }, { status: 400 });
    }

    const resultado = await accion(claims, body);
    return Response.json({ ok: true, ...resultado, ...(await leerProgramacion()) });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/clases]', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}
