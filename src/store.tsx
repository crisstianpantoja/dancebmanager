import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Student, Session, Teacher, Payment, Academy, Gig, PlanTemplate, AcademyPayment, Expense, AppNotification } from './types';
import { storage } from './lib/storage';
import {
  ApiError,
  apiLogin,
  fetchAppData,
  saveAppData,
  setAuthToken,
  type AppRole,
  type SessionUser,
} from './lib/api';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface AppData {
  notifications: AppNotification[];
  teachers: Teacher[];
  students: Student[];
  sessions: Session[];
  payments: Payment[];
  academies: Academy[];
  gigs: Gig[];
  plans: PlanTemplate[];
  expenses: Expense[];
  academyLogs: Record<string, 'dictada' | 'cancelada'>;
  academyPayments: AcademyPayment[];
  events: import('./types').DanceEvent[];
  /**
   * Clases asistidas. Se leen desde la base pero nunca se envían en un guardado:
   * sólo el administrador las escribe, a través de /api/asistencia.
   */
  attendanceRecords: import('./types').AttendanceRecord[];
  /**
   * Programación recurrente y las clases que genera. Igual que la asistencia:
   * se leen desde la base pero se escriben sólo por /api/clases, así que no
   * viajan nunca en el payload de un guardado (ver `updateData`).
   */
  classSeries: import('./types').ClassSeries[];
  classOccurrences: import('./types').ClassOccurrence[];
  settings: import('./types').AppSettings;
}

/** Sesión activa. `token` va firmado por el servidor; nunca contiene la contraseña. */
export interface AuthSession {
  token: string;
  user: SessionUser;
}

const SESSION_KEY = 'danceb_session';
/** Clave del antiguo inicio de sesión sin token, que ya no es válido. */
const LEGACY_SESSION_KEY = 'danceb_currentUser';

interface StoreContextType {
  data: AppData;
  /** Guarda las colecciones indicadas en la base de datos. Devuelve false si falla. */
  updateData: (newData: Partial<AppData>) => Promise<boolean>;
  loading: boolean;
  /** true mientras hay una escritura en vuelo hacia la base de datos. */
  saving: boolean;
  /** Vuelve a leer todo desde la base de datos. */
  refresh: () => Promise<void>;
  /**
   * Deja en el estado la programación que devolvió /api/clases. No guarda nada:
   * la escritura ya la hizo el servidor, esto sólo refresca la pantalla.
   */
  applyProgramacion: (
    series: import('./types').ClassSeries[],
    clases: import('./types').ClassOccurrence[]
  ) => void;
  currentUser: { id: string, rol: AppRole } | null;
  /** true mientras la persona tenga una contraseña temporal sin cambiar. */
  mustChangePassword: boolean;
  /** Verifica las credenciales contra el servidor y abre la sesión. */
  signIn: (documento: string, password: string, rol: AppRole) => Promise<void>;
  /** Se llama tras definir una contraseña nueva, para liberar la pantalla obligatoria. */
  clearPasswordChangeFlag: () => void;
  logout: () => void;
  toasts: Toast[];
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
}

const defaultData: AppData = {
  notifications: [],
  teachers: [],
  students: [],
  sessions: [],
  payments: [],
  gigs: [],
  expenses: [],
  academyLogs: {},
  academyPayments: [],
  plans: [],
  events: [],
  attendanceRecords: [],
  classSeries: [],
  classOccurrences: [],
  settings: {
    showLoginLogo: false
  },
  academies: []
};

/** Claves del antiguo guardado en el navegador, para subirlas la primera vez. */
const LEGACY_KEYS: Array<[keyof AppData, string]> = [
  ['teachers', 'danceb_teachers'],
  ['students', 'danceb_students'],
  ['sessions', 'danceb_sessions'],
  ['payments', 'danceb_payments'],
  ['academies', 'danceb_academias'],
  ['gigs', 'danceb_gigs'],
  ['plans', 'danceb_plans'],
  ['expenses', 'danceb_expenses'],
  ['academyLogs', 'danceb_academyLogs'],
  ['academyPayments', 'danceb_academyPayments'],
  ['notifications', 'danceb_notifications'],
  ['events', 'danceb_events'],
  ['settings', 'danceb_settings'],
];

const MIGRATION_FLAG = 'danceb_migrated_to_db';

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

/**
 * Recoge lo que quedó guardado en el navegador de sesiones anteriores.
 * Se sube una única vez, cuando la base de datos aún está vacía.
 */
