import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { apiChangePassword } from '../lib/api';

const MIN_LENGTH = 8;

/**
 * Pantalla obligatoria tras iniciar sesión con una contraseña temporal.
 * No hay forma de saltarla: se muestra en lugar de la aplicación hasta que la
 * persona define una contraseña propia (o cierra la sesión).
 */
export function ForcePasswordChange() {
  const { data, logout, clearPasswordChangeFlag, refresh, addToast } = useStore();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las dos contraseñas no coinciden');
      return;
    }

    setSubmitting(true);
    try {
      await apiChangePassword({ newPassword });
      clearPasswordChangeFlag();
      addToast('Contraseña actualizada', 'success');
      await refresh().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-magenta/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-surface/90 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl border border-white/5 relative z-10">
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-magenta/15 text-magenta flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Define tu contraseña</h1>
          <p className="text-ink-muted text-sm">
            Tu acceso a {data.settings?.brandName || 'DanceB'} se creó con una contraseña temporal.
            Elige una nueva para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="new-password">Contraseña nueva</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="input"
              placeholder="Contraseña nueva"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="hint">Mínimo {MIN_LENGTH} caracteres. No puede ser igual a tu documento.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirmar contraseña</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="input"
              placeholder="Confirmar contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-error text-sm font-medium text-center" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex justify-center items-center gap-2 py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <KeyRound className="w-5 h-5" /> {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="mt-5 w-full text-sm text-ink-muted hover:text-ink flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
