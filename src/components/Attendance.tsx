import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  CalendarDays,
  Check,
  PenLine,
  QrCode,
  RotateCcw,
  ScanLine,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { AttendanceRecord, ClaseCategoria, Student } from '../types';
import { apiRegisterAttendance, apiVoidAttendance, type RegistroAsistencia } from '../lib/api';
import { clasesDelDia, type ClaseProgramada } from '../lib/clases';
import {
  CATEGORIAS_MANUALES,
  categoriaSugerida,
  claseKeyManual,
  estiloCategoria,
  hoyStr,
  tituloManual,
} from '../lib/planes';
import { cn, formatDateStr, formatTime } from '../lib/utils';

/**
 * Registro de clases asistidas. Sólo el administrador entra aquí, y el servidor
 * lo vuelve a comprobar: /api/asistencia responde 403 a cualquier otro rol.
 *
 * Cada clase programada tiene su propio QR (`CLASE:<clave>`) para que la
 * asistencia quede ligada a esa clase concreta —academia, fecha, hora y
 * nivel— y no a «la clase de hoy» en general: escanearlo abre la lista de esa
 * clase, incluso si es de otro día. El carnet del alumno trae `STUDENT:<id>`,
 * que es lo que se escanea después para pasar la lista.
 *
 * Los dos códigos se leen con la misma cámara y en cualquier orden: si llega un
 * carnet antes de haber elegido la clase, el escaneo se guarda y la clase se
 * pregunta en el momento, en lugar de descartar la lectura.
 *
 * Escanear un carnet NO exige que haya una clase en la agenda. Las privadas no
 * están ahí —no son programación de grupo— y antes eso bloqueaba su registro:
 * ahora, sin clase programada, el carnet abre el registro manual con la clase
 * ya propuesta (privada, o el nivel del alumno si es de academia). «No hay
 * clases programadas» quedó como información, no como un muro.
 */

const ETIQUETA_ESTADO: Record<AttendanceRecord['estadoPlan'], { texto: string; clase: string }> = {
  cupo: { texto: 'Descontada del plan', clase: 'bg-success/20 text-success' },
  ilimitada: { texto: 'Mensualidad ilimitada', clase: 'bg-success/20 text-success' },
  sin_cupo: { texto: 'Sin cupo · cobrar aparte', clase: 'bg-error/20 text-error' },
  vencido: { texto: 'Plan vencido · cobrar aparte', clase: 'bg-error/20 text-error' },
  sin_plan: { texto: 'Sin plan · cobrar aparte', clase: 'bg-error/20 text-error' },
};

/** Lo que dice el carnet sobre el alumno, para confirmar a quién se registra. */
const ETIQUETA_TIPO_ALUMNO: Record<Student['tipo'], string> = {
  privada: 'Carnet de clases privadas',
  academia: 'Alumno de academia',
  ambas: 'Academia y clases privadas',
};

/** `tipo` es texto libre en la base: un valor inesperado no deja el hueco vacío. */
function etiquetaTipo(tipo: Student['tipo']): string {
  return ETIQUETA_TIPO_ALUMNO[tipo] || 'Alumno';
}

const TONO_CLASE = {
  success: 'border-success/40 bg-success/10',
  warning: 'border-pending/40 bg-pending/10',
  error: 'border-error/40 bg-error/10',
};

const TONO_TITULO = {
  success: 'text-success',
  warning: 'text-pending',
  error: 'text-error',
};

/** Pausa entre lecturas del mismo código, en milisegundos. */
const ESPERA_MISMO_QR = 2500;

/** Mensaje de cada fallo de la cámara, en el idioma de la aplicación. */
const ERROR_CAMARA: Record<string, string> = {
  'permission-denied':
    'No hay permiso para usar la cámara. Habilítala para este sitio en los ajustes del navegador.',
  'no-camera': 'No se encontró ninguna cámara en este dispositivo.',
  'in-use': 'Otra aplicación está usando la cámara. Ciérrala y vuelve a intentarlo.',
  'insecure-context': 'La cámara sólo funciona sobre HTTPS.',
  unsupported: 'Este navegador no permite leer códigos QR. Usa el registro manual.',
  overconstrained: 'La cámara no admite la configuración pedida.',
};

interface QrLeido {
  tipo: 'clase' | 'alumno';
  valor: string;
}

/**
 * Contenido útil de un QR. El prefijo se acepta en cualquier caja y el valor
 * también envuelto en una URL, que es como lo reenvían algunos lectores; un
 * código sin prefijo se trata como el id de un carnet, por compatibilidad con
 * los primeros carnets emitidos.
 */
