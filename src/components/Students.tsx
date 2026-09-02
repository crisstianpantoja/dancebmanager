import React, { useState } from 'react';
import { useStore } from '../store';
import { Student, Payment } from '../types';
import { generateId, formatDateStr, cn } from '../lib/utils';
import { cobroDesdePlan, describirCupo, describirVigencia } from '../lib/planes';
import { Users, Search, Plus, User, Trash2, Edit, QrCode, X, Lock, LayoutGrid, List } from 'lucide-react';
import { DeleteButton } from './DeleteButton';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { DigitalCard } from './DigitalCard';
import { CarnetDownloadButton } from './CarnetDownload';
import { motion, AnimatePresence } from 'motion/react';
import { apiCreateUsers, type CreatedUser } from '../lib/api';
import { CopyField } from './CopyField';

export function Students() {
  const { data, updateData, addToast } = useStore();
  const [filter, setFilter] = useState<'todos' | 'academia' | 'privada' | 'ambas'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const students = data.students.filter(s => {
    if (filter !== 'todos' && s.tipo !== filter) return false;
    if (searchTerm && !s.nombre.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const selectedStudent = data.students.find(s => s.id === selectedStudentId);

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-magenta" /> 
            Directorio de Alumnos
          </h1>
          <p className="text-ink-muted mt-1">Gestiona los {data.students.length} alumnos de la academia</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input 
              type="search" placeholder="Buscar" aria-label="Buscar alumnos"
              className="input pl-9 text-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select 
            className="input text-sm w-auto"
            value={filter} onChange={e => setFilter(e.target.value as any)}
          >
            <option value="todos">Todas las modalidades</option>
            <option value="privada">Solo Privadas</option>
            <option value="academia">Solo Academia</option>
            <option value="ambas">Ambas</option>
          </select>

          <div className="bg-surface border border-white/5 rounded-lg flex p-1">
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? 'bg-white/10 text-white' : 'text-ink-muted hover:text-white')}
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-ink-muted hover:text-white')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          
          <button onClick={() => setIsAdding(true)} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo Alumno</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0 no-scrollbar">
        {students.length === 0 ? (
          <div className="text-center py-20 bg-surface/50 rounded-2xl border border-white/5">
            <Users className="w-12 h-12 text-ink-muted mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No se encontraron alumnos</p>
            <p className="text-sm text-ink-muted">Ajusta los filtros o agrega un alumno nuevo.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {students.map(s => (
              <motion.button
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setSelectedStudentId(s.id)}
                className="card p-5 text-left group hover:border-magenta/50 hover:shadow-[0_0_20px_rgba(227,61,160,0.15)] transition-all flex flex-col items-center"
              >
                {s.foto ? (
                  <img src={s.foto} alt={s.nombre} className="w-20 h-20 rounded-full object-cover mb-4 border-2 border-surface group-hover:border-magenta transition-colors shadow-md" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-surface-hover mb-4 flex items-center justify-center text-2xl font-bold text-ink-muted border-2 border-transparent group-hover:border-magenta transition-colors shadow-md">
                    {s.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="font-bold text-center line-clamp-1 group-hover:text-magenta transition-colors">{s.nombre}</h3>
                <div className="flex gap-2 mt-2 text-[10px] uppercase font-bold tracking-wider">
                  <span className={cn("px-2 py-0.5 rounded-full", s.tipo === 'privada' ? 'bg-magenta/20 text-magenta' : s.tipo === 'academia' ? 'bg-accent-academy/20 text-accent-academy' : 'bg-success/20 text-success')}>{s.tipo}</span>
                  <span className="px-2 py-0.5 bg-surface-hover rounded-full text-ink-muted">{s.nivel}</span>
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-ink-muted bg-surface-hover/50">
                    <th className="px-6 py-4 font-semibold">Alumno</th>
                    <th className="px-6 py-4 font-semibold">Contacto</th>
                    <th className="px-6 py-4 font-semibold">Modalidad</th>
                    <th className="px-6 py-4 font-semibold">Nivel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {students.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => setSelectedStudentId(s.id)}
                      className="hover:bg-white/5 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {s.foto ? (
                            <img src={s.foto} alt={s.nombre} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center font-bold text-ink-muted">
                              {s.nombre.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-bold group-hover:text-magenta transition-colors">{s.nombre}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-ink-muted">{s.contacto || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider", s.tipo === 'privada' ? 'bg-magenta/20 text-magenta' : s.tipo === 'academia' ? 'bg-accent-academy/20 text-accent-academy' : 'bg-success/20 text-success')}>
                          {s.tipo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-ink-muted">{s.nivel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <StudentFormModal 
            onClose={() => setIsAdding(false)} 
            onSave={(id) => { setIsAdding(false); setSelectedStudentId(id); }}
          />
        )}
        {isEditing && selectedStudent && (
          <StudentFormModal 
            studentToEdit={selectedStudent}
            onClose={() => setIsEditing(false)} 
            onSave={() => setIsEditing(false)}
          />
        )}
        {selectedStudent && !isEditing && (
          <StudentDetailModal 
            student={selectedStudent} 
            onClose={() => setSelectedStudentId(null)}
            onEdit={() => setIsEditing(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentFormModal({ onClose, onSave, studentToEdit }: { onClose: () => void, onSave: (id: string) => void, studentToEdit?: Student }) {
  const { data, updateData, addToast, refresh } = useStore();
  const [formData, setFormData] = useState<Partial<Student>>(
    studentToEdit || {
      nombre: '', contacto: '', documento: '', tipo: 'privada', nivel: 'Principiante', rol: 'alumno', notas: '',
      competencias: { ritmo: 0, movimiento: 0, imagen: 0, conexion: 0 }
    }
  );
  const [saving, setSaving] = useState(false);
  /** Alumno recién creado, para mostrar su contraseña temporal una sola vez. */
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre) {
      addToast('El nombre es obligatorio', 'error');
      return;
    }

    const documento = (formData.documento || '').trim();
    // El documento identifica a la persona al entrar: no puede repetirse.
    if (documento && data.students.some(s => s.id !== studentToEdit?.id && (s.documento || '').trim() === documento)) {
      addToast(`Ya existe un usuario con el documento ${documento}`, 'error');
      return;
    }

    if (studentToEdit) {
      updateData({ students: data.students.map(s => s.id === studentToEdit.id ? { ...s, ...formData, documento } as Student : s) });
      addToast('Alumno actualizado correctamente', 'success');
      onSave(studentToEdit.id);
      return;
    }

    if (!documento) {
      addToast('El documento es obligatorio para poder iniciar sesión', 'error');
      return;
    }

    // El alta la hace el servidor: es quien genera y hashea la contraseña
    // temporal, de modo que aquí nunca se escribe una contraseña a mano.
    setSaving(true);
    try {
      const { created: rows } = await apiCreateUsers([{
        nombre: formData.nombre,
        documento,
        rol: formData.rol || 'alumno',
        contacto: formData.contacto || '',
        tipo: formData.tipo || 'privada',
        nivel: formData.nivel || 'Principiante',
        notas: formData.notas || '',
        academiaId: formData.academiaId || '',
      }]);
      await refresh();
      addToast('Alumno creado correctamente', 'success');
      setCreated(rows[0]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'No se pudo crear el alumno', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tras crear, el formulario cede el sitio a la contraseña temporal: es la
  // única oportunidad de copiarla.
  if (created) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="w-5 h-5 text-magenta" /> Contraseña temporal
          </h2>
          <p className="text-sm text-ink-muted">
            {created.nombre} entra con el documento <strong className="text-ink">{created.documento}</strong> y esta
            contraseña. Al iniciar sesión deberá definir una propia.
          </p>
          <CopyField value={created.tempPassword} label="Contraseña temporal" />
          <p className="text-xs text-pending">Cópiala ahora: no se vuelve a mostrar.</p>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => onSave(created.id)}>Listo</button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="w-full max-w-2xl bg-surface border border-white/10 rounded-2xl shadow-2xl my-8 relative"
      >
        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-white/5 p-6 rounded-t-2xl flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold">{studentToEdit ? 'Editar Alumno' : 'Nuevo Alumno'}</h2>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-ink-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Nombre completo</label>
            <input type="text" className="input" placeholder="Nombre completo" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} autoFocus />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Contacto (Teléfono/Insta)</label>
              <input type="text" className="input" placeholder="Contacto" value={formData.contacto} onChange={e => setFormData({...formData, contacto: e.target.value})} />
            </div>
            <div>
              <label className="label">Número de Documento (Login)</label>
              <input type="text" className="input" placeholder="Documento" value={formData.documento} onChange={e => setFormData({...formData, documento: e.target.value})} />
            </div>
            <div className="md:col-span-2 rounded-xl border border-white/10 bg-bg/60 p-3 text-sm text-ink-muted flex gap-2">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-magenta" />
              <span>
                {studentToEdit
                  ? 'Las contraseñas no se editan desde aquí. Usa «Restablecer contraseña» en Gestión de Usuarios para generar una temporal.'
                  : 'Al guardar se genera una contraseña temporal que se muestra una sola vez. El alumno deberá definir la suya al entrar.'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Modalidad</label>
              <select className="input" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value as any})}>
                <option value="privada">Privada</option>
                <option value="academia">Academia</option>
                <option value="ambas">Ambas</option>
              </select>
            </div>
            <div>
              <label className="label">Nivel Inicial</label>
              <select className="input" value={formData.nivel} onChange={e => setFormData({...formData, nivel: e.target.value as any})}>
                <option value="Principiante">Principiante</option>
                <option value="Intermedio">Intermedio</option>
                <option value="Avanzado">Avanzado</option>
              </select>
            </div>
            <div>
              <label className="label">Rol</label>
              <select className="input" value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value as any})}>
                <option value="alumno">Alumno</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="label">Academia</label>
              <select className="input" value={formData.academiaId || ''} onChange={e => setFormData({...formData, academiaId: e.target.value})}>
                <option value="">Sin academia</option>
                {data.academies.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <p className="hint">De aquí sale el calendario de clases que ve el alumno en su portal.</p>
            </div>
          </div>
          <div>
            <label className="label">Notas generales</label>
            <textarea className="input h-24" placeholder="Notas" value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})}></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary disabled:opacity-60" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar Alumno'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function StudentDetailModal({ student, onClose, onEdit }: { student: Student, onClose: () => void, onEdit: () => void }) {
  const { data, updateData, addToast } = useStore();
  const [isShowingID, setIsShowingID] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalData, setEvalData] = useState({ ritmo: 0, movimiento: 0, imagen: 0, conexion: 0, nota: '' });

  const handleSaveEvaluation = () => {
    const newEval = { ...evalData, fecha: new Date().toISOString().split('T')[0] };
    const updatedStudent = {
      ...student,
      competencias: { ritmo: evalData.ritmo, movimiento: evalData.movimiento, imagen: evalData.imagen, conexion: evalData.conexion },
      historial: [newEval, ...student.historial]
    };
    updateData({ students: data.students.map(s => s.id === student.id ? updatedStudent : s) });
    setIsEvaluating(false);
    addToast('Evaluación guardada', 'success');
  };

  /**
   * El cobro se arma desde la plantilla para que arrastre el tipo de
   * mensualidad, el cupo y la fecha de vencimiento: son los datos con los que
   * después se descuenta la asistencia.
   */
  const handleAssignPlan = (planId: string) => {
    const plan = data.plans.find(p => p.id === planId);
    if (!plan) return;
    const newPayment: Payment = cobroDesdePlan(plan, student.id, {
      id: generateId(),
      notas: 'Asignado desde panel de alumno',
    });
    updateData({ payments: [...data.payments, newPayment] });
    addToast(`Plan "${plan.nombre}" asignado correctamente.`, "success");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
    >
      <motion.div 
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-5xl bg-bg md:rounded-3xl shadow-2xl h-[95vh] md:h-[90vh] flex flex-col relative"
      >
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button onClick={onEdit} className="p-2 bg-surface hover:bg-surface-hover rounded-full transition-colors text-ink">
            <Edit className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 bg-surface hover:bg-surface-hover rounded-full transition-colors text-ink-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-32">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-12">
            {student.foto ? (
              <img src={student.foto} alt={student.nombre} className="w-32 h-32 rounded-full object-cover border-4 border-surface shadow-xl" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-surface-hover flex items-center justify-center text-5xl font-bold text-ink-muted shadow-xl">
                {student.nombre.charAt(0).toUpperCase()}
              </div>
            )}
            
            <div className="text-center md:text-left flex-1">
              <h1 className="text-4xl font-bold mb-3">{student.nombre}</h1>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 text-xs font-bold uppercase tracking-wider mb-6">
                <span className="px-3 py-1 bg-surface border border-white/5 rounded-md">{student.nivel}</span>
                <span className={cn("px-3 py-1 border rounded-md", student.tipo === 'privada' ? 'bg-magenta/10 border-magenta/20 text-magenta' : student.tipo === 'academia' ? 'bg-accent-academy/10 border-accent-academy/20 text-accent-academy' : 'bg-success/10 border-success/20 text-success')}>{student.tipo}</span>
                <span className="px-3 py-1 bg-surface border border-white/5 rounded-md">Ingreso: {formatDateStr(student.fechaIngreso)}</span>
              </div>
              <div className="flex justify-center md:justify-start gap-3">
                <button onClick={() => setIsShowingID(true)} className="btn-secondary py-2 px-4 flex items-center gap-2">
                  <QrCode className="w-4 h-4" /> Ver Carnet
                </button>
                <DeleteButton 
                  onConfirm={() => {
                    updateData({ students: data.students.filter(s => s.id !== student.id) });
                    onClose();
                  }}
                  className="btn-secondary text-error hover:bg-error/10 border-error/20 hover:border-error"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <div className="card">
                <h2 className="font-semibold text-xl mb-6">Información General</h2>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between border-b border-white/5 pb-3">
                    <span className="text-ink-muted">Contacto</span>
                    <span className="font-medium">{student.contacto || 'No registrado'}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block mb-2">Notas Generales</span>
                    <p className="bg-surface p-4 rounded-xl text-ink/80">{student.notas || 'Sin notas.'}</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2 className="font-semibold text-xl mb-6">Planes y Membresías</h2>
                {(() => {
                  const activePayments = data.payments.filter(p => p.alumnoId === student.id && p.estado === 'pagado' && (p.clasesIncluidas === 0 || p.clasesUsadas < p.clasesIncluidas));
                  return (
                    <div className="mb-8 space-y-3">
                      <h3 className="text-xs text-ink-muted uppercase tracking-wider font-bold mb-3">Activos Actualmente</h3>
                      {activePayments.length === 0 ? (
                        <p className="text-sm text-ink-muted italic bg-surface p-4 rounded-xl text-center">No tiene planes activos.</p>
                      ) : (
                        activePayments.map(p => (
                          <div key={p.id} className="bg-success/5 border border-success/20 p-4 rounded-xl text-sm">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-bold text-success text-base">{p.concepto}</span>
                              {p.clasesIncluidas > 0 && (
                                <span className="font-mono bg-success/20 text-success px-2 py-0.5 rounded text-xs font-bold">
                                  {p.clasesIncluidas - p.clasesUsadas} restantes
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-ink-muted/80 flex justify-between">
                              <span>Adquirido: {formatDateStr(p.fecha)}</span>
                              {p.clasesIncluidas === 0 && <span>Suscripción Mensual</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}

                <h3 className="text-xs text-ink-muted uppercase tracking-wider font-bold mb-4 flex items-center justify-between">
                  Asignar Nuevo Plan
                </h3>
                <div className="space-y-3">
                  {data.plans.map(plan => (
                    <div key={plan.id} className="flex justify-between items-center bg-surface hover:bg-surface-hover p-4 rounded-xl border border-white/5 transition-colors">
                      <div>
                        <p className="font-bold text-sm">{plan.nombre}</p>
                        <p className="text-xs text-ink-muted mt-1">
                          {[describirCupo(plan), describirVigencia(plan), `$${plan.monto.toLocaleString()}`]
                            .filter(Boolean)
                            .join(' | ')}
                        </p>
                      </div>
                      <button onClick={() => handleAssignPlan(plan.id)} className="btn-primary py-1.5 px-4 text-xs">
                        Asignar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="card">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-semibold text-xl">Perfil de Competencias</h2>
                  <button onClick={() => {
                    setEvalData({ ...student.competencias, nota: '' });
                    setIsEvaluating(true);
                  }} className="btn-secondary text-xs py-1.5 px-4 bg-white/5">
                    Evaluar
                  </button>
                </div>
                
                {isEvaluating ? (
                  <div className="space-y-5 bg-surface p-5 rounded-xl border border-white/5">
                    {['ritmo', 'movimiento', 'imagen', 'conexion'].map(comp => (
                      <div key={comp}>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="capitalize font-medium">{comp}</span>
                          <span className="font-mono font-bold text-magenta">{(evalData as any)[comp]}/5</span>
                        </div>
                        <input type="range" min="0" max="5" step="0.5" 
                           value={(evalData as any)[comp]}
                          onChange={e => setEvalData({...evalData, [comp]: parseFloat(e.target.value)})}
                          className="w-full accent-magenta"
                        />
                      </div>
                    ))}
                    <div className="pt-2">
                      <label className="label text-xs">Observación</label>
                      <input type="text" className="input text-sm py-2" value={evalData.nota} onChange={e => setEvalData({...evalData, nota: e.target.value})} placeholder="Nota de la evaluación" />
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <button className="btn-secondary py-1.5" onClick={() => setIsEvaluating(false)}>Cancelar</button>
                      <button className="btn-primary py-1.5" onClick={handleSaveEvaluation}>Guardar Evaluación</button>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 w-full flex justify-center items-center bg-surface rounded-xl border border-white/5">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                        { subject: 'Ritmo', A: student.competencias.ritmo, fullMark: 5 },
                        { subject: 'Movimiento', A: student.competencias.movimiento, fullMark: 5 },
                        { subject: 'Imagen', A: student.competencias.imagen, fullMark: 5 },
                        { subject: 'Conexión', A: student.competencias.conexion, fullMark: 5 },
                      ]}>
                        <PolarGrid stroke="#fff" strokeOpacity={0.1} />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#A39EBA', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                        <Radar name="Alumno" dataKey="A" stroke="#F72585" strokeWidth={2} fill="#F72585" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                <div className="mt-8">
                  <h3 className="text-xs text-ink-muted uppercase tracking-wider font-bold mb-4">Historial de Evaluaciones</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                    {student.historial.map((h, i) => (
                      <div key={i} className="text-sm bg-surface p-4 rounded-xl border border-white/5">
                        <div className="flex justify-between text-ink-muted/80 mb-2">
                          <span className="font-medium text-ink">{formatDateStr(h.fecha)}</span>
                          <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-xs font-bold text-magenta">Promedio: {((h.ritmo + h.movimiento + h.imagen + h.conexion)/4).toFixed(1)}</span>
                        </div>
                        <p className="text-ink/90">{h.nota || 'Sin observación adicional'}</p>
                      </div>
                    ))}
                    {student.historial.length === 0 && <p className="text-sm text-ink-muted/60 text-center py-4">No hay evaluaciones previas.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ID Card Modal - nested inside */}
      {isShowingID && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto" onClick={() => setIsShowingID(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[340px] flex flex-col items-center">
            <DigitalCard student={student} onClose={() => setIsShowingID(false)} showClose={true} />
            {/* El administrador también necesita el carnet como imagen, para enviárselo al alumno. */}
            <CarnetDownloadButton
              student={student}
              className="btn-secondary w-full py-3 mt-6 border-white/20 text-white hover:bg-white/10 bg-black/50 backdrop-blur-md"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
