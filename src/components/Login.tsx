import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { LogIn, User, Shield, KeyRound } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiRequestPasswordReset } from '../lib/api';
import type { AppRole } from '../lib/api';

const ROLES: Array<{ value: Extract<AppRole, 'alumno' | 'administrador'>; label: string; Icon: typeof User }> = [
  { value: 'alumno', label: 'Alumno', Icon: User },
  { value: 'administrador', label: 'Administrador', Icon: Shield },
];

export function Login() {
  const { data, signIn } = useStore();

  const [role, setRole] = useState<'alumno' | 'administrador'>('alumno');
  const [documento, setDocumento] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Solicitud de restablecimiento: la atiende el administrador a mano. */
  const [pidiendoReset, setPidiendoReset] = useState(false);
  const [resetMensaje, setResetMensaje] = useState('');

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectRole = (next: 'alumno' | 'administrador') => {
    setRole(next);
    setError('');
    setResetMensaje('');
  };

  /**
   * Deja la solicitud registrada para el administrador. La respuesta es la
   * misma exista o no la cuenta, para que esta pantalla no sirva para
   * averiguar qué documentos están registrados.
   */
  const handleResetRequest = async () => {
    setError('');
    setResetMensaje('');
    if (!documento.trim()) {
      setError('Escribe tu número de documento y vuelve a intentarlo');
      return;
    }
    setPidiendoReset(true);
    try {
      const respuesta = await apiRequestPasswordReset(documento.trim(), role);
      setResetMensaje(respuesta.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setPidiendoReset(false);
    }
  };

  /** El selector de rol se maneja con flechas, como un grupo de pestañas. */
  const handleTabKeys = (event: React.KeyboardEvent, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const nextIndex = (index + offset + ROLES.length) % ROLES.length;
    selectRole(ROLES[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!documento.trim()) {
      setError('Ingresa tu número de documento');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(documento.trim(), password, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-bg"
      style={data.settings?.loginBackgroundUrl ? {
        backgroundImage: `url(${data.settings.loginBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      } : {}}
    >
      {/* Decorative Orbs if no background image */}
      {!data.settings?.loginBackgroundUrl && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-magenta/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-academy/20 rounded-full blur-[120px] pointer-events-none" />
        </>
      )}

      <div className="max-w-md w-full bg-surface/80 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl border border-white/5 relative z-10">
        <div className="text-center mb-8">
          {data.settings?.showLoginLogo && data.settings?.loginLogoUrl ? (
            <img src={data.settings.loginLogoUrl} alt="Logo" className="max-h-24 mx-auto mb-4 object-contain" />
          ) : (
            <h1 className="text-3xl font-bold text-magenta tracking-tight mb-2">{data.settings?.brandName || 'DanceB'}</h1>
          )}
          <p className="text-ink-muted">Inicia sesión en tu cuenta</p>
        </div>

        {/*
          Selector de rol. El estado activo es el que resalta: superficie más
          clara, texto e icono en magenta y un indicador bajo la etiqueta. El
          inactivo queda apagado hasta que recibe el puntero o el foco.
        */}
        <div
          role="tablist"
          aria-label="Tipo de cuenta"
          className="grid grid-cols-2 gap-1.5 mb-8 bg-bg p-1.5 rounded-xl border border-white/5"
        >
          {ROLES.map(({ value, label, Icon }, index) => {
            const active = role === value;
            return (
              <button
                key={value}
                ref={(node) => { tabRefs.current[index] = node; }}
                type="button"
                role="tab"
                id={`role-tab-${value}`}
                aria-selected={active}
                aria-controls="login-fields"
                tabIndex={active ? 0 : -1}
                onClick={() => selectRole(value)}
                onKeyDown={(event) => handleTabKeys(event, index)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold',
                  'transition-all duration-150 outline-none',
                  'focus-visible:ring-2 focus-visible:ring-magenta focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  active
                    ? 'bg-surface-hover text-ink shadow-md ring-1 ring-magenta/60'
                    : 'bg-transparent text-ink-muted/70 hover:bg-white/5 hover:text-ink'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className={cn('w-4 h-4 transition-colors', active ? 'text-magenta' : 'text-ink-muted/70')} />
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-0.5 w-8 rounded-full transition-all duration-150',
                    active ? 'bg-magenta opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            );
          })}
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div id="login-fields" role="tabpanel" aria-labelledby={`role-tab-${role}`} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-documento">Número de documento</label>
              <input
                id="login-documento"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                className="input"
                placeholder="Documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                className="input"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && <p className="text-error text-sm font-medium text-center" role="alert">{error}</p>}
          {resetMensaje && (
            <p className="text-sm text-ink-muted text-center bg-bg/60 border border-white/5 rounded-xl p-3" role="status">
              {resetMensaje}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex justify-center items-center gap-2 py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn className="w-5 h-5" /> {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={handleResetRequest}
            disabled={pidiendoReset}
            className="w-full flex justify-center items-center gap-2 text-sm text-ink-muted hover:text-magenta transition-colors disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" />
            {pidiendoReset ? 'Enviando solicitud…' : '¿Olvidaste tu contraseña?'}
          </button>
        </form>
      </div>
    </div>
  );
}
