import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Info, MapPin } from 'lucide-react';
import { useStore } from '../store';
import type { Student } from '../types';
import { clasesDelDia, diasConClase, type ClaseProgramada } from '../lib/clases';
import { estiloCategoria, hoyStr } from '../lib/planes';
import { cn, formatTime, parseLocalDate } from '../lib/utils';

/**
 * Calendario de clases del alumno.
 *
 * Es sólo de consulta: muestra la programación de su academia y nada más. El
 * registro de asistencia lo hace únicamente el administrador, así que aquí no
 * hay ningún botón que modifique datos.
 */

type Vista = 'mes' | 'semana' | 'dia';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function aStr(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function sumarDias(fecha: string, dias: number): string {
  const d = parseLocalDate(fecha);
  d.setDate(d.getDate() + dias);
  return aStr(d);
}

/** Domingo de la semana que contiene la fecha. */
function inicioDeSemana(fecha: string): string {
  const d = parseLocalDate(fecha);
  d.setDate(d.getDate() - d.getDay());
  return aStr(d);
}

function tituloMes(fecha: string): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(parseLocalDate(fecha));
}

function tituloDia(fecha: string): string {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    parseLocalDate(fecha)
  );
}

/** Rejilla del mes, completada con los días de relleno de la primera semana. */
function celdasDelMes(fecha: string): (string | null)[] {
  const d = parseLocalDate(fecha);
  const primero = new Date(d.getFullYear(), d.getMonth(), 1);
  const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = Array(primero.getDay()).fill(null);
  for (let dia = 1; dia <= total; dia += 1) {
    celdas.push(aStr(new Date(d.getFullYear(), d.getMonth(), dia)));
  }
  return celdas;
}

