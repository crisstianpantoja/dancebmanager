import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Clock,
  Ban,
  MapPin,
  Pencil,
  Repeat,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { AlcanceCambio, ClassOccurrence, ClassSeries, Frecuencia } from '../types';
import {
  ApiError,
  apiCancelarClase,
  apiCrearClaseUnica,
  apiCrearSerie,
  apiEditarClase,
  apiEliminarClase,
  apiEliminarSerie,
  apiReprogramarClase,
  type CambiosDeClase,
  type ResultadoProgramacion,
} from '../lib/api';
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  ESTILO_ESTADO,
  ETIQUETA_ESTADO,
  FRECUENCIAS,
  LIMITE_CLASES,
  NIVELES_CLASE,
  ORDEN_SEMANA,
  describirCupos,
  describirRecurrencia,
  diaSemanaDe,
  duracionEntre,
  estadoDeClase,
  fechasDeRecurrencia,
  hoyISO,
  nombresDeProfesores,
  sumarDias,
} from '../lib/recurrencia';
import { cn, formatDateStr, formatTime } from '../lib/utils';
import { DeleteButton } from './DeleteButton';

/**
 * Programación de clases: las únicas y las recurrentes.
 *
 * Una serie guarda la regla («todos los lunes de septiembre a noviembre») y al
 * guardarla el servidor genera de una vez una clase por fecha. Todo lo que se
 * escribe aquí pasa por /api/clases, que es admin: esta pantalla nunca toca
 * `updateData`, y por eso la respuesta trae la programación entera ya releída.
 */

type TipoDeClase = 'unica' | 'recurrente';

/** Opciones del «¿Qué deseas modificar?». El texto cambia según la acción. */
const OPCIONES_ALCANCE: { valor: AlcanceCambio; etiqueta: string; detalle: string }[] = [
  {
    valor: 'solo_esta',
    etiqueta: 'Solo esta clase',
    detalle: 'Esa fecha queda como excepción y el resto de la serie no se entera.',
  },
  {
    valor: 'esta_y_siguientes',
    etiqueta: 'Esta clase y las siguientes',
    detalle: 'Las anteriores se quedan como están; desde esta fecha manda la nueva regla.',
  },
  {
    valor: 'toda_serie',
    etiqueta: 'Toda la serie de clases',
    detalle: 'Alcanza a todas las fechas, incluidas las que ya pasaron.',
  },
];

/** Ventana por defecto de la lista: desde hoy y dos meses hacia adelante. */
const DIAS_DE_VENTANA = 60;

