import React, { useState } from 'react';
import { useStore } from '../store';
import { Teacher, TeacherPayment } from '../types';
import { generateId, cn, formatDateStr } from '../lib/utils';
import { alumnosDeSesion } from '../lib/clases';
import { Users, Plus, Phone, Trash2, Edit2, Bookmark, Calendar, DollarSign, X, KeyRound } from 'lucide-react';
import { DeleteButton } from './DeleteButton';
import { ImageUpload } from './ImageUpload';
import { motion, AnimatePresence } from 'motion/react';
import { apiResetPassword } from '../lib/api';
import { CopyField } from './CopyField';

export function Teachers() {
  const { data, updateData, addToast } = useStore();
  /** Contraseña temporal recién generada. Se muestra una única vez. */
  const [tempPassword, setTempPassword] = useState<{ nombre: string; documento: string; tempPassword: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newTeacher, setNewTeacher] = useState<Partial<Teacher>>({
    nombre: '', especialidad: '', contacto: '', color: '#E33DA0', foto: ''
  });

  // Modal for Payments
  const [paymentTeacherId, setPaymentTeacherId] = useState<string | null>(null);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({ concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0] });

  const handleSave = () => {
    if (!newTeacher.nombre) return;

    const documento = (newTeacher.documento || '').trim();
    // El documento es la identidad con la que se entra: no puede repetirse.
    if (documento && data.teachers.some(t => t.id !== editingId && (t.documento || '').trim() === documento)) {
      addToast(`Ya existe un profesor con el documento ${documento}`, 'error');
      return;
    }

    if (editingId) {
      updateData({
        teachers: data.teachers.map(t => t.id === editingId ? { ...t, ...newTeacher, documento } as Teacher : t)
      });
      setEditingId(null);
    } else {
      const teacher: Teacher = {
        id: generateId(),
        nombre: newTeacher.nombre,
        especialidad: newTeacher.especialidad || '',
        contacto: newTeacher.contacto || '',
        documento,
        foto: newTeacher.foto || '',
        color: newTeacher.color || '#E33DA0',
        pagos: []
      };
      updateData({ teachers: [...data.teachers, teacher] });
    }
    
    setIsAdding(false);
    setNewTeacher({ nombre: '', especialidad: '', contacto: '', documento: '', color: '#E33DA0', foto: '' });
  };

  const startEdit = (t: Teacher) => {
    setNewTeacher(t);
    setEditingId(t.id);
    setIsAdding(true);
  };

  const deleteTeacher = (id: string) => {
    updateData({ teachers: data.teachers.filter(t => t.id !== id) });
  };

  /**
   * Genera una contraseña temporal en el servidor. Aquí nunca se conoce la
   * contraseña anterior: sólo se recibe la nueva, para entregarla una vez.
   */
  const handleReset = async (teacher: Teacher) => {
    setResettingId(teacher.id);
    try {
      const result = await apiResetPassword(teacher.id, 'teacher');
      setTempPassword(result);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'No se pudo restablecer la contraseña', 'error');
    } finally {
      setResettingId(null);
    }
  };

  const handleAddPayment = () => {
    if (!paymentTeacherId || !newPayment.monto || !newPayment.concepto) return;
    const payment: TeacherPayment = {
      id: generateId(),
      concepto: newPayment.concepto,
      monto: Number(newPayment.monto),
      fecha: newPayment.fecha
    };
    
    updateData({
       teachers: data.teachers.map(t => {
          if (t.id === paymentTeacherId) {
             return { ...t, pagos: [...(t.pagos || []), payment] };
          }
          return t;
       })
    });
    
    setIsAddingPayment(false);
    setNewPayment({ concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0] });
  };

  const handleDeletePayment = (teacherId: string, paymentId: string) => {
     updateData({
       teachers: data.teachers.map(t => {
          if (t.id === teacherId) {
             return { ...t, pagos: (t.pagos || []).filter(p => p.id !== paymentId) };
          }
          return t;
       })
     });
  };

  const paymentTeacher = data.teachers.find(t => t.id === paymentTeacherId);

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto max-w-6xl mx-auto">
      {/* Contraseña temporal: única oportunidad de copiarla. */}
      <AnimatePresence>
        {tempPassword && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-surface border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-magenta" /> Contraseña temporal
              </h3>
              <p className="text-sm text-ink-muted">
                {tempPassword.nombre} entra con el documento{' '}
                <strong className="text-ink">{tempPassword.documento || 'registrado'}</strong> y esta contraseña. Al
                iniciar sesión deberá definir una propia.
              </p>
              <CopyField value={tempPassword.tempPassword} label="Contraseña temporal" />
              <p className="text-xs text-pending">Cópiala ahora: no se vuelve a mostrar.</p>
              <div className="flex justify-end">
                <button type="button" className="btn-primary" onClick={() => setTempPassword(null)}>Listo</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profesores</h1>
          <p className="text-ink-muted">Administra el equipo de instructores y pagos</p>
        </div>
        <button onClick={() => { setIsAdding(true); setEditingId(null); setNewTeacher({ nombre: '', especialidad: '', contacto: '', color: '#E33DA0', foto: '' }); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nuevo Profesor</span>
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card mb-8 overflow-hidden"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingId ? 'Editar Profesor' : 'Registrar Profesor'}</h2>
              <button onClick={() => setIsAdding(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Nombre completo</label>
                <input type="text" className="input" value={newTeacher.nombre} onChange={e => setNewTeacher({...newTeacher, nombre: e.target.value})} placeholder="Nombre" />
              </div>
              <div>
                <label className="label">Especialidad</label>
                <input type="text" className="input" value={newTeacher.especialidad} onChange={e => setNewTeacher({...newTeacher, especialidad: e.target.value})} placeholder="Especialidad" />
              </div>
              <div>
                <label className="label">Teléfono / WhatsApp</label>
                <input type="text" className="input" value={newTeacher.contacto} onChange={e => setNewTeacher({...newTeacher, contacto: e.target.value})} placeholder="Contacto" />
              </div>
              <div>
                <label className="label">Número de Documento (Login)</label>
                <input type="text" inputMode="numeric" className="input" value={newTeacher.documento || ''} onChange={e => setNewTeacher({...newTeacher, documento: e.target.value})} placeholder="Documento" />
                <p className="hint">Con este documento entra al portal. La contraseña se entrega con «Restablecer contraseña».</p>
              </div>
              <div className="md:col-span-2">
                <ImageUpload
                  label="Foto del Profesor (Opcional)"
                  value={newTeacher.foto || ''}
                  onChange={val => setNewTeacher({ ...newTeacher, foto: val })}
                  placeholder="Enlace de la foto"
                />
              </div>
              <div>
                <label className="label">Color de Etiqueta</label>
                <div className="flex gap-2 mt-2">
                  {['#E33DA0', '#B084F5', '#37D9A6', '#F5B841', '#7CC3FF', '#F05576', '#FFFFFF', '#6366F1'].map(c => (
                    <button
                      key={c}
                      onClick={() => setNewTeacher({...newTeacher, color: c})}
                      className={cn("w-8 h-8 rounded-full border-2 transition-all", newTeacher.color === c ? "border-white scale-110" : "border-transparent opacity-70")}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={handleSave}>Guardar Profesor</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.teachers.map((t, idx) => {
          const teacherSessions = data.sessions.filter(s => s.profesorId === t.id);
          const upcomingSessions = teacherSessions.filter(s => new Date(s.fecha) >= new Date());
          upcomingSessions.sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
          const nextSession = upcomingSessions[0];
          
          // Alumno del profesor es tanto el matriculado como el que asistió a
          // alguna de sus clases sin estar en el roster.
          const studentIds = new Set<string>();
          teacherSessions.forEach(s => alumnosDeSesion(s).forEach(id => studentIds.add(id)));
          
          const totalPaid = (t.pagos || []).reduce((acc, p) => acc + p.monto, 0);

          return (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="card relative overflow-hidden group flex flex-col"
            >
              <div className="absolute top-0 left-0 bottom-0 w-2" style={{ backgroundColor: t.color }}></div>
              <div className="pl-4 flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-xl font-bold">{t.nombre}</h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setPaymentTeacherId(t.id)} className="icon-btn bg-surface text-magenta" aria-label={`Gestionar pagos de ${t.nombre}`} title="Gestionar Pagos"><DollarSign className="w-4 h-4" /></button>
                    <button onClick={() => startEdit(t)} className="icon-btn bg-surface" aria-label={`Editar ${t.nombre}`} title="Editar"><Edit2 className="w-4 h-4" /></button>
                    <button
                      onClick={() => handleReset(t)}
                      disabled={resettingId === t.id}
                      className="icon-btn bg-surface disabled:opacity-50"
                      aria-label={`Restablecer contraseña de ${t.nombre}`}
                      title="Restablecer contraseña"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <DeleteButton onConfirm={() => deleteTeacher(t.id)} className="icon-btn-danger bg-surface" iconOnly={true} label={`Eliminar ${t.nombre}`} />
                  </div>
                </div>
                <p className="text-sm text-ink-muted mb-4 flex items-center gap-2"><Bookmark className="w-4 h-4" /> {t.especialidad || 'Sin especialidad'}</p>
                
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-surface p-2 rounded-lg text-center">
                    <p className="text-[10px] text-ink-muted uppercase tracking-wider">Clases</p>
                    <p className="font-bold">{teacherSessions.length}</p>
                  </div>
                  <div className="bg-surface p-2 rounded-lg text-center">
                    <p className="text-[10px] text-ink-muted uppercase tracking-wider">Alumnos</p>
                    <p className="font-bold">{studentIds.size}</p>
                  </div>
                  <div className="bg-magenta/10 p-2 rounded-lg text-center cursor-pointer hover:bg-magenta/20 transition-colors" onClick={() => setPaymentTeacherId(t.id)}>
                    <p className="text-[10px] text-magenta uppercase tracking-wider">Pagado</p>
                    <p className="font-bold text-magenta text-sm">{(totalPaid / 1000).toFixed(0)}k</p>
                  </div>
                </div>

                {nextSession ? (
                  <div className="bg-surface-hover border border-ink-muted/10 rounded-lg p-3 mb-4">
                    <p className="text-xs text-magenta font-semibold mb-1 uppercase">Próxima Clase</p>
                    <p className="text-sm font-medium truncate">{nextSession.titulo}</p>
                    <p className="text-xs text-ink-muted flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" /> {formatDateStr(nextSession.fecha)} · {nextSession.hora}
                    </p>
                  </div>
                ) : (
                  <div className="bg-surface rounded-lg p-3 mb-4 flex items-center gap-2 text-ink-muted text-sm border border-dashed border-ink-muted/20">
                    <Calendar className="w-4 h-4" /> Sin clases programadas
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-sm text-ink-muted mt-auto pt-2 border-t border-ink-muted/10">
                  <Phone className="w-4 h-4" />
                  {t.contacto || 'Sin contacto'}
                </div>
              </div>
            </motion.div>
          );
        })}
        {data.teachers.length === 0 && !isAdding && (
          <div className="col-span-full text-center py-12 text-ink-muted">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No hay profesores registrados aún.</p>
          </div>
        )}
      </div>

      {/* Modal Pagos a Profesor */}
      <AnimatePresence>
         {paymentTeacherId && paymentTeacher && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
               <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-surface p-6 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
               >
                  <div className="flex justify-between items-center mb-6">
                    <div>
                       <h3 className="font-bold text-lg">Pagos a {paymentTeacher.nombre}</h3>
                       <p className="text-sm text-ink-muted">Control de gastos por reemplazos o clases</p>
                    </div>
                    <button onClick={() => setPaymentTeacherId(null)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
                  </div>

                  {!isAddingPayment ? (
                     <div className="space-y-4">
                        <button onClick={() => setIsAddingPayment(true)} className="btn-secondary w-full border-dashed border-ink-muted/30 py-3 text-sm flex justify-center items-center gap-2">
                           <Plus className="w-4 h-4" /> Registrar Nuevo Pago
                        </button>
                        
                        <div className="mt-6 space-y-3">
                           <h4 className="text-sm font-bold uppercase tracking-wider text-ink-muted">Historial de Pagos</h4>
                           {(!paymentTeacher.pagos || paymentTeacher.pagos.length === 0) ? (
                              <p className="text-sm text-center text-ink-muted bg-bg p-4 rounded-xl">No hay pagos registrados aún.</p>
                           ) : (
                              paymentTeacher.pagos.map(p => (
                                 <div key={p.id} className="flex items-center justify-between p-3 bg-bg rounded-xl border border-ink-muted/10">
                                    <div>
                                       <p className="font-medium text-sm">{p.concepto}</p>
                                       <p className="text-xs text-ink-muted">{formatDateStr(p.fecha)}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                       <span className="font-bold text-success">\$\{p.monto.toLocaleString()}</span>
                                       <DeleteButton onConfirm={() => handleDeletePayment(paymentTeacher.id, p.id)} className="text-ink-muted hover:text-error" iconOnly={true} />
                                    </div>
                                 </div>
                              ))
                           )}
                        </div>
                     </div>
                  ) : (
                     <div className="space-y-4 bg-bg p-4 rounded-xl border border-ink-muted/10">
                        <h4 className="text-sm font-bold">Registrar Pago</h4>
                        <div>
                           <label className="label text-xs">Concepto</label>
                           <input type="text" className="input text-sm py-2" placeholder="Concepto" value={newPayment.concepto} onChange={e => setNewPayment({...newPayment, concepto: e.target.value})} />
                        </div>
                        <div>
                           <label className="label text-xs">Monto ($)</label>
                           <input type="number" className="input text-sm py-2" placeholder="Monto" value={newPayment.monto} onChange={e => setNewPayment({...newPayment, monto: e.target.value})} />
                        </div>
                        <div>
                           <label className="label text-xs">Fecha</label>
                           <input type="date" className="input text-sm py-2" value={newPayment.fecha} onChange={e => setNewPayment({...newPayment, fecha: e.target.value})} />
                        </div>
                        <div className="flex gap-2 mt-4">
                           <button onClick={() => setIsAddingPayment(false)} className="btn-secondary flex-1 py-2 text-sm">Cancelar</button>
                           <button onClick={handleAddPayment} className="btn-primary flex-1 py-2 text-sm">Guardar Pago</button>
                        </div>
                     </div>
                  )}
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
}