function TarjetaClase({ clase }: { clase: ClaseProgramada }) {
  const estilo = estiloCategoria(clase.categoria);
  return (
    <div
      className="card p-4 border-l-4"
      style={{ borderLeftColor: estilo.color }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-bold leading-tight">{clase.titulo}</h4>
        <span className={cn('text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0', estilo.badge)}>
          {clase.categoria}
        </span>
      </div>
      <p className="text-sm text-ink-muted flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" /> {formatTime(clase.hora)}
        {clase.duracion ? ` · ${clase.duracion} min` : ''}
      </p>
      {clase.lugar && (
        <p className="text-sm text-ink-muted flex items-center gap-1.5 mt-1">
          <MapPin className="w-3.5 h-3.5" /> {clase.lugar}
        </p>
      )}
      {clase.cancelada && <p className="text-xs text-error mt-2 font-medium">Clase cancelada</p>}
    </div>
  );
}

export function StudentCalendar({ student }: { student: Student }) {
  const { data } = useStore();

  const [vista, setVista] = useState<Vista>('mes');
  const [ancla, setAncla] = useState(hoyStr());
  const [seleccionado, setSeleccionado] = useState(hoyStr());

  const academia = data.academies.find((a) => a.id === student.academiaId);

  const fuentes = useMemo(
    () => ({
      academies: data.academies,
      sessions: data.sessions,
      events: data.events,
      academyLogs: data.academyLogs,
    }),
    [data.academies, data.sessions, data.events, data.academyLogs]
  );

  const celdas = useMemo(() => (vista === 'mes' ? celdasDelMes(ancla) : []), [vista, ancla]);

  const diasSemana = useMemo(() => {
    if (vista !== 'semana') return [];
    const inicio = inicioDeSemana(ancla);
    return Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
  }, [vista, ancla]);

  /** Días marcados: se calcula por rango porque las clases de academia se repiten. */
  const marcados = useMemo(() => {
    if (!student.academiaId) return new Map<string, ClaseProgramada[]>();
    const fechas = vista === 'mes' ? celdas.filter(Boolean) as string[] : diasSemana;
    if (fechas.length === 0) return new Map<string, ClaseProgramada[]>();
    return diasConClase(fuentes, fechas[0], fechas[fechas.length - 1], {
      academiaId: student.academiaId,
    });
  }, [fuentes, student.academiaId, vista, celdas, diasSemana]);

  const clasesDelSeleccionado = useMemo(() => {
    if (!student.academiaId) return [];
    return clasesDelDia(fuentes, seleccionado, { academiaId: student.academiaId });
  }, [fuentes, student.academiaId, seleccionado]);

  if (!student.academiaId || !academia) {
    return (
      <div className="card text-center p-10">
        <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <h3 className="font-bold text-lg mb-2">Todavía no tienes calendario</h3>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          No estás asociado a ninguna academia, así que no hay clases programadas que mostrarte.
          Pídele al administrador que te vincule a tu academia.
        </p>
      </div>
    );
  }

  const mover = (pasos: number) => {
    if (vista === 'mes') {
      const d = parseLocalDate(ancla);
      setAncla(aStr(new Date(d.getFullYear(), d.getMonth() + pasos, 1)));
    } else if (vista === 'semana') {
      setAncla(sumarDias(ancla, pasos * 7));
    } else {
      const siguiente = sumarDias(seleccionado, pasos);
      setSeleccionado(siguiente);
      setAncla(siguiente);
    }
  };

  const titulo =
    vista === 'mes' ? tituloMes(ancla) : vista === 'semana' ? `Semana del ${tituloDia(inicioDeSemana(ancla))}` : tituloDia(seleccionado);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Calendario de clases</h2>
          <p className="text-sm text-ink-muted">{academia.nombre}</p>
        </div>
        <div className="flex gap-1 bg-surface p-1 rounded-lg self-start">
          {(['mes', 'semana', 'dia'] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
                vista === v ? 'bg-magenta text-white' : 'text-ink-muted hover:text-ink'
              )}
            >
              {v === 'dia' ? 'Día' : v}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => mover(-1)} className="icon-btn" aria-label="Anterior">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="font-bold capitalize text-center">{titulo}</p>
          <button onClick={() => mover(1)} className="icon-btn" aria-label="Siguiente">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {vista === 'mes' && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS_CORTOS.map((d) => (
                <span key={d} className="text-center text-xs text-ink-muted py-1">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((fecha, i) => {
                if (!fecha) return <span key={`v-${i}`} />;
                const clases = marcados.get(fecha) || [];
                const esHoy = fecha === hoyStr();
                const activo = fecha === seleccionado;
                return (
                  <button
                    key={fecha}
                    onClick={() => setSeleccionado(fecha)}
                    className={cn(
                      'aspect-square rounded-lg flex flex-col items-center justify-center gap-1 text-sm transition-colors',
                      activo ? 'bg-magenta text-white' : 'hover:bg-surface-hover',
                      !activo && esHoy && 'ring-1 ring-magenta/60',
                      clases.length === 0 && !activo && 'text-ink-muted'
                    )}
                  >
                    <span>{parseLocalDate(fecha).getDate()}</span>
                    <span className="flex gap-0.5 h-1.5">
                      {clases.slice(0, 3).map((c, j) => (
                        <span
                          key={j}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: activo ? '#FFFFFF' : estiloCategoria(c.categoria).color }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {vista === 'semana' && (
          <div className="grid grid-cols-7 gap-1">
            {diasSemana.map((fecha) => {
              const clases = marcados.get(fecha) || [];
              const activo = fecha === seleccionado;
              return (
                <button
                  key={fecha}
                  onClick={() => setSeleccionado(fecha)}
                  className={cn(
                    'rounded-lg p-2 flex flex-col items-center gap-1 text-sm transition-colors',
                    activo ? 'bg-magenta text-white' : 'hover:bg-surface-hover'
                  )}
                >
                  <span className="text-xs opacity-70">{DIAS_CORTOS[parseLocalDate(fecha).getDay()]}</span>
                  <span className="font-bold">{parseLocalDate(fecha).getDate()}</span>
                  <span className="flex gap-0.5 h-1.5">
                    {clases.slice(0, 3).map((c, j) => (
                      <span
                        key={j}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: activo ? '#FFFFFF' : estiloCategoria(c.categoria).color }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {vista === 'dia' && (
          <p className="text-sm text-ink-muted text-center">
            {clasesDelSeleccionado.length === 0
              ? 'Sin clases este día.'
              : `${clasesDelSeleccionado.length} clase${clasesDelSeleccionado.length === 1 ? '' : 's'} programada${clasesDelSeleccionado.length === 1 ? '' : 's'}.`}
          </p>
        )}
      </div>

      <div>
        <h3 className="font-bold mb-3 capitalize">{tituloDia(seleccionado)}</h3>
        {clasesDelSeleccionado.length === 0 ? (
          <div className="card text-center p-8 text-ink-muted">
            <p>No hay clases programadas este día.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clasesDelSeleccionado.map((c) => (
              <div key={c.key}>
                <TarjetaClase clase={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-ink-muted flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        Este calendario es informativo. La asistencia la registra el administrador en la clase.
      </p>
    </div>
  );
}