function Modal({
  titulo,
  onClose,
  children,
  ancho = 'max-w-3xl',
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn('bg-surface rounded-2xl shadow-2xl border border-white/10 w-full max-h-[90vh] overflow-y-auto', ancho)}
      >
        <div className="p-6 border-b border-white/5 sticky top-0 bg-surface z-10 flex justify-between items-center gap-4">
          <h2 className="text-xl font-bold">{titulo}</h2>
          <button onClick={onClose} className="icon-btn" title="Cerrar" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function Badge({ texto, clase }: { texto: string; clase: string }) {
  return <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap', clase)}>{texto}</span>;
}

export function ClassScheduler() {
  const { data, applyProgramacion, addToast } = useStore();

  const [creando, setCreando] = useState<TipoDeClase | null>(null);
  /** Clase cuya edición está esperando la respuesta al «¿Qué deseas modificar?». */
  const [preguntando, setPreguntando] = useState<ClassOccurrence | null>(null);
  const [editando, setEditando] = useState<{ clase: ClassOccurrence; alcance: AlcanceCambio } | null>(null);
  const [cancelando, setCancelando] = useState<ClassOccurrence | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(sumarDias(hoyISO(), DIAS_DE_VENTANA));
  const [verCanceladas, setVerCanceladas] = useState(true);
  const [serieFiltrada, setSerieFiltrada] = useState('');

  const series = data.classSeries || [];
  const clases = data.classOccurrences || [];

  const serieDe = (serieId?: string) => (serieId ? series.find((s) => s.id === serieId) : undefined);

  /**
   * Aplica la respuesta del servidor. Toda acción devuelve la programación
   * completa, así que no hay estado optimista que pueda quedar desalineado.
   */
  const aplicar = async (
    accion: () => Promise<ResultadoProgramacion>,
    porDefecto = 'Programación actualizada'
  ): Promise<boolean> => {
    if (enCurso) return false;
    setEnCurso(true);
    try {
      const respuesta = await accion();
      applyProgramacion(respuesta.classSeries || [], respuesta.classOccurrences || []);
      addToast(respuesta.mensaje || porDefecto, 'success');
      return true;
    } catch (error) {
      const mensaje =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'No se pudo guardar la programación';
      addToast(mensaje, 'error');
      return false;
    } finally {
      setEnCurso(false);
    }
  };

  const clasesVisibles = useMemo(() => {
    return clases
      .filter((c) => c.fecha >= desde && c.fecha <= hasta)
      .filter((c) => (verCanceladas ? true : c.estado !== 'cancelada'))
      .filter((c) => (serieFiltrada ? c.serieId === serieFiltrada : true))
      .sort((a, b) => `${a.fecha} ${a.horaInicio}`.localeCompare(`${b.fecha} ${b.horaInicio}`));
  }, [clases, desde, hasta, verCanceladas, serieFiltrada]);

  /** Clases agrupadas por fecha, que es como se leen en la lista. */
  const porFecha = useMemo(() => {
    const mapa = new Map<string, ClassOccurrence[]>();
    for (const clase of clasesVisibles) {
      const lista = mapa.get(clase.fecha);
      if (lista) lista.push(clase);
      else mapa.set(clase.fecha, [clase]);
    }
    return [...mapa.entries()];
  }, [clasesVisibles]);

  /** Horario semanal: qué series caen en cada día, para leerlo de un vistazo. */
  const horarioSemanal = useMemo(() => {
    return ORDEN_SEMANA.map((dia) => ({
      dia,
      series: series
        .filter((s) => s.estado !== 'cancelada' && (s.diasSemana || []).includes(dia))
        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
    }));
  }, [series]);

  const seriesActivas = useMemo(
    () =>
      [...series].sort(
        (a, b) =>
          a.estado.localeCompare(b.estado) ||
          a.horaInicio.localeCompare(b.horaInicio) ||
          a.nombre.localeCompare(b.nombre)
      ),
    [series]
  );

  const abrirEdicion = (clase: ClassOccurrence) => {
    // Sin serie detrás no hay nada que preguntar: la clase es sólo ella misma.
    if (!clase.serieId) setEditando({ clase, alcance: 'solo_esta' });
    else setPreguntando(clase);
  };

  const contarDesde = (clase: ClassOccurrence) =>
    clases.filter(
      (c) => c.serieId === clase.serieId && c.fecha >= clase.fecha && c.estado !== 'cancelada'
    ).length;

  const contarSerie = (serieId: string) => clases.filter((c) => c.serieId === serieId).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-surface rounded-xl border border-ink-muted/10">
            <CalendarRange className="w-6 h-6 text-magenta" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-ink">Programación</h1>
            <p className="text-ink-muted">
              Clases únicas y series recurrentes. Se generan solas en el calendario.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={() => setCreando('unica')}>
            <CalendarPlus className="w-5 h-5" /> Clase única
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setCreando('recurrente')}>
            <Repeat className="w-5 h-5" /> Clase recurrente
          </button>
        </div>
      </header>

      {/* Horario de la semana ------------------------------------------------ */}
      <section className="card mb-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-magenta" /> Horario semanal
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {horarioSemanal.map(({ dia, series: delDia }) => (
            <div key={dia} className="rounded-xl border border-ink-muted/15 bg-bg/50 p-3 min-h-[110px]">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
                {DIAS_SEMANA[dia]}
              </p>
              {delDia.length === 0 ? (
                <p className="text-xs text-ink-muted/60">Sin clases</p>
              ) : (
                <div className="space-y-2">
                  {delDia.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSerieFiltrada(s.id === serieFiltrada ? '' : s.id)}
                      className={cn(
                        'w-full text-left rounded-lg px-2 py-1.5 border transition-colors',
                        s.id === serieFiltrada
                          ? 'border-magenta/50 bg-magenta/10'
                          : 'border-white/5 bg-surface hover:border-magenta/30'
                      )}
                    >
                      <span className="block text-sm font-semibold truncate">{s.nombre}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {formatTime(s.horaInicio)} · {s.nivel}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="hint">
          Toca una clase del horario para ver sólo sus fechas en la lista de abajo.
        </p>
      </section>

      {/* Series -------------------------------------------------------------- */}
      {seriesActivas.length > 0 && (
        <section className="card mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-magenta" /> Series recurrentes
          </h2>
          <div className="space-y-3">
            {seriesActivas.map((serie) => (
              <div
                key={serie.id}
                className="rounded-xl border border-ink-muted/15 bg-bg/40 p-4 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{serie.nombre}</span>
                    <Badge texto={serie.nivel} clase="bg-magenta/15 text-magenta" />
                    {serie.estado === 'cancelada' && (
                      <Badge texto="Serie cancelada" clase={ESTILO_ESTADO.cancelada} />
                    )}
                    {serie.serieOrigenId && (
                      <Badge texto="Desprendida de otra serie" clase="bg-ink-muted/20 text-ink-muted" />
                    )}
                  </div>
                  <p className="text-sm text-ink-muted mt-1">
                    {describirRecurrencia(serie)} · {formatTime(serie.horaInicio)}
                    {serie.horaFin ? ` – ${formatTime(serie.horaFin)}` : ''}
                  </p>
                  <p className="text-xs text-ink-muted/80 mt-0.5">
                    Del {formatDateStr(serie.fechaInicio)} al {formatDateStr(serie.fechaFin)} ·{' '}
                    {contarSerie(serie.id)} clases generadas
                    {nombresDeProfesores(serie.profesorIds, data.teachers)
                      ? ` · ${nombresDeProfesores(serie.profesorIds, data.teachers)}`
                      : ''}
                  </p>
                </div>
                <DeleteButton
                  onConfirm={() =>
                    aplicar(() => apiEliminarSerie(serie.id), 'Programación eliminada')
                  }
                  className="px-4 py-2 text-sm font-medium bg-error/10 text-error rounded-lg hover:bg-error hover:text-white transition-colors"
                  iconOnly
                  label="Eliminar la serie"
                />
              </div>
            ))}
          </div>
          <p className="hint">
            Eliminar una serie borra sus fechas. Si alguna ya tiene asistencia registrada el
            servidor lo impide: en ese caso hay que cancelarla, para no perder el historial.
          </p>
        </section>
      )}

      {/* Próximas clases ----------------------------------------------------- */}
      <section className="card">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-magenta" /> Clases del periodo
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <label className="label">Serie</label>
              <select className="input" value={serieFiltrada} onChange={(e) => setSerieFiltrada(e.target.value)}>
                <option value="">Todas</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted pb-2.5">
              <input
                type="checkbox"
                checked={verCanceladas}
                onChange={(e) => setVerCanceladas(e.target.checked)}
              />
              Ver canceladas
            </label>
          </div>
        </div>

        {porFecha.length === 0 ? (
          <div className="py-12 text-center text-ink-muted border border-dashed border-ink-muted/20 rounded-xl">
            No hay clases programadas en este periodo.
          </div>
        ) : (
          <div className="space-y-6">
            {porFecha.map(([fecha, delDia]) => (
              <div key={fecha}>
                <p className="text-sm font-bold text-ink-muted mb-2">
                  {DIAS_SEMANA[diaSemanaDe(fecha)]} {formatDateStr(fecha)}
                </p>
                <div className="space-y-2">
                  {delDia.map((clase) => {
                    const estado = estadoDeClase(clase);
                    const serie = serieDe(clase.serieId);
                    const profesores = nombresDeProfesores(clase.profesorIds, data.teachers);
                    const lugar = [clase.sede, clase.salon].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={clase.id}
                        className={cn(
                          'rounded-xl border p-4 flex flex-col md:flex-row md:items-center gap-3',
                          clase.estado === 'cancelada'
                            ? 'border-error/25 bg-error/5'
                            : 'border-ink-muted/15 bg-bg/40'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'font-bold',
                                clase.estado === 'cancelada' && 'line-through text-ink-muted'
                              )}
                            >
                              {clase.nombre}
                            </span>
                            <Badge texto={clase.nivel} clase="bg-magenta/15 text-magenta" />
                            <Badge texto={ETIQUETA_ESTADO[estado]} clase={ESTILO_ESTADO[estado]} />
                            {clase.esExcepcion && (
                              <Badge texto="Excepción" clase="bg-pending/20 text-pending" />
                            )}
                            {!clase.serieId && (
                              <Badge texto="Clase única" clase="bg-ink-muted/20 text-ink-muted" />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-ink-muted">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-accent-academy" />
                              {formatTime(clase.horaInicio)}
                              {clase.horaFin ? ` – ${formatTime(clase.horaFin)}` : ''}
                            </span>
                            {profesores && (
                              <span className="flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-magenta" />
                                {profesores}
                              </span>
                            )}
                            {lugar && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-success" />
                                {lugar}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-pending" />
                              {describirCupos(clase)}
                            </span>
                          </div>
                          {serie && (
                            <p className="text-xs text-ink-muted/70 mt-1">
                              Serie: {describirRecurrencia(serie)}
                            </p>
                          )}
                          {clase.estado === 'cancelada' && clase.motivoCancelacion && (
                            <p className="text-xs text-error/80 mt-1">
                              Motivo: {clase.motivoCancelacion}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Editar clase"
                            onClick={() => abrirEdicion(clase)}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {clase.estado === 'cancelada' ? (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Volver a programar"
                              onClick={() =>
                                aplicar(() => apiReprogramarClase(clase.id), 'Clase reprogramada')
                              }
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn-danger"
                              title="Cancelar clase"
                              onClick={() => setCancelando(clase)}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          {!clase.serieId && (
                            <DeleteButton
                              onConfirm={() =>
                                aplicar(() => apiEliminarClase(clase.id), 'Clase eliminada')
                              }
                              className="icon-btn-danger"
                              iconOnly
                              label="Eliminar la clase"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {creando && (
          <FormularioClase
            key="crear"
            tipo={creando}
            guardando={enCurso}
            onClose={() => setCreando(null)}
            onGuardar={aplicar}
          />
        )}

        {preguntando && (
          <DialogoAlcance
            key="alcance"
            titulo="¿Qué deseas modificar?"
            descripcion={`«${preguntando.nombre}» del ${formatDateStr(preguntando.fecha)} pertenece a una serie recurrente.`}
            confirmar="Continuar"
            detalles={{
              solo_esta: 'Cambia sólo esa fecha.',
              esta_y_siguientes: `Alcanza a ${contarDesde(preguntando)} clases, desde esa fecha en adelante.`,
              toda_serie: `Alcanza a las ${contarSerie(preguntando.serieId || '')} clases de la serie.`,
            }}
            onElegir={(alcance) => {
              setEditando({ clase: preguntando, alcance });
              setPreguntando(null);
            }}
            onClose={() => setPreguntando(null)}
          />
        )}

        {editando && (
          <FormularioClase
            key="editar"
            tipo={editando.clase.serieId && editando.alcance !== 'solo_esta' ? 'recurrente' : 'unica'}
            clase={editando.clase}
            serie={serieDe(editando.clase.serieId)}
            alcance={editando.alcance}
            guardando={enCurso}
            onClose={() => setEditando(null)}
            onGuardar={aplicar}
          />
        )}

        {cancelando && (
          <DialogoCancelacion
            key="cancelar"
            clase={cancelando}
            enSerie={Boolean(cancelando.serieId)}
            detalles={{
              solo_esta: 'Sólo esa fecha queda cancelada.',
              esta_y_siguientes: `Cancela ${contarDesde(cancelando)} clases, desde esa fecha en adelante.`,
              toda_serie: `Cancela las ${contarSerie(cancelando.serieId || '')} clases de la serie.`,
            }}
            guardando={enCurso}
            onClose={() => setCancelando(null)}
            onGuardar={aplicar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// «¿Qué deseas modificar?»
// ---------------------------------------------------------------------------

/**
 * Las tres opciones de alcance. Es el mismo diálogo para editar y para
 * cancelar, porque la pregunta es la misma y sólo cambia el encabezado.
 */
function DialogoAlcance({
  titulo,
  descripcion,
  confirmar,
  detalles,
  onElegir,
  onClose,
}: {
  titulo: string;
  descripcion: string;
  confirmar: string;
  detalles?: Partial<Record<AlcanceCambio, string>>;
  onElegir: (alcance: AlcanceCambio) => void;
  onClose: () => void;
}) {
  const [alcance, setAlcance] = useState<AlcanceCambio>('solo_esta');

  return (
    <Modal titulo={titulo} onClose={onClose} ancho="max-w-lg">
      <div className="p-6 space-y-4">
        <p className="text-sm text-ink-muted">{descripcion}</p>

        <div className="space-y-2">
          {OPCIONES_ALCANCE.map((opcion) => (
            <label
              key={opcion.valor}
              className={cn(
                'flex gap-3 items-start rounded-xl border p-4 cursor-pointer transition-colors',
                alcance === opcion.valor
                  ? 'border-magenta/60 bg-magenta/10'
                  : 'border-ink-muted/15 bg-bg/40 hover:border-magenta/30'
              )}
            >
              <input
                type="radio"
                name="alcance"
                className="mt-1"
                checked={alcance === opcion.valor}
                onChange={() => setAlcance(opcion.valor)}
              />
              <span>
                <span className="block font-semibold">{opcion.etiqueta}</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  {detalles?.[opcion.valor] || opcion.detalle}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => onElegir(alcance)}>
            {confirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cancelación
// ---------------------------------------------------------------------------

/**
 * Cancelar no borra: la clase se queda en el historial como «Cancelada», y por
 * eso puede volver a programarse sin haber perdido nada.
 */
function DialogoCancelacion({
  clase,
  enSerie,
  detalles,
  guardando,
  onClose,
  onGuardar,
}: {
  clase: ClassOccurrence;
  enSerie: boolean;
  detalles: Partial<Record<AlcanceCambio, string>>;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (accion: () => Promise<ResultadoProgramacion>, porDefecto?: string) => Promise<boolean>;
}) {
  const [alcance, setAlcance] = useState<AlcanceCambio>('solo_esta');
  const [motivo, setMotivo] = useState('');

  const cancelar = async () => {
    const ok = await onGuardar(
      () => apiCancelarClase({ claseId: clase.id, alcance: enSerie ? alcance : 'solo_esta', motivo }),
      'Clase cancelada'
    );
    if (ok) onClose();
  };

  return (
    <Modal titulo="¿Qué deseas cancelar?" onClose={onClose} ancho="max-w-lg">
      <div className="p-6 space-y-4">
        <p className="text-sm text-ink-muted">
          «{clase.nombre}» del {formatDateStr(clase.fecha)}, {formatTime(clase.horaInicio)}.
        </p>

        {enSerie ? (
          <div className="space-y-2">
            {OPCIONES_ALCANCE.map((opcion) => (
              <label
                key={opcion.valor}
                className={cn(
                  'flex gap-3 items-start rounded-xl border p-4 cursor-pointer transition-colors',
                  alcance === opcion.valor
                    ? 'border-error/60 bg-error/10'
                    : 'border-ink-muted/15 bg-bg/40 hover:border-error/30'
                )}
              >
                <input
                  type="radio"
                  name="alcance-cancelacion"
                  className="mt-1"
                  checked={alcance === opcion.valor}
                  onChange={() => setAlcance(opcion.valor)}
                />
                <span>
                  <span className="block font-semibold">
                    {opcion.valor === 'solo_esta' ? 'Solo una fecha' : opcion.etiqueta}
                  </span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    {detalles[opcion.valor] || opcion.detalle}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Es una clase única: se cancela sólo ella.</p>
        )}

        <div>
          <label className="label">Motivo (opcional)</label>
          <input
            className="input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Festivo, salón ocupado, viaje del profesor…"
          />
          <p className="hint">
            La clase no se borra: queda en el historial como «Cancelada» y se puede volver a
            programar.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="btn-primary bg-error hover:bg-error/90 disabled:opacity-60"
            disabled={guardando}
            onClick={cancelar}
          >
            {guardando ? 'Cancelando…' : 'Cancelar la clase'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

interface Borrador {
  nombre: string;
  nivel: string;
  profesorIds: string[];
  fecha: string;
  horaInicio: string;
  horaFin: string;
  sede: string;
  salon: string;
  cupoMaximo: number;
  academiaId: string;
  notas: string;
  alumnoIds: string[];
  diasSemana: number[];
  fechaInicio: string;
  fechaFin: string;
  frecuencia: Frecuencia;
  intervaloSemanas: number;
}

function borradorInicial(
  tipo: TipoDeClase,
  clase?: ClassOccurrence,
  serie?: ClassSeries,
  alcance?: AlcanceCambio
): Borrador {
  // Al editar con alcance de serie manda la serie; con alcance de una fecha,
  // la clase. La otra mitad de los campos se rellena con lo que haya.
  const base = tipo === 'recurrente' && serie ? serie : clase;
  const hoy = hoyISO();
  const fecha = clase?.fecha || hoy;
  // Con «esta y las siguientes» la regla nueva arranca en la clase elegida:
  // lo anterior se queda con la serie original.
  const inicio =
    alcance === 'esta_y_siguientes' && clase ? clase.fecha : serie?.fechaInicio || fecha;

  return {
    nombre: base?.nombre || '',
    nivel: base?.nivel || 'Básico',
    profesorIds: base?.profesorIds || [],
    fecha,
    horaInicio: base?.horaInicio || '19:00',
    horaFin: base?.horaFin || '20:00',
    sede: base?.sede || '',
    salon: base?.salon || '',
    cupoMaximo: base?.cupoMaximo ?? 0,
    academiaId: base?.academiaId || '',
    notas: base?.notas || '',
    alumnoIds: base?.alumnoIds || [],
    diasSemana: serie?.diasSemana || [diaSemanaDe(fecha)],
    fechaInicio: inicio,
    fechaFin: serie?.fechaFin || sumarDias(clase?.fecha || hoy, 90),
    frecuencia: serie?.frecuencia || 'semanal',
    intervaloSemanas: serie?.intervaloSemanas || 1,
  };
}

/**
 * Crea y edita, en un solo formulario, porque los campos son los mismos: una
 * clase única no muestra el bloque de recurrencia y una serie no muestra la
 * fecha suelta.
 */
function FormularioClase({
  tipo,
  clase,
  serie,
  alcance,
  guardando,
  onClose,
  onGuardar,
}: {
  tipo: TipoDeClase;
  clase?: ClassOccurrence;
  serie?: ClassSeries;
  alcance?: AlcanceCambio;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (accion: () => Promise<ResultadoProgramacion>, porDefecto?: string) => Promise<boolean>;
}) {
  const { data } = useStore();
  const [form, setForm] = useState<Borrador>(() => borradorInicial(tipo, clase, serie, alcance));
  const [buscaAlumno, setBuscaAlumno] = useState('');
  const editando = Boolean(clase);
  const recurrente = tipo === 'recurrente';

  /** Sólo alumnos: la tabla de usuarios también guarda profesores y admins. */
  const alumnos = useMemo(() => {
    const busca = buscaAlumno.trim().toLowerCase();
    return data.students
      .filter((a) => a.rol === 'alumno')
      .filter((a) => (busca ? a.nombre.toLowerCase().includes(busca) : true))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data.students, buscaAlumno]);

  const set = <K extends keyof Borrador>(campo: K, valor: Borrador[K]) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const alternarDia = (dia: number) =>
    setForm((prev) => ({
      ...prev,
      diasSemana: prev.diasSemana.includes(dia)
        ? prev.diasSemana.filter((d) => d !== dia)
        : [...prev.diasSemana, dia].sort((a, b) => a - b),
    }));

  const alternarAlumno = (id: string) =>
    setForm((prev) => ({
      ...prev,
      alumnoIds: prev.alumnoIds.includes(id)
        ? prev.alumnoIds.filter((a) => a !== id)
        : [...prev.alumnoIds, id],
    }));

  const alternarProfesor = (id: string) =>
    setForm((prev) => ({
      ...prev,
      profesorIds: prev.profesorIds.includes(id)
        ? prev.profesorIds.filter((p) => p !== id)
        : [...prev.profesorIds, id],
    }));

  /**
   * Las fechas que se van a generar, calculadas con la misma función que usa el
   * servidor: lo que se ve aquí es exactamente lo que se guarda.
   */
  const fechas = useMemo(
    () => (recurrente ? fechasDeRecurrencia(form) : []),
    [recurrente, form]
  );

  const minutos = duracionEntre(form.horaInicio, form.horaFin);

  const camposComunes = (): CambiosDeClase => ({
    nombre: form.nombre.trim(),
    nivel: form.nivel,
    profesorIds: form.profesorIds,
    horaInicio: form.horaInicio,
    horaFin: form.horaFin,
    sede: form.sede.trim(),
    salon: form.salon.trim(),
    cupoMaximo: Number(form.cupoMaximo) || 0,
    academiaId: form.academiaId || null,
    notas: form.notas.trim(),
    alumnoIds: form.alumnoIds,
  });

  const reglaActual = () => ({
    diasSemana: form.diasSemana,
    fechaInicio: form.fechaInicio,
    fechaFin: form.fechaFin,
    frecuencia: form.frecuencia,
    intervaloSemanas: Number(form.intervaloSemanas) || 1,
  });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const comunes = camposComunes();

    if (editando && clase) {
      const cambios: CambiosDeClase = { ...comunes };
      // La regla sólo viaja cuando el cambio alcanza a varias clases; con
      // «solo esta» lo que puede moverse es la fecha de esa clase.
      if (recurrente) Object.assign(cambios, reglaActual());
      else cambios.fecha = form.fecha;

      const ok = await onGuardar(
        () => apiEditarClase({ claseId: clase.id, alcance: alcance || 'solo_esta', cambios }),
        'Clase actualizada'
      );
      if (ok) onClose();
      return;
    }

    const ok = recurrente
      ? await onGuardar(
          () =>
            apiCrearSerie({
              ...comunes,
              nombre: comunes.nombre || '',
              horaInicio: form.horaInicio,
              ...reglaActual(),
            }),
          'Serie programada'
        )
      : await onGuardar(
          () =>
            apiCrearClaseUnica({
              ...comunes,
              nombre: comunes.nombre || '',
              horaInicio: form.horaInicio,
              fecha: form.fecha,
            }),
          'Clase programada'
        );
    if (ok) onClose();
  };

  const titulo = editando
    ? recurrente
      ? 'Editar la serie'
      : 'Editar la clase'
    : recurrente
      ? 'Nueva clase recurrente'
      : 'Nueva clase única';

  return (
    <Modal titulo={titulo} onClose={onClose}>
      <form onSubmit={enviar} className="p-6 space-y-5">
        {editando && alcance && (
          <div className="rounded-xl border border-magenta/30 bg-magenta/10 px-4 py-3 text-sm">
            {alcance === 'solo_esta' && (
              <>Se modifica sólo la clase del {formatDateStr(clase?.fecha || '')}.</>
            )}
            {alcance === 'esta_y_siguientes' && (
              <>
                Se modifican esa clase y las siguientes. Las anteriores al{' '}
                {formatDateStr(clase?.fecha || '')} quedan como están.
              </>
            )}
            {alcance === 'toda_serie' && <>Se modifica toda la serie de clases.</>}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nombre de la clase *</label>
            <input
              className="input"
              required
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Bachata Básica"
            />
          </div>

          <div>
            <label className="label">Nivel</label>
            <input
              className="input"
              list="niveles-de-clase"
              value={form.nivel}
              onChange={(e) => set('nivel', e.target.value)}
              placeholder="Básico"
            />
            <datalist id="niveles-de-clase">
              {NIVELES_CLASE.map((nivel) => (
                <option key={nivel} value={nivel} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label">Academia o sede asociada</label>
            <select
              className="input"
              value={form.academiaId}
              onChange={(e) => set('academiaId', e.target.value)}
            >
              <option value="">Sin academia</option>
              {data.academies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <p className="hint">
              Al asociarla, la clase aparece en el calendario de los alumnos de esa academia.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="label">Profesor o profesores</label>
            {data.teachers.length === 0 ? (
              <p className="text-sm text-ink-muted">Todavía no hay profesores registrados.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.teachers.map((profesor) => (
                  <button
                    key={profesor.id}
                    type="button"
                    onClick={() => alternarProfesor(profesor.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border transition-colors',
                      form.profesorIds.includes(profesor.id)
                        ? 'border-magenta bg-magenta/15 text-magenta font-semibold'
                        : 'border-ink-muted/20 text-ink-muted hover:border-magenta/40'
                    )}
                  >
                    {profesor.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Hora de inicio *</label>
            <input
              type="time"
              className="input"
              required
              value={form.horaInicio}
              onChange={(e) => set('horaInicio', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Hora de finalización *</label>
            <input
              type="time"
              className="input"
              required
              value={form.horaFin}
              onChange={(e) => set('horaFin', e.target.value)}
            />
            <p className="hint">
              {minutos > 0 ? `Duración: ${minutos} minutos.` : 'Debe terminar después de empezar.'}
            </p>
          </div>

          <div>
            <label className="label">Sede</label>
            <input
              className="input"
              value={form.sede}
              onChange={(e) => set('sede', e.target.value)}
              placeholder="Sede Norte"
            />
          </div>

          <div>
            <label className="label">Salón</label>
            <input
              className="input"
              value={form.salon}
              onChange={(e) => set('salon', e.target.value)}
              placeholder="Salón 2"
            />
          </div>

          <div>
            <label className="label">Cupo máximo de alumnos</label>
            <input
              type="number"
              min={0}
              className="input"
              value={form.cupoMaximo}
              onChange={(e) => set('cupoMaximo', Number(e.target.value))}
            />
            <p className="hint">0 deja la clase sin límite de cupos.</p>
          </div>

          {!recurrente && (
            <div>
              <label className="label">Fecha de la clase *</label>
              <input
                type="date"
                className="input"
                required
                value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="label">
              Alumnos matriculados{form.cupoMaximo > 0 ? ` (${form.alumnoIds.length} de ${form.cupoMaximo})` : ` (${form.alumnoIds.length})`}
            </label>
            <input
              className="input mb-2"
              value={buscaAlumno}
              onChange={(e) => setBuscaAlumno(e.target.value)}
              placeholder="Buscar alumno por nombre"
            />
            <div className="max-h-40 overflow-y-auto rounded-xl border border-ink-muted/15 bg-bg/40 p-2 space-y-1">
              {alumnos.length === 0 ? (
                <p className="text-sm text-ink-muted p-2">No hay alumnos que coincidan.</p>
              ) : (
                alumnos.map((alumno) => (
                  <label
                    key={alumno.id}
                    className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg hover:bg-surface cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.alumnoIds.includes(alumno.id)}
                      onChange={() => alternarAlumno(alumno.id)}
                    />
                    <span className="truncate">{alumno.nombre}</span>
                  </label>
                ))
              )}
            </div>
            <p className="hint">
              De aquí salen los cupos disponibles que muestra el calendario. Cada clase generada
              hereda esta lista.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="label">Notas</label>
            <textarea
              className="input min-h-[70px]"
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              placeholder="Lo que el profesor deba tener en cuenta"
            />
          </div>
        </div>

        {recurrente && (
          <div className="rounded-xl border border-ink-muted/15 bg-bg/40 p-4 space-y-4">
            <h3 className="font-bold flex items-center gap-2 text-base">
              <Repeat className="w-4 h-4 text-magenta" /> Recurrencia
            </h3>

            <div>
              <label className="label">Días de la semana *</label>
              <div className="flex flex-wrap gap-2">
                {ORDEN_SEMANA.map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => alternarDia(dia)}
                    className={cn(
                      'w-14 py-2 rounded-xl text-sm border transition-colors',
                      form.diasSemana.includes(dia)
                        ? 'border-magenta bg-magenta/15 text-magenta font-semibold'
                        : 'border-ink-muted/20 text-ink-muted hover:border-magenta/40'
                    )}
                  >
                    {DIAS_CORTOS[dia]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Comienza el *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.fechaInicio}
                  onChange={(e) => set('fechaInicio', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Está activa hasta *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.fechaFin}
                  onChange={(e) => set('fechaFin', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Frecuencia</label>
                <select
                  className="input"
                  value={form.frecuencia}
                  onChange={(e) => set('frecuencia', e.target.value as Frecuencia)}
                >
                  {FRECUENCIAS.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              {form.frecuencia === 'personalizada' && (
                <div>
                  <label className="label">Cada cuántas semanas</label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    className="input"
                    value={form.intervaloSemanas}
                    onChange={(e) => set('intervaloSemanas', Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {/* Vista previa: se calcula con la misma función que el servidor. */}
            <div className="rounded-xl border border-magenta/25 bg-magenta/5 p-4">
              {fechas.length === 0 ? (
                <p className="text-sm text-error flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  Con estos datos no se genera ninguna clase. Revisa los días y el periodo.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold">
                    Se generarán {fechas.length} clases · {describirRecurrencia(form)}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    De {formatDateStr(fechas[0])} a {formatDateStr(fechas[fechas.length - 1])}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {fechas.slice(0, 12).map((fecha) => (
                      <span
                        key={fecha}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-white/10"
                      >
                        {formatDateStr(fecha)}
                      </span>
                    ))}
                    {fechas.length > 12 && (
                      <span className="text-[11px] px-2 py-0.5 text-ink-muted">
                        y {fechas.length - 12} más
                      </span>
                    )}
                  </div>
                  {fechas.length >= LIMITE_CLASES && (
                    <p className="hint text-pending">
                      Es el máximo de {LIMITE_CLASES} clases por serie: acorta el periodo si
                      necesitas llegar más lejos.
                    </p>
                  )}
                </>
              )}
            </div>

            {editando && (
              <p className="hint">
                Las fechas que ya se editaron aparte, las canceladas y las que tienen asistencia
                registrada se respetan: no se sobrescriben con la regla nueva.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary disabled:opacity-60"
            disabled={guardando || (recurrente && fechas.length === 0)}
          >
            {guardando
              ? 'Guardando…'
              : editando
                ? 'Guardar cambios'
                : recurrente
                  ? 'Programar la serie'
                  : 'Programar la clase'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
