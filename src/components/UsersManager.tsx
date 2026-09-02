import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit,
  KeyRound,
  Plus,
  Power,
  PowerOff,
  Search,
  Shield,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { PasswordResetRequest, Student } from '../types';
import { DeleteButton } from './DeleteButton';
import { CopyField } from './CopyField';
import { UserImport } from './UserImport';
import {
  apiCreateUsers,
  apiDismissResetRequest,
  apiListResetRequests,
  apiResetPassword,
  apiResolveResetRequest,
} from '../lib/api';

/** Contraseña temporal recién generada, visible una sola vez. */
interface TempPasswordResult {
  nombre: string;
  documento: string;
  tempPassword: string;
  /** true cuando viene de crear el usuario, no de restablecer. */
  isNew: boolean;
}

export function UsersManager() {
  const { data, updateData, addToast, refresh } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'todos' | 'administrador' | 'alumno'>('todos');

  const [isEditing, setIsEditing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<Student>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<TempPasswordResult | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  /**
   * Solicitudes de restablecimiento que llegan desde el inicio de sesión. No
   * viajan con el resto de los datos: llevan documento y contacto, así que
   * sólo las devuelve el endpoint de administración.
   */
  const [solicitudes, setSolicitudes] = useState<PasswordResetRequest[]>([]);
  const [atendiendo, setAtendiendo] = useState<string | null>(null);

  const users = data.students.filter(s => {
    if (filterRole !== 'todos' && s.rol !== filterRole) return false;
    if (searchTerm && !s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) && !s.documento?.includes(searchTerm)) return false;
    return true;
  });

  const documentos = useMemo(
    () => new Set(data.students.map(s => (s.documento || '').trim()).filter(Boolean)),
    [data.students]
  );

  /**
   * Documentos que aparecen más de una vez. Son datos heredados: se marcan en
   * la tabla para que se puedan corregir, porque las altas nuevas ya no los
   * permiten ni en el cliente ni en el servidor.
   */
  const repeatedDocumentos = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of data.students) {
      const documento = (s.documento || '').trim();
      if (!documento) continue;
      seen.set(documento, (seen.get(documento) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([documento]) => documento));
  }, [data.students]);

  const openNew = () => {
    setEditingUser({ rol: 'alumno', activo: true });
    setFormError('');
    setIsEditing(true);
  };

  const openEdit = (user: Student) => {
    setEditingUser(user);
    setFormError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const nombre = (editingUser.nombre || '').trim();
    const documento = (editingUser.documento || '').trim();
    setFormError('');

    if (!nombre || !documento) {
      setFormError('Nombre y documento son obligatorios');
      return;
    }
    // El documento es la llave con la que se inicia sesión: no puede repetirse.
    const duplicado = data.students.some(s => (s.documento || '').trim() === documento && s.id !== editingUser.id);
    if (duplicado) {
      setFormError(`Ya existe un usuario con el documento ${documento}`);
      return;
    }

    setSaving(true);
    try {
      if (editingUser.id) {
        const updated = { ...editingUser, nombre, documento } as Student;
        const ok = await updateData({ students: data.students.map(s => s.id === editingUser.id ? updated : s) });
        if (!ok) return;
        addToast('Usuario actualizado', 'success');
        setIsEditing(false);
      } else {
        // El alta la hace el servidor: es quien genera y hashea la contraseña
        // temporal, que se muestra una única vez.
        const { created } = await apiCreateUsers([{
          nombre,
          documento,
          rol: (editingUser.rol as string) || 'alumno',
          contacto: editingUser.contacto || '',
        }]);
        await refresh().catch(() => undefined);
        setIsEditing(false);
        const user = created[0];
        if (user) {
          setTempPassword({ nombre: user.nombre, documento: user.documento, tempPassword: user.tempPassword, isNew: true });
        }
        addToast('Usuario creado', 'success');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  const cargarSolicitudes = useCallback(async () => {
    try {
      const { requests } = await apiListResetRequests();
      setSolicitudes(requests);
    } catch {
      // Sin solicitudes visibles el resto de la pantalla sigue sirviendo.
      setSolicitudes([]);
    }
  }, []);

  useEffect(() => { void cargarSolicitudes(); }, [cargarSolicitudes]);

  /** Atiende una solicitud: genera la temporal y la muestra una única vez. */
  const atenderSolicitud = async (solicitud: PasswordResetRequest) => {
    if (atendiendo) return;
    setAtendiendo(solicitud.id);
    try {
      const result = await apiResolveResetRequest(solicitud.id);
      setTempPassword({
        nombre: result.nombre || solicitud.nombre,
        documento: result.documento || solicitud.documento,
        tempPassword: result.tempPassword,
        isNew: false,
      });
      await cargarSolicitudes();
      await refresh().catch(() => undefined);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo atender la solicitud', 'error');
    } finally {
      setAtendiendo(null);
    }
  };

  const descartarSolicitud = async (solicitud: PasswordResetRequest) => {
    if (atendiendo) return;
    setAtendiendo(solicitud.id);
    try {
      await apiDismissResetRequest(solicitud.id);
      await cargarSolicitudes();
      addToast('Solicitud descartada', 'info');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo descartar la solicitud', 'error');
    } finally {
      setAtendiendo(null);
    }
  };

  /**
   * Genera una contraseña temporal. El administrador nunca ve la contraseña
   * vigente: sólo puede sustituirla por una de un solo uso.
   */
  const handleReset = async (user: Student) => {
    setResettingId(user.id);
    try {
      const result = await apiResetPassword(user.id, 'student');
      setTempPassword({
        nombre: result.nombre || user.nombre,
        documento: result.documento || user.documento || '',
        tempPassword: result.tempPassword,
        isNew: false,
      });
      await refresh().catch(() => undefined);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña', 'error');
    } finally {
      setResettingId(null);
    }
  };

  const toggleActive = (userId: string, currentStatus: boolean) => {
    updateData({ students: data.students.map(s => s.id === userId ? { ...s, activo: !currentStatus } : s) });
    addToast(currentStatus ? 'Usuario desactivado' : 'Usuario activado', 'info');
  };

  const rowActions = (u: Student, variant: 'desktop' | 'mobile') => (
    <div className="flex justify-end gap-1.5">
      <button
        onClick={() => openEdit(u)}
        className={variant === 'mobile' ? 'icon-btn bg-surface' : 'icon-btn'}
        aria-label={`Editar ${u.nombre}`}
        title="Editar"
      >
        <Edit className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleReset(u)}
        disabled={resettingId === u.id}
        className={`${variant === 'mobile' ? 'icon-btn bg-surface' : 'icon-btn'} disabled:opacity-50`}
        aria-label={`Restablecer contraseña de ${u.nombre}`}
        title="Restablecer contraseña"
      >
        <KeyRound className="w-4 h-4" />
      </button>
      <DeleteButton
        onConfirm={() => {
          updateData({ students: data.students.filter(s => s.id !== u.id) });
        }}
        className={`icon-btn-danger${variant === 'mobile' ? ' bg-surface' : ''}`}
        iconOnly={true}
        label={`Eliminar ${u.nombre}`}
      />
    </div>
  );

  return (
    <div className="p-4 md:p-8 pt-8 md:pt-12 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-magenta" />
            Gestión de Usuarios
          </h1>
          <p className="text-ink-muted mt-1">Administra accesos y contraseñas</p>
        </div>
        {!isEditing && !isImporting && (
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setIsImporting(true)} className="btn-secondary flex items-center gap-2">
              <Upload className="w-5 h-5" /> Carga masiva
            </button>
            <button onClick={openNew} className="btn-primary flex items-center gap-2">
              <Plus className="w-5 h-5" /> Nuevo Usuario
            </button>
          </div>
        )}
      </header>

      {/* La contraseña temporal se muestra una única vez, aquí y en ningún otro sitio. */}
      {tempPassword && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Contraseña temporal"
        >
          <div className="bg-surface rounded-2xl border border-white/10 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-magenta" />
                {tempPassword.isNew ? 'Usuario creado' : 'Contraseña restablecida'}
              </h2>
              <button onClick={() => setTempPassword(null)} className="icon-btn" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-ink-muted mb-4">
              <span className="text-ink font-medium">{tempPassword.nombre}</span>
              {tempPassword.documento && <> · documento {tempPassword.documento}</>}
            </p>

            <CopyField value={tempPassword.tempPassword} label="Contraseña temporal" className="mb-4" />

            <div className="flex items-start gap-3 rounded-xl border border-pending/30 bg-pending/10 p-4">
              <AlertTriangle className="w-5 h-5 text-pending shrink-0 mt-0.5" />
              <p className="text-sm text-ink">
                Se muestra una sola vez. Entrégala a la persona: al iniciar sesión deberá definir su
                propia contraseña.
              </p>
            </div>

            <div className="flex justify-end pt-5">
              <button onClick={() => setTempPassword(null)} className="btn-primary">Entendido</button>
            </div>
          </div>
        </div>
      )}

      {/* Solicitudes de contraseña pedidas desde el inicio de sesión. */}
      {!isEditing && !isImporting && solicitudes.length > 0 && (
        <section className="card p-5 mb-6 border-l-4 border-l-pending">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-5 h-5 text-pending" />
            <h2 className="text-lg font-bold">Solicitudes de contraseña</h2>
            <span className="bg-pending/20 text-pending text-xs font-bold px-2 py-0.5 rounded-full">
              {solicitudes.length}
            </span>
          </div>
          <p className="text-sm text-ink-muted mb-4">
            Genera la contraseña temporal y entrégasela a la persona: al entrar tendrá que definir
            la suya.
          </p>
          <ul className="space-y-3">
            {solicitudes.map(solicitud => (
              <li
                key={solicitud.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-surface-hover/50 border border-pending/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{solicitud.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-ink-muted">
                    Documento {solicitud.documento}
                    {solicitud.contacto && ` · ${solicitud.contacto}`}
                    {solicitud.intentos > 1 && ` · ${solicitud.intentos} intentos`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => atenderSolicitud(solicitud)}
                    disabled={atendiendo === solicitud.id}
                    className="btn-primary py-1.5 px-3 text-xs disabled:opacity-50"
                  >
                    Generar contraseña temporal
                  </button>
                  <button
                    onClick={() => descartarSolicitud(solicitud)}
                    disabled={atendiendo === solicitud.id}
                    className="icon-btn-danger disabled:opacity-50"
                    aria-label={`Descartar la solicitud de ${solicitud.nombre || solicitud.documento}`}
                    title="Descartar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isImporting ? (
        <UserImport
          existingDocumentos={documentos}
          onClose={() => setIsImporting(false)}
          onImported={() => { refresh().catch(() => undefined); }}
        />
      ) : isEditing ? (
        <div className="card p-6 md:p-8 max-w-2xl mx-auto w-full">
          <h2 className="text-xl font-bold mb-6">{editingUser.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="label" htmlFor="user-nombre">Nombre Completo</label>
              <input id="user-nombre" type="text" className="input" placeholder="Nombre" value={editingUser.nombre || ''} onChange={e => setEditingUser({...editingUser, nombre: e.target.value})} />
            </div>
            <div>
              <label className="label" htmlFor="user-documento">Número de Documento</label>
              <input id="user-documento" type="text" inputMode="numeric" className="input" placeholder="Documento" value={editingUser.documento || ''} onChange={e => setEditingUser({...editingUser, documento: e.target.value})} />
              <p className="hint">Con este número inicia sesión la persona. No puede repetirse.</p>
            </div>
            <div>
              <label className="label" htmlFor="user-rol">Rol</label>
              <select id="user-rol" className="input" value={editingUser.rol || 'alumno'} onChange={e => setEditingUser({...editingUser, rol: e.target.value as any})}>
                <option value="alumno">Alumno</option>
                <option value="administrador">Administrador</option>
              </select>
              <p className="hint">Los administradores ven toda la plataforma.</p>
            </div>
            <div>
              <label className="label" htmlFor="user-contacto">Contacto</label>
              <input id="user-contacto" type="text" className="input" placeholder="Contacto" value={editingUser.contacto || ''} onChange={e => setEditingUser({...editingUser, contacto: e.target.value})} />
              <p className="hint">Celular o correo, opcional.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-bg p-4 mb-6">
            <KeyRound className="w-5 h-5 text-magenta shrink-0 mt-0.5" />
            <p className="text-sm text-ink-muted">
              {editingUser.id
                ? 'Las contraseñas no se pueden consultar ni editar desde aquí. Usa «Restablecer contraseña» en la lista para generar una temporal.'
                : 'Al guardar se generará una contraseña temporal, que verás una sola vez. La persona deberá cambiarla al iniciar sesión.'}
            </p>
          </div>

          {formError && <p className="text-error text-sm font-medium mb-4" role="alert">{formError}</p>}

          <div className="flex justify-end gap-3 pt-4 border-t border-ink-muted/10">
            <button className="btn-secondary" onClick={() => setIsEditing(false)}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" disabled={saving} onClick={handleSave}>
              {saving ? 'Guardando…' : 'Guardar Usuario'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-ink-muted/10 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar"
                aria-label="Buscar usuarios"
                className="input pl-10 w-full"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input w-full md:w-48"
              aria-label="Filtrar por rol"
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as any)}
            >
              <option value="todos">Todos los Roles</option>
              <option value="administrador">Administradores</option>
              <option value="alumno">Alumnos</option>
            </select>
          </div>

          <div className="overflow-x-auto flex-1">
            {/* Desktop Table */}
            <table className="hidden md:table w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg text-ink-muted text-sm">
                  <th className="p-4 font-medium border-b border-ink-muted/10">Nombre</th>
                  <th className="p-4 font-medium border-b border-ink-muted/10">Documento</th>
                  <th className="p-4 font-medium border-b border-ink-muted/10">Rol</th>
                  <th className="p-4 font-medium border-b border-ink-muted/10">Estado</th>
                  <th className="p-4 font-medium border-b border-ink-muted/10 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-ink-muted/5 hover:bg-surface-hover transition-colors">
                    <td className="p-4 font-medium">
                      <span className="flex items-center gap-2">
                        {u.rol === 'administrador' ? <Shield className="w-4 h-4 text-magenta" /> : <User className="w-4 h-4 text-ink-muted" />}
                        {u.nombre}
                        {u.mustChangePassword && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-pending/20 text-pending font-semibold">
                            Debe cambiar contraseña
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-sm">
                      {u.documento || '-'}
                      {u.documento && repeatedDocumentos.has(u.documento.trim()) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-error/20 text-error font-semibold font-sans">
                          <AlertTriangle className="w-3 h-3" /> Repetido
                        </span>
                      )}
                    </td>
                    <td className="p-4 capitalize text-sm">{u.rol}</td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleActive(u.id, u.activo !== false)}
                        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${u.activo !== false ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}
                      >
                        {u.activo !== false ? <><Power className="w-3 h-3"/> Activo</> : <><PowerOff className="w-3 h-3"/> Inactivo</>}
                      </button>
                    </td>
                    <td className="p-4">{rowActions(u, 'desktop')}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-ink-muted">No se encontraron usuarios.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-3 p-4">
              {users.map(u => (
                <div key={u.id} className="bg-bg border border-ink-muted/10 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 font-bold text-ink">
                      {u.rol === 'administrador' ? <Shield className="w-5 h-5 text-magenta" /> : <User className="w-5 h-5 text-ink-muted" />}
                      <span className="text-lg">{u.nombre}</span>
                    </div>
                    <button
                      onClick={() => toggleActive(u.id, u.activo !== false)}
                      className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 font-bold uppercase ${u.activo !== false ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}
                    >
                      {u.activo !== false ? <><Power className="w-3 h-3"/> Activo</> : <><PowerOff className="w-3 h-3"/> Inactivo</>}
                    </button>
                  </div>

                  <div className="text-sm">
                    <p className="text-ink-muted text-xs">Documento</p>
                    <p className="font-mono">
                      {u.documento || '-'}
                      {u.documento && repeatedDocumentos.has(u.documento.trim()) && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-error font-sans font-semibold">Repetido</span>
                      )}
                    </p>
                  </div>

                  {u.mustChangePassword && (
                    <p className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-pending/20 text-pending font-semibold self-start">
                      Debe cambiar contraseña
                    </p>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t border-ink-muted/10">
                    <span className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
                      Rol: <span className="text-ink">{u.rol}</span>
                    </span>
                    {rowActions(u, 'mobile')}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="p-8 text-center text-ink-muted bg-bg rounded-xl border border-dashed border-ink-muted/20">
                  No se encontraron usuarios.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