function leerQr(valor: string): QrLeido {
  let limpio = valor.trim();
  const dentroDeUrl = limpio.match(/[?&#](?:q|code|data|valor)=([^&]+)/i);
  if (dentroDeUrl) limpio = decodeURIComponent(dentroDeUrl[1]).trim();

  const clase = limpio.match(/^clase\s*:\s*(.+)$/i);
  if (clase) return { tipo: 'clase', valor: clase[1].trim() };

  const alumno = limpio.match(/^student\s*:\s*(.+)$/i);
  if (alumno) return { tipo: 'alumno', valor: alumno[1].trim() };

  return { tipo: 'alumno', valor: limpio };
}

/**
 * Una asistencia en la lista. Se comparte entre la lista de una clase de la
 * agenda y la de las clases registradas a mano, que sólo se distinguen en que
 * la segunda necesita decir de qué clase se trata.
 *
 * Es una función que devuelve el marcado, no un componente, porque así la
 * `key` queda en el elemento raíz: el proyecto no tiene los tipos de React, y
 * sin ellos TypeScript no admite `key` en un componente propio.
 */
function filaRegistro(
  record: AttendanceRecord,
  nombre: string,
  onAnular: (record: AttendanceRecord) => void,
  // Añade la clase a la que corresponde: la lista manual mezcla varias.
  conClase = false
) {
  const etiqueta = ETIQUETA_ESTADO[record.estadoPlan];
  return (
    <div
      key={record.id}
      className={cn(
        'card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3',
        record.anulado && 'opacity-60'
      )}
    >
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('font-bold', record.anulado && 'line-through')}>{nombre}</span>
          <span className={cn('text-[10px] px-2 py-0.5 rounded uppercase font-bold', etiqueta.clase)}>
            {etiqueta.texto}
          </span>
          {conClase && record.categoria && (
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded uppercase font-bold',
                estiloCategoria(record.categoria).badge
              )}
            >
              {record.categoria}
            </span>
          )}
          {record.anulado && (
            <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-surface-hover text-ink-muted">
              Anulado
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted mt-1">
          {conClase && `${record.titulo}${record.hora ? ` · ${formatTime(record.hora)}` : ''} · `}
          {record.origen === 'qr' ? 'Registrado por QR' : 'Registro manual'}
          {record.planConcepto ? ` · ${record.planConcepto}` : ''}
          {record.notas ? ` · ${record.notas}` : ''}
        </p>
      </div>
      {!record.anulado && (
        <button
          onClick={() => onAnular(record)}
          className="text-xs text-error hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          <Undo2 className="w-4 h-4" /> Anular
        </button>
      )}
    </div>
  );
}

/** Hora local en 'HH:mm', que es la que propone una clase registrada ahora. */
function horaActual(): string {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
}

/**
 * Clase que se está registrando a mano, sin pasar por la agenda. Es lo que se
 * abre al escanear un carnet en un día sin clases programadas, y también lo que
 * el administrador puede abrir por su cuenta para una privada.
 */
interface BorradorManual {
  /** Vacío mientras no se haya elegido el alumno (registro abierto a mano). */
  alumnoId: string;
  categoria: ClaseCategoria;
  fecha: string;
  hora: string;
  notas: string;
  /** Registrar sin cobrar a ningún plan: la clase se cobra aparte. */
  sinDescuento: boolean;
  /** QR del carnet que abrió el borrador, para no volver a leerlo al registrar. */
  qr?: string;
}

export function Attendance() {
  const { data, refresh, addToast } = useStore();

  const [fecha, setFecha] = useState(hoyStr());
  const [claseKey, setClaseKey] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [mostrandoQrClase, setMostrandoQrClase] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<RegistroAsistencia[]>([]);
  const [enCurso, setEnCurso] = useState(false);
  /**
   * Carnet leído sin clase elegida todavía. En lugar de perder el escaneo, se
   * guarda y se pide la clase ahí mismo; al elegirla se registra solo.
   */
  const [pendiente, setPendiente] = useState<{ id: string; nombre: string; qr: string } | null>(
    null
  );
  /**
   * Clase que se está registrando a mano. Mientras exista, la cámara ignora lo
   * que lea: primero se resuelve el carnet que ya está en pantalla.
   */
  const [manual, setManual] = useState<BorradorManual | null>(null);
  const [busquedaManual, setBusquedaManual] = useState('');
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  /** Último código leído, para no procesar cien veces el mismo encuadre. */
  const ultimoQr = useRef<{ valor: string; en: number }>({ valor: '', en: 0 });
  /**
   * Carnets ya registrados en la clase abierta. Un carnet que se queda delante
   * de la cámara no vuelve a enviarse; se olvida al cambiar de clase o al
   * cerrar la cámara.
   */
  const yaRegistrados = useRef<Set<string>>(new Set());

  const fuentes = useMemo(
    () => ({
      academies: data.academies,
      sessions: data.sessions,
      events: data.events,
      classOccurrences: data.classOccurrences,
      academyLogs: data.academyLogs,
    }),
    [data.academies, data.sessions, data.events, data.classOccurrences, data.academyLogs]
  );

  const clases = useMemo(() => clasesDelDia(fuentes, fecha), [fuentes, fecha]);

  const clase: ClaseProgramada | null = clases.find((c) => c.key === claseKey) || null;

  /** Registros de la clase seleccionada, anulados incluidos: es su historial. */
  const registros = useMemo(
    () =>
      (data.attendanceRecords || [])
        .filter((r) => r.claseKey === claseKey)
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
    [data.attendanceRecords, claseKey]
  );

  const presentes = new Set(registros.filter((r) => !r.anulado).map((r) => r.alumnoId));

  /**
   * Clases registradas a mano en la fecha elegida. No pertenecen a ninguna
   * clase de la agenda, así que tienen su propia lista: sin ella no habría
   * dónde consultarlas ni desde dónde anularlas.
   */
  const registrosManuales = useMemo(
    () =>
      (data.attendanceRecords || [])
        .filter((r) => r.claseTipo === 'manual' && r.fecha === fecha)
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
    [data.attendanceRecords, fecha]
  );

  const candidatos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return data.students
      .filter((s) => s.rol !== 'profesor')
      .filter((s) => !texto || s.nombre.toLowerCase().includes(texto) || (s.documento || '').includes(texto))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .slice(0, 40);
  }, [data.students, busqueda]);

  /** Alumnos que ofrece el buscador del registro manual. */
  const candidatosManual = useMemo(() => {
    const texto = busquedaManual.trim().toLowerCase();
    return data.students
      .filter((s) => s.rol !== 'profesor')
      .filter(
        (s) => !texto || s.nombre.toLowerCase().includes(texto) || (s.documento || '').includes(texto)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .slice(0, 30);
  }, [data.students, busquedaManual]);

  const alumnoManual = manual ? data.students.find((s) => s.id === manual.alumnoId) || null : null;

  /**
   * Abre el registro manual. Con un alumno concreto se propone la clase que le
   * corresponde según su carnet —privada, o su nivel de academia—; sin alumno,
   * el formulario empieza pidiéndolo.
   */
  const abrirManual = (alumno: Student | null = null, qr?: string) => {
    setBusquedaManual('');
    setManual({
      alumnoId: alumno?.id || '',
      categoria: alumno ? categoriaSugerida(alumno) : 'Privada',
      fecha,
      // La clase de un día pasado se registra a la hora que diga el
      // administrador; la de hoy, a la hora en que está ocurriendo.
      hora: fecha === hoyStr() ? horaActual() : '',
      notas: '',
      sinDescuento: false,
      qr,
    });
  };

  /**
   * Registro desde la cámara. El código se marca antes de enviarlo para que el
   * carnet no se reenvíe mientras sigue delante del objetivo, y se desmarca si
   * el envío falla, para poder reintentarlo.
   */
  const registrarPorQr = (alumnoId: string, qr: string, destino: ClaseProgramada) => {
    yaRegistrados.current.add(qr);
    void registrar(alumnoId, 'qr', destino).then((ok) => {
      if (!ok) yaRegistrados.current.delete(qr);
    });
  };

  /**
   * Abre la lista de una clase. Si había un carnet esperando, se registra en
   * cuanto la clase queda elegida: el escaneo no se pierde.
   */
  const activarClase = (
    destino: ClaseProgramada,
    // Por defecto se atiende el carnet que estaba esperando clase.
    carnet: { id: string; nombre: string; qr: string } | null = pendiente
  ) => {
    setClaseKey(destino.key);
    setResultados([]);
    // Otra clase, otra lista: los mismos carnets vuelven a ser válidos.
    yaRegistrados.current = new Set();
    setPendiente(null);
    if (carnet) registrarPorQr(carnet.id, carnet.qr, destino);
  };

  const seleccionarClase = (key: string) => {
    if (key === claseKey && !pendiente) {
      setClaseKey(null);
      setResultados([]);
      return;
    }
    const destino = clases.find((c) => c.key === key);
    if (destino) activarClase(destino);
  };

  /**
   * El servidor decide contra qué plan se cobra y devuelve el aviso ya
   * redactado; aquí sólo se pinta. Nada bloquea el registro: un plan vencido o
   * agotado también entra, marcado para cobrarlo aparte.
   */
  const registrar = async (
    alumnoId: string,
    origen: 'qr' | 'manual',
    // La clase llega como argumento porque al elegirla y registrar en el mismo
    // gesto todavía no se ha vuelto a pintar el componente.
    destino: ClaseProgramada | null = clase,
    // Sólo el registro manual los usa: la clase de la agenda no lleva notas ni
    // permite saltarse el plan.
    extra: { notas?: string; sinDescuento?: boolean } = {}
  ): Promise<boolean> => {
    if (!destino || enCurso) return false;
    setEnCurso(true);
    try {
      const resultado = await apiRegisterAttendance({
        alumnoId,
        origen,
        notas: extra.notas,
        sinDescuento: extra.sinDescuento,
        clase: {
          key: destino.key,
          tipo: destino.tipo,
          titulo: destino.titulo,
          fecha: destino.fecha,
          hora: destino.hora,
          categoria: destino.categoria,
          academiaId: destino.academiaId,
          sessionId: destino.sessionId,
          eventId: destino.eventId,
          claseId: destino.claseId,
        },
      });
      setResultados((prev) => [resultado, ...prev].slice(0, 12));
      await refresh();
      return true;
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'No se pudo registrar la asistencia', 'error');
      return false;
    } finally {
      setEnCurso(false);
    }
  };

  /**
   * Registra la clase del borrador manual. La clase no existe en la agenda, así
   * que se arma aquí con lo que se capturó; el servidor vuelve a armar la misma
   * clave, y con ella detecta el doble registro igual que en una clase
   * programada.
   */
  const registrarManual = async () => {
    if (!manual || !manual.alumnoId) return;

    const hora = manual.hora || horaActual();
    const destino: ClaseProgramada = {
      key: claseKeyManual(manual.alumnoId, manual.fecha, hora),
      tipo: 'manual',
      titulo: tituloManual(manual.categoria),
      fecha: manual.fecha,
      hora,
      categoria: manual.categoria,
    };

    const ok = await registrar(manual.alumnoId, manual.qr ? 'qr' : 'manual', destino, {
      notas: manual.notas,
      sinDescuento: manual.sinDescuento,
    });

    if (!ok) return;
    // El carnet que abrió el borrador queda marcado: seguir con la cámara
    // abierta no lo vuelve a registrar.
    if (manual.qr) yaRegistrados.current.add(manual.qr);
    // La fecha de la lista sigue a la de la clase registrada, para que el
    // registro recién hecho se vea sin tener que buscarlo.
    if (manual.fecha !== fecha) setFecha(manual.fecha);
    setManual(null);
  };

  const anular = async (record: AttendanceRecord) => {
    try {
      const { devolvio } = await apiVoidAttendance(record.id);
      const alumno = data.students.find((s) => s.id === record.alumnoId);
      addToast(
        devolvio
          ? `Registro anulado. Se devolvió 1 clase al plan de ${alumno?.nombre || 'el alumno'}.`
          : 'Registro anulado.',
        'success'
      );
      await refresh();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'No se pudo anular el registro', 'error');
    }
  };

  /**
   * Fecha a la que pertenece una clase, leída de su clave. Así el QR de una
   * clase de otro día también encuentra su lista.
   */
  const fechaDeClase = (key: string): string | null => {
    const partes = key.split(':');
    if (partes[0] === 'A' && partes.length >= 4) return partes[2];
    if (partes[0] === 'S') return data.sessions.find((x) => x.id === partes[1])?.fecha || null;
    if (partes[0] === 'E') return (data.events || []).find((x) => x.id === partes[1])?.date || null;
    return null;
  };

  /** El QR de una clase abre su lista; no se lee como si fuera un carnet. */
  const seleccionarPorQr = (key: string) => {
    const aqui = clases.find((c) => c.key === key);
    if (aqui) {
      activarClase(aqui);
      addToast(`Clase seleccionada: ${aqui.titulo}`, 'success');
      return;
    }

    // El QR puede ser de otro día: se salta a su fecha en lugar de fallar.
    const otraFecha = fechaDeClase(key);
    const alla = otraFecha ? clasesDelDia(fuentes, otraFecha).find((c) => c.key === key) : null;
    if (otraFecha && alla) {
      setFecha(otraFecha);
      activarClase(alla);
      addToast(`Clase seleccionada: ${alla.titulo} · ${formatDateStr(otraFecha)}`, 'success');
      return;
    }

    addToast('Ese QR no corresponde a ninguna clase programada.', 'error');
  };

  /**
   * Un carnet leído sin clase elegida. Nunca es un callejón sin salida: con una
   * sola clase en el día se toma esa; sin ninguna, se abre el registro manual
   * con la clase ya propuesta; y con varias, el carnet espera a que se elija
   * —con la opción de registrarla a mano también ahí—.
   */
  const carnetSinClase = (alumno: Student, qr: string) => {
    if (clases.length === 1) {
      const destino = clases[0];
      addToast(`Clase seleccionada: ${destino.titulo}`, 'info');
      activarClase(destino, { id: alumno.id, nombre: alumno.nombre, qr });
      return;
    }

    if (clases.length === 0) {
      // Sin clase en la agenda la asistencia se registra igual: es el caso de
      // toda clase privada, que por naturaleza no está programada.
      setPendiente(null);
      abrirManual(alumno, qr);
      addToast(
        `No hay clases programadas el ${formatDateStr(fecha)}. Registra la clase de ${alumno.nombre} a mano.`,
        'info'
      );
      return;
    }

    setPendiente({ id: alumno.id, nombre: alumno.nombre, qr });
    addToast(`Elige la clase de ${alumno.nombre} para registrar su asistencia.`, 'warning');
  };

  const handleScan = (valor: string) => {
    // Con el registro manual abierto la cámara espera: primero se resuelve el
    // carnet que ya está en pantalla.
    if (manual) return;

    const ahora = Date.now();
    // La cámara entrega el mismo encuadre muchas veces por segundo: sin esta
    // pausa un solo carnet dispararía una avalancha de avisos.
    if (ultimoQr.current.valor === valor && ahora - ultimoQr.current.en < ESPERA_MISMO_QR) return;
    ultimoQr.current = { valor, en: ahora };

    const leido = leerQr(valor);

    if (leido.tipo === 'clase') {
      seleccionarPorQr(leido.valor);
      return;
    }

    const alumno = data.students.find((s) => s.id === leido.valor);
    if (!alumno) {
      addToast('El carnet escaneado no corresponde a ningún alumno.', 'error');
      return;
    }

    // Con un registro en vuelo se descarta la lectura, pero sin recordarla:
    // acercar otra vez el carnet vuelve a intentarlo.
    if (enCurso) {
      ultimoQr.current = { valor: '', en: 0 };
      return;
    }

    if (yaRegistrados.current.has(valor)) return;

    if (!clase) {
      // El carnet de un alumno de plan privado no entra a la clase de grupo del
      // día: su clase es uno a uno, así que se propone directamente una privada.
      if (alumno.tipo === 'privada') {
        abrirManual(alumno, valor);
        return;
      }
      carnetSinClase(alumno, valor);
      return;
    }

    registrarPorQr(alumno.id, valor, clase);
  };

  /** Al cerrar la cámara se olvida lo leído: la próxima sesión empieza limpia. */
  useEffect(() => {
    if (escaneando) return;
    ultimoQr.current = { valor: '', en: 0 };
    yaRegistrados.current = new Set();
    setPendiente(null);
    setErrorCamara(null);
  }, [escaneando]);

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Registro de Asistencia</h1>
        <p className="text-sm text-ink-muted">
          Escanea el QR de una clase para abrir su lista, o el carnet del alumno para registrarlo
          directamente —aunque su clase no esté en la agenda, como pasa con las privadas—. El
          descuento del plan lo calcula el sistema.
        </p>
      </div>

      <div className="card mb-6">
        <label className="label">Fecha</label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="date"
            className="input sm:w-52"
            value={fecha}
            onChange={(e) => { setFecha(e.target.value); setClaseKey(null); setResultados([]); }}
          />
          <button className="btn-secondary flex items-center gap-2" onClick={() => setFecha(hoyStr())}>
            <RotateCcw className="w-4 h-4" /> Hoy
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={() => setEscaneando(true)}>
            <ScanLine className="w-4 h-4" /> Escanear QR
          </button>
          {/* Siempre disponible: una privada no espera a estar en la agenda. */}
          <button className="btn-secondary flex items-center gap-2" onClick={() => abrirManual()}>
            <PenLine className="w-4 h-4" /> Registrar clase manual
          </button>
          <span className="text-sm text-ink-muted sm:ml-auto">{formatDateStr(fecha)}</span>
        </div>
      </div>

      <h2 className="text-lg font-bold mb-3">Clases de este día</h2>
      {clases.length === 0 ? (
        <div className="card text-center p-10 mb-6">
          <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-20 text-ink-muted" />
          <p className="text-ink-muted">No hay clases programadas para esta fecha.</p>
          <p className="text-sm text-ink-muted/80 mt-2 mb-5 max-w-md mx-auto">
            Puedes registrar la clase a mano: es lo normal en una privada, que no forma parte de la
            agenda de grupo. Escanear un carnet también abre este registro.
          </p>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => abrirManual()}>
            <PenLine className="w-4 h-4" /> Registrar clase manual
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
          {clases.map((c) => {
            const estilo = estiloCategoria(c.categoria);
            const activa = c.key === claseKey;
            const cuantos = (data.attendanceRecords || []).filter(
              (r) => r.claseKey === c.key && !r.anulado
            ).length;
            return (
              <button
                key={c.key}
                onClick={() => seleccionarClase(c.key)}
                className={cn(
                  'card text-left transition-colors border',
                  activa ? 'border-magenta' : 'border-transparent hover:border-ink-muted/20'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold leading-tight">{c.titulo}</h3>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0', estilo.badge)}>
                    {c.categoria}
                  </span>
                </div>
                <p className="text-sm text-ink-muted">
                  {formatTime(c.hora)}
                  {c.detalle ? ` · ${c.detalle}` : ''}
                </p>
                <p className="text-xs text-ink-muted mt-2">
                  {cuantos === 0 ? 'Sin asistencias registradas' : `${cuantos} asistencia${cuantos === 1 ? '' : 's'}`}
                  {c.cancelada && ' · clase cancelada'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Avisos del servidor. Fuera del bloque de la clase: un registro manual
          se hace sin ninguna clase seleccionada y su aviso también cuenta. */}
      {resultados.length > 0 && (
        <div className="space-y-2 mb-8">
          <h3 className="text-lg font-bold">Últimos registros</h3>
          {resultados.map((r, i) => (
            <div key={`${r.alumno.id}-${i}`} className={cn('rounded-xl border p-4', TONO_CLASE[r.tono])}>
              <p className={cn('font-bold', TONO_TITULO[r.tono])}>{r.titulo}</p>
              <p className="text-sm text-ink-muted mt-1">{r.detalle}</p>
            </div>
          ))}
        </div>
      )}

      {clase && (
        <div className="space-y-6">
          <div className="card border-l-4 border-l-magenta">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold">{clase.titulo}</h2>
                <p className="text-sm text-ink-muted">
                  {formatDateStr(clase.fecha)} · {formatTime(clase.hora)} · {clase.categoria}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary flex items-center gap-2" onClick={() => setMostrandoQrClase(true)}>
                  <QrCode className="w-4 h-4" /> QR de la clase
                </button>
                <button className="btn-secondary flex items-center gap-2" onClick={() => abrirManual()}>
                  <PenLine className="w-4 h-4" /> Clase manual
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={() => setEscaneando(true)}>
                  <ScanLine className="w-4 h-4" /> Escanear carnet
                </button>
              </div>
            </div>

            {/* Registro manual: la misma clase, sin cámara. */}
            <label className="label">Registro manual</label>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                className="input pl-9"
                placeholder="Buscar alumno por nombre o documento"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {candidatos.map((s) => {
                const ya = presentes.has(s.id);
                return (
                  <button
                    key={s.id}
                    disabled={enCurso}
                    onClick={() => registrar(s.id, 'manual')}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      ya
                        ? 'bg-success/15 text-success'
                        : 'bg-surface hover:bg-surface-hover text-ink disabled:opacity-50'
                    )}
                  >
                    <span className="truncate">{s.nombre}</span>
                    {ya && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
              {candidatos.length === 0 && (
                <p className="text-sm text-ink-muted col-span-full py-4 text-center">
                  Ningún alumno coincide con la búsqueda.
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-3">Asistencia de esta clase</h3>
            {registros.length === 0 ? (
              <div className="card text-center p-8 text-ink-muted">
                <p>Todavía no hay nadie registrado en esta clase.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {registros.map((r) =>
                  filaRegistro(
                    r,
                    data.students.find((s) => s.id === r.alumnoId)?.nombre || 'Alumno desconocido',
                    anular
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Las clases manuales no cuelgan de ninguna clase de la agenda: sin esta
          lista no habría dónde verlas ni desde dónde anularlas. */}
      {registrosManuales.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-1">Clases registradas a mano</h3>
          <p className="text-sm text-ink-muted mb-3">
            Privadas y clases fuera de la agenda del {formatDateStr(fecha)}.
          </p>
          <div className="space-y-2">
            {registrosManuales.map((r) =>
              filaRegistro(
                r,
                data.students.find((s) => s.id === r.alumnoId)?.nombre || 'Alumno desconocido',
                anular,
                true
              )
            )}
          </div>
        </div>
      )}

      {/* QR propio de la clase, para proyectarlo o imprimirlo en la puerta. */}
      <AnimatePresence>
        {mostrandoQrClase && clase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
          >
            <div className="w-full max-w-sm bg-surface rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg">
                <h3 className="font-bold">QR de la clase</h3>
                <button onClick={() => setMostrandoQrClase(false)} className="icon-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG value={`CLASE:${clase.key}`} size={190} />
                </div>
                <div className="text-center">
                  <p className="font-bold">{clase.titulo}</p>
                  <p className="text-sm text-ink-muted">
                    {formatDateStr(clase.fecha)} · {formatTime(clase.hora)} · {clase.categoria}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-bg text-center text-sm text-ink-muted">
                Este código identifica esta clase concreta: al escanearlo desde aquí se abre su lista.
                La asistencia la registra el administrador escaneando el carnet del alumno.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Escáner de carnets */}
      <AnimatePresence>
        {escaneando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
          >
            <div className="w-full max-w-sm bg-surface rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg sticky top-0 z-10">
                <div>
                  <h3 className="font-bold">{clase ? 'Escanear carnet' : 'Escanear QR'}</h3>
                  <p className="text-xs text-ink-muted">
                    {clase
                      ? `${clase.titulo} · ${formatTime(clase.hora)}`
                      : 'Apunta al QR de una clase, o al carnet de un alumno'}
                  </p>
                </div>
                <button onClick={() => setEscaneando(false)} className="icon-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {errorCamara ? (
                <div className="p-6 text-center">
                  <TriangleAlert className="w-10 h-10 mx-auto mb-3 text-error" />
                  <p className="text-sm text-ink">{errorCamara}</p>
                  <p className="text-xs text-ink-muted mt-3">
                    También puedes pasar la lista a mano desde la clase, sin usar la cámara.
                  </p>
                </div>
              ) : (
                <div className="aspect-square bg-black relative">
                  <Scanner
                    onScan={(result) => {
                      if (result && result.length > 0) handleScan(result[0].rawValue);
                    }}
                    onError={(err) =>
                      setErrorCamara(
                        ERROR_CAMARA[err.kind] || err.message || 'No se pudo iniciar la cámara.'
                      )
                    }
                    components={{ finder: true }}
                    // El pitido va en `sound`, no en `components`: allí la librería lo
                    // ignora y suena en cada lectura.
                    sound={false}
                    // Sin esto la cámara ignora un código que ya vio, y un
                    // carnet que falló no se podría volver a escanear; el
                    // rebote se controla en handleScan.
                    allowMultiple
                    scanDelay={600}
                  />
                </div>
              )}

              {/* Carnet leído antes de elegir la clase: se resuelve aquí mismo. */}
              {pendiente && (
                <div className="m-4 rounded-xl border border-pending/40 bg-pending/10 p-3">
                  <p className="font-bold text-sm text-pending">
                    ¿En qué clase entra {pendiente.nombre}?
                  </p>
                  <p className="text-xs text-ink-muted mt-1 mb-3">
                    Elige la clase y su asistencia queda registrada. Si su clase no está en la
                    agenda —una privada, por ejemplo— regístrala a mano.
                  </p>
                  <div className="flex flex-col gap-2">
                    {clases.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => activarClase(c)}
                        disabled={enCurso}
                        className="text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-hover text-sm disabled:opacity-50"
                      >
                        <span className="font-semibold">{c.titulo}</span>
                        <span className="text-ink-muted"> · {formatTime(c.hora)}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const alumno = data.students.find((x) => x.id === pendiente.id) || null;
                        setPendiente(null);
                        abrirManual(alumno, pendiente.qr);
                      }}
                      disabled={enCurso}
                      className="text-left px-3 py-2 rounded-lg border border-magenta/40 bg-magenta/10 text-sm text-magenta font-semibold disabled:opacity-50 flex items-center gap-2"
                    >
                      <PenLine className="w-4 h-4" /> Ninguna · registrar clase manual
                    </button>
                  </div>
                </div>
              )}

              {resultados.length > 0 && (
                <div className={cn('m-4 rounded-xl border p-3', TONO_CLASE[resultados[0].tono])}>
                  <p className={cn('font-bold text-sm', TONO_TITULO[resultados[0].tono])}>
                    {resultados[0].titulo}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">{resultados[0].detalle}</p>
                </div>
              )}
              <div className="p-4 bg-bg text-center text-sm text-ink-muted">
                {clase
                  ? 'Apunta la cámara al QR del carnet. Puedes escanear varios seguidos sin cerrar la ventana.'
                  : 'Escanea el QR de la clase para abrir su lista, o el carnet del alumno: si su clase no está en la agenda se registra a mano, sin salir de aquí.'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registro de una clase que no está en la agenda: privada, o de academia
          sin programar. Se dibuja por encima del escáner para poder resolver un
          carnet recién leído sin cerrar la cámara. */}
      <AnimatePresence>
        {manual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
          >
            <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg rounded-t-2xl">
                <div>
                  <h3 className="font-bold">Registrar clase manual</h3>
                  <p className="text-xs text-ink-muted">
                    {alumnoManual
                      ? `${alumnoManual.nombre} · ${etiquetaTipo(alumnoManual.tipo)}`
                      : 'Para una clase que no está en la agenda'}
                  </p>
                </div>
                <button onClick={() => setManual(null)} className="icon-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                {alumnoManual ? (
                  <div className="rounded-xl border border-magenta/30 bg-magenta/10 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{alumnoManual.nombre}</p>
                      <p className="text-xs text-ink-muted">
                        {etiquetaTipo(alumnoManual.tipo)} · nivel {alumnoManual.nivel}
                      </p>
                    </div>
                    <button
                      className="text-xs text-magenta hover:underline shrink-0"
                      onClick={() => setManual({ ...manual, alumnoId: '', qr: undefined })}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="label">Alumno</label>
                    <div className="relative mb-2">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="text"
                        className="input pl-9"
                        placeholder="Buscar por nombre o documento"
                        value={busquedaManual}
                        onChange={(e) => setBusquedaManual(e.target.value)}
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {candidatosManual.map((s) => (
                        <button
                          key={s.id}
                          onClick={() =>
                            // Elegir al alumno vuelve a proponer la clase que le
                            // corresponde: su carnet es lo que la decide.
                            setManual({ ...manual, alumnoId: s.id, categoria: categoriaSugerida(s) })
                          }
                          className="w-full text-left px-3 py-2 rounded-lg bg-bg hover:bg-surface-hover text-sm"
                        >
                          <span className="font-medium">{s.nombre}</span>
                          <span className="text-ink-muted text-xs"> · {etiquetaTipo(s.tipo)}</span>
                        </button>
                      ))}
                      {candidatosManual.length === 0 && (
                        <p className="text-sm text-ink-muted py-3 text-center">
                          Ningún alumno coincide con la búsqueda.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">Tipo de clase</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_MANUALES.map((c) => {
                      const activa = manual.categoria === c;
                      return (
                        <button
                          key={c}
                          onClick={() => setManual({ ...manual, categoria: c })}
                          className={cn(
                            'px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors',
                            activa
                              ? 'border-magenta bg-magenta/15 text-magenta'
                              : 'border-ink-muted/20 bg-bg text-ink-muted hover:text-ink'
                          )}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-ink-muted mt-2">
                    {manual.categoria === 'Privada'
                      ? 'Clase uno a uno. Se descuenta del paquete de clases del alumno.'
                      : 'Clase de academia registrada fuera de la agenda, en el nivel elegido.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Fecha</label>
                    <input
                      type="date"
                      className="input"
                      value={manual.fecha}
                      onChange={(e) => setManual({ ...manual, fecha: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Hora</label>
                    <input
                      type="time"
                      className="input"
                      value={manual.hora}
                      onChange={(e) => setManual({ ...manual, hora: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Notas</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Opcional: profesor, lugar, acuerdo de cobro…"
                    value={manual.notas}
                    onChange={(e) => setManual({ ...manual, notas: e.target.value })}
                  />
                </div>

                {/* Decisión explícita: la clase se registra sin tocar el plan. */}
                <label className="flex items-start gap-3 rounded-xl border border-ink-muted/20 bg-bg p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-magenta mt-0.5 shrink-0"
                    checked={manual.sinDescuento}
                    onChange={(e) => setManual({ ...manual, sinDescuento: e.target.checked })}
                  />
                  <span>
                    <span className="text-sm font-medium">Sin plan · cobrar aparte</span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      Registra la clase sin descontarla de ningún plan. Sin marcar, el sistema elige
                      el plan del alumno y descuenta según corresponda.
                    </span>
                  </span>
                </label>
              </div>

              <div className="p-4 bg-bg border-t border-ink-muted/10 rounded-b-2xl flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button className="btn-secondary" onClick={() => setManual(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary flex items-center justify-center gap-2"
                  disabled={!manual.alumnoId || !manual.fecha || enCurso}
                  onClick={registrarManual}
                >
                  <Check className="w-4 h-4" />
                  {enCurso ? 'Registrando…' : 'Registrar asistencia'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