async function collectLegacyData(): Promise<Partial<AppData>> {
  if (await storage.get(MIGRATION_FLAG)) return {};

  const legacy: Partial<AppData> = {};
  for (const [key, storageKey] of LEGACY_KEYS) {
    try {
      const value = await storage.get(storageKey);
      if (hasContent(value)) (legacy as Record<string, unknown>)[key] = value;
    } catch {
      /* una clave ilegible no debe impedir el resto de la migración */
    }
  }
  return legacy;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const currentUser = session ? { id: session.user.id, rol: session.user.rol } : null;
  const [toasts, setToasts] = useState<Toast[]>([]);

  /** Las escrituras se encadenan para que no se pisen entre ellas. */
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingWrites = useRef(0);
  /** Espejo del estado para poder construir el payload sin depender del render. */
  const dataRef = useRef<AppData>(defaultData);

  useEffect(() => { dataRef.current = data; }, [data]);

  const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const applyServerData = useCallback((incoming: Partial<AppData>) => {
    setData({
      ...defaultData,
      ...incoming,
      settings: { ...defaultData.settings, ...(incoming.settings || {}) },
    });
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    setSession(null);
    storage.set(SESSION_KEY, null);
    // Sin sesión sólo quedan los ajustes visuales, así que se descarta el resto.
    setData(prev => ({ ...defaultData, settings: prev.settings }));
  }, []);

  const refresh = useCallback(async () => {
    const result = await fetchAppData();
    // Un token vencido devuelve la respuesta pública: hay que volver a entrar.
    if (!result.authenticated) {
      clearSession();
      return;
    }
    applyServerData(result.data);
  }, [applyServerData, clearSession]);

  /**
   * Trae todo el estado tras abrir sesión y, la primera vez contra una base
   * vacía, sube lo que hubiera quedado guardado en este navegador.
   */
  const loadAuthenticatedData = useCallback(async () => {
    let result = await fetchAppData();
    if (!result.authenticated) {
      clearSession();
      return;
    }

    if (result.empty) {
      const legacy = await collectLegacyData();
      if (Object.keys(legacy).length > 0) {
        await saveAppData(legacy);
        result = await fetchAppData();
      }
    }
    await storage.set(MIGRATION_FLAG, true);
    applyServerData(result.data);
  }, [applyServerData, clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // El inicio de sesión anterior no llevaba token firmado: ya no sirve.
        await storage.set(LEGACY_SESSION_KEY, null);

        const stored = (await storage.get(SESSION_KEY)) as AuthSession | null;
        if (stored?.token && stored.user?.id) {
          setAuthToken(stored.token);
          const result = await fetchAppData();
          if (cancelled) return;

          if (result.authenticated) {
            setSession(stored);
            applyServerData(result.data);
          } else {
            // Token vencido o revocado: se vuelve a la pantalla de entrada.
            setAuthToken(null);
            await storage.set(SESSION_KEY, null);
            applyServerData((await fetchAppData()).data);
          }
        } else {
          setAuthToken(null);
          const result = await fetchAppData();
          if (!cancelled) applyServerData(result.data);
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        if (!cancelled) {
          addToast('No se pudo conectar con la base de datos. Revisa tu conexión.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [applyServerData, addToast]);

  /**
   * Las credenciales se verifican en el servidor: el navegador sólo recibe un
   * token firmado y los datos del usuario, nunca un hash.
   */
  const signIn = useCallback(async (documento: string, password: string, rol: AppRole) => {
    const result = await apiLogin(documento, password, rol);
    const next: AuthSession = { token: result.token, user: result.user };
    setAuthToken(next.token);
    // Mientras llegan los datos autenticados se muestra la pantalla de carga en
    // vez del portal. Si no, la app pintaría el portal con los datos públicos
    // previos al login —donde el alumno aún no está— y saldría "Estudiante no
    // encontrado" / "no tienes calendario" hasta recargar a mano.
    setLoading(true);
    setSession(next);
    await storage.set(SESSION_KEY, next);
    try {
      await loadAuthenticatedData();
    } finally {
      setLoading(false);
    }
  }, [loadAuthenticatedData]);

  const applyProgramacion = useCallback(
    (
      series: import('./types').ClassSeries[],
      clases: import('./types').ClassOccurrence[]
    ) => {
      setData(prev => ({ ...prev, classSeries: series, classOccurrences: clases }));
    },
    []
  );

  const clearPasswordChangeFlag = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev;
      const next: AuthSession = { ...prev, user: { ...prev.user, mustChangePassword: false } };
      storage.set(SESSION_KEY, next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const updateData = useCallback(async (newData: Partial<AppData>): Promise<boolean> => {
    if (Object.keys(newData).length === 0) return true;

    // Cada colección enviada reemplaza a la almacenada, así que los ajustes
    // viajan completos aunque la pantalla sólo haya cambiado un campo.
    const payload: Partial<AppData> = { ...newData };
    // Colecciones que sólo escribe el servidor. El backend las ignora de todos
    // modos; no enviarlas evita que un guardado grande cargue con ellas.
    delete payload.attendanceRecords;
    delete payload.classSeries;
    delete payload.classOccurrences;
    if (newData.settings) {
      payload.settings = { ...dataRef.current.settings, ...newData.settings };
    }

    // Actualización optimista: la interfaz responde de inmediato.
    setData(prev => ({
      ...prev,
      ...newData,
      settings: newData.settings ? { ...prev.settings, ...newData.settings } : prev.settings,
    }));

    pendingWrites.current += 1;
    setSaving(true);

    const write = writeQueue.current
      .then(() => saveAppData(payload))
      .then(() => true)
      .catch((e: unknown) => {
        console.error('Failed to save data:', e);
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          addToast('Tu sesión terminó. Vuelve a iniciar sesión.', 'error');
          clearSession();
          return false;
        }
        // El servidor rechaza un documento repetido con un 409: se muestra tal cual.
        addToast(
          e instanceof ApiError && e.status === 409
            ? e.message
            : 'No se pudieron guardar los cambios en la base de datos.',
          'error'
        );
        // Se recarga el estado real para no mostrar datos que no se guardaron.
        return refresh().catch(() => undefined).then(() => false);
      })
      .finally(() => {
        pendingWrites.current -= 1;
        if (pendingWrites.current === 0) setSaving(false);
      });

    writeQueue.current = write;
    return write;
  }, [addToast, refresh, clearSession]);

  return (
    <StoreContext.Provider value={{
      data,
      updateData,
      loading,
      saving,
      refresh,
      applyProgramacion,
      currentUser,
      mustChangePassword: session?.user.mustChangePassword === true,
      signIn,
      clearPasswordChangeFlag,
      logout,
      toasts,
      addToast,
      removeToast,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
