import React, { useState } from 'react';
import { useStore } from '../store';
import { LogOut, CalendarDays, Bell, History, User, Clock, MapPin, CheckCircle2, Plus, X, Users, CreditCard, DollarSign, Edit2, Trash2, Image } from 'lucide-react';
import { DeleteButton } from './DeleteButton';
import { motion, AnimatePresence } from 'motion/react';
import { formatDateStr, cn, generateId, formatCurrency, formatTime } from '../lib/utils';
import { asistenciasDeAlumno, cobroDesdePlan, estiloCategoria, pagosPorVerificar } from '../lib/planes';
import { AppNotification, Session, Student, Payment } from '../types';
import { apiRevisarPago } from '../lib/api';
import { ReceiptViewer } from './ReceiptViewer';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export function TeacherPortal() {
  const { data, currentUser, logout, updateData , addToast, refresh } = useStore();
  const [activeTab, setActiveTab] = useState<'clases' | 'agenda' | 'alumnos' | 'finanzas' | 'perfil'>('clases');
  
  const [isAddingClass, setIsAddingClass] = useState(false);
  /** id de la sesión que se está editando, no la sesión completa. */
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [newClass, setNewClass] = useState<Partial<Session>>({
    titulo: '', tipo: 'privada', fecha: new Date().toISOString().split('T')[0], hora: '18:00', duracion: 60, lugar: '', valor: 0, notas: ''
  });
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    nombre: '', contacto: '', nivel: 'Principiante', tipo: 'academia', notas: ''
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    nombre: '', especialidad: '', contacto: '', foto: ''
  });
  const [editingPlan, setEditingPlan] = useState<{id?: string, nombre: string, monto: number, modalidad: any, clasesIncluidas: number} | null>(null);


  if (!currentUser || currentUser.rol !== 'profesor') return null;
  const teacher = data.teachers.find(t => t.id === currentUser.id);
  if (!teacher) return null;

  const initProfileData = () => {
    setProfileData({
      nombre: teacher.nombre || '',
      especialidad: teacher.especialidad || '',
      contacto: teacher.contacto || '',
      foto: teacher.foto || ''
    });
  };

  const handleSaveProfile = () => {
    const updatedTeachers = data.teachers.map(t => 
      t.id === teacher.id ? { ...t, ...profileData } : t
    );
    updateData({ teachers: updatedTeachers });
    setIsEditingProfile(false);
  };
  
  const handleSavePlan = () => {
    if (!editingPlan) return;
    const currentPlans = teacher.planes || [];
    let updatedPlans;
    if (editingPlan.id) {
      updatedPlans = currentPlans.map(p => p.id === editingPlan.id ? { ...editingPlan } as any : p);
    } else {
      updatedPlans = [...currentPlans, { ...editingPlan, id: 'plan_' + Math.random().toString(36).substr(2,9) } as any];
    }
    const updatedTeachers = data.teachers.map(t => 
      t.id === teacher.id ? { ...t, planes: updatedPlans } : t
    );
    updateData({ teachers: updatedTeachers });
    setEditingPlan(null);
  };
  
  const handleDeletePlan = (planId: string) => {
    const currentPlans = teacher.planes || [];
    const updatedPlans = currentPlans.filter(p => p.id !== planId);
    const updatedTeachers = data.teachers.map(t => 
      t.id === teacher.id ? { ...t, planes: updatedPlans } : t
    );
    updateData({ teachers: updatedTeachers });
  };

  const teacherSessions = data.sessions.filter(s => s.profesorId === teacher.id);
  const todayStr = new Date().toISOString().split('T')[0];
  
  const upcomingClasses = teacherSessions
    .filter(s => s.fecha >= todayStr)
    .sort((a,b) => a.fecha.localeCompare(b.fecha));

  const myNotifications = data.notifications?.filter(n => n.userId === teacher.id).sort((a,b) => b.fecha.localeCompare(a.fecha)) || [];
  const unreadCount = myNotifications.filter(n => !n.read).length;
  const pastClasses = teacherSessions
    .filter(s => s.fecha < todayStr)
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  const myStudents = data.students.filter(s => teacherSessions.some(sess => sess.alumnoIds.includes(s.id)) || s.creadoPor === teacher.id);
  const totalEarnings = pastClasses.reduce((sum, s) => sum + (s.valor || 0), 0);
  const upcomingEarnings = upcomingClasses.reduce((sum, s) => sum + (s.valor || 0), 0);


  /** Comprobantes que subieron los alumnos y nadie ha revisado todavía. */
  const pendingValidations = pagosPorVerificar(data.payments);

  const [viewingReceipt, setViewingReceipt] = useState<{url: string, name: string} | null>(null);
  const [revisandoPago, setRevisandoPago] = useState<string | null>(null);

  /**
   * La revisión la resuelve el servidor (`/api/pagos`): es quien puede cambiar
   * el estado de un cobro y avisar al alumno.
   */
  const revisarComprobante = async (paymentId: string, decision: 'aprobar' | 'rechazar') => {
    if (revisandoPago) return;
    setRevisandoPago(paymentId);
    try {
      const respuesta = await apiRevisarPago({ paymentId, decision });
      await refresh();
      addToast(respuesta.detalle, decision === 'aprobar' ? 'success' : 'info');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'No pudimos revisar el comprobante',
        'error'
      );
    } finally {
      setRevisandoPago(null);
    }
  };

  const handleConfirmSession = (session: Session) => {
    let newPayment: Payment | null = null;
    if (session.planId) {
      const plan = teacher?.planes?.find(p => p.id === session.planId);
      if (plan) {
         // Se arma desde la plantilla para que arrastre tipo de mensualidad,
         // cupo y vigencia: son los datos con los que se descuentan las clases.
         newPayment = cobroDesdePlan(plan, session.alumnoIds[0], {
           id: 'pay_' + generateId(),
           estado: 'pendiente',
         });
         newPayment.concepto = `Plan: ${plan.nombre} (Prof. ${teacher?.nombre})`;
      }
    }

    const studentNotif = {
        id: 'notif_' + Math.random().toString(36).substr(2, 9),
        userId: session.alumnoIds[0],
        title: 'Reserva Confirmada',
        message: `El profesor ${teacher?.nombre} ha confirmado tu clase del ${formatDateStr(session.fecha)} a las ${session.hora}. ${newPayment ? 'Se ha generado tu membresía.' : ''}`,
        fecha: new Date().toISOString(),
        read: false,
        type: 'success' as const
    };

    updateData({
      sessions: data.sessions.map(s => s.id === session.id ? { ...s, estado: 'confirmada' } : s),
      payments: newPayment ? [...data.payments, newPayment] : data.payments,
      notifications: [...(data.notifications || []), studentNotif]
    });
  };

  const handleRejectSession = (session: Session) => {
    const studentNotif = {
        id: 'notif_' + Math.random().toString(36).substr(2, 9),
        userId: session.alumnoIds[0],
        title: 'Reserva Rechazada',
        message: `El profesor ${teacher?.nombre} no pudo confirmar tu clase del ${formatDateStr(session.fecha)} a las ${session.hora}.`,
        fecha: new Date().toISOString(),
        read: false,
        type: 'warning' as const
    };
    updateData({
       sessions: data.sessions.filter(s => s.id !== session.id),
       notifications: [...(data.notifications || []), studentNotif]
    });
  };


  
  
  const handleSaveStudent = () => {
    if (!newStudent.nombre) return;
    
    if (editingStudent) {
      const updated: Student = {
        ...editingStudent,
        ...newStudent as Student
      };
      updateData({ students: data.students.map(s => s.id === editingStudent.id ? updated : s) });
    } else {
      const student: Student = {
        id: generateId(),
        nombre: newStudent.nombre || '',
        contacto: newStudent.contacto || '',
        tipo: (newStudent.tipo as any) || 'academia',
        nivel: (newStudent.nivel as any) || 'Principiante',
        rol: 'alumno',
        fechaIngreso: new Date().toISOString(),
        notas: newStudent.notas || '',
        competencias: newStudent.competencias || { ritmo: 5, movimiento: 5, imagen: 5, conexion: 5 },
        historial: [],
        creadoPor: teacher.id
      };
      
      let newPayment: Payment | null = null;
      if (selectedPlanId) {
        const plan = data.plans.find(p => p.id === selectedPlanId);
        if (plan) {
          newPayment = cobroDesdePlan(plan, student.id, {
            id: generateId(),
            notas: 'Asignado al registrar desde portal de profesor',
          });
        }
      }

      if (newPayment) {
        updateData({ 
          students: [...data.students, student],
          payments: [...data.payments, newPayment]
        });
      } else {
        updateData({ students: [...data.students, student] });
      }
    }
    
    setIsAddingStudent(false);
    setEditingStudent(null);
    setNewStudent({ nombre: '', contacto: '', nivel: 'Principiante', tipo: 'academia', notas: '' });
    setSelectedPlanId('');
  };

  
  const handleEditStudentClick = (student: Student) => {
    setEditingStudent(student);
    setNewStudent(student);
    setIsAddingStudent(true);
  };
  
  const handleDeleteStudent = (studentId: string) => {
    updateData({ students: data.students.filter(s => s.id !== studentId) });
  };

  
  const handleEditClassClick = (session: Session) => {
    setEditingClass(session.id);
    setNewClass({
      titulo: session.titulo,
      tipo: session.tipo,
      fecha: session.fecha,
      hora: session.hora,
      duracion: session.duracion,
      lugar: session.lugar,
      valor: session.valor || 0,
      notas: session.notas || ''
    });
    setIsAddingClass(true);
  };

  const handleDeleteClass = (session: Session) => {
    const updatedSessions = data.sessions.filter(s => s.id !== session.id);
    // Create notifications for all students in this session
    const newNotifications = session.alumnoIds.map(alumnoId => ({
      id: generateId(),
      userId: alumnoId,
      title: "Clase Cancelada",
      message: `La clase "${session.titulo}" del ${session.fecha} ha sido cancelada por el profesor.`,
      fecha: new Date().toISOString(),
      read: false,
      type: 'warning' as const
    }));
    
    updateData({ 
      sessions: updatedSessions,
      notifications: [...(data.notifications || []), ...newNotifications]
    });
  };

    const handleSaveClass = () => {
    if (!newClass.titulo) return;
    
    let updatedSessions = [...data.sessions];
    let newNotifications: AppNotification[] = [];
    
    if (editingClass) {
      const existingSession = data.sessions.find(s => s.id === editingClass);
      if (existingSession) {
        updatedSessions = updatedSessions.map(s => 
          s.id === editingClass ? { ...s, ...newClass, tipo: newClass.tipo as 'academia'|'privada' } : s
        );
        
        // Notify if date or time changed
        if (existingSession.fecha !== newClass.fecha || existingSession.hora !== newClass.hora) {
          const notifications = existingSession.alumnoIds.map(alumnoId => ({
            id: generateId(),
            userId: alumnoId,
            title: "Clase Reprogramada",
            message: `La clase "${existingSession.titulo}" ha sido movida al ${newClass.fecha} a las ${newClass.hora}.`,
            fecha: new Date().toISOString(),
            read: false,
            type: 'warning' as const
          }));
          newNotifications = notifications;
        }
      }
    } else {
      const session: Session = {
        id: generateId(),
        profesorId: teacher.id,
        titulo: newClass.titulo,
        tipo: newClass.tipo as 'academia' | 'privada',
        fecha: newClass.fecha || '',
        hora: newClass.hora || '',
        duracion: newClass.duracion || 60,
        lugar: newClass.lugar || '',
        valor: newClass.valor || 0,
        notas: newClass.notas || '',
        alumnoIds: [],
        asistencia: {}
      };
      updatedSessions.push(session);
    }
    
    updateData({ 
      sessions: updatedSessions,
      notifications: newNotifications.length > 0 ? [...(data.notifications || []), ...newNotifications] : data.notifications
    });
    
    setIsAddingClass(false);
    setEditingClass(null);
  };

  return (
    <div className="flex flex-col h-screen bg-bg">
      <header className="flex justify-between items-center p-4 bg-surface border-b border-ink-muted/10 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {data.settings?.showLoginLogo && (data.settings?.teacherPortalLogoUrl || data.settings?.loginLogoUrl) && (
            <img src={data.settings.teacherPortalLogoUrl || data.settings.loginLogoUrl} alt="Logo" className="max-h-8 object-contain hidden sm:block" />
          )}
          <div>
            <h1 className="text-xl font-bold text-magenta">Portal del Profesor</h1>
            <p className="text-xs text-ink-muted">Hola, {teacher.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setShowNotifications(true);
              // Mark all as read
              if (unreadCount > 0) {
                const updatedNotifs = data.notifications.map(n => 
                  n.userId === teacher.id ? { ...n, read: true } : n
                );
                updateData({ notifications: updatedNotifs });
              }
            }} 
            className="relative p-2 text-ink-muted hover:text-ink transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface"></span>
            )}
          </button>
          <button onClick={logout} className="p-2 text-ink-muted hover:text-error bg-bg rounded-full">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex justify-center p-4 gap-4 bg-surface border-b border-ink-muted/10">
        <button onClick={() => setActiveTab('clases')} className={cn("px-4 py-2 rounded-lg font-medium", activeTab === 'clases' ? 'bg-magenta text-white' : 'text-ink-muted hover:bg-surface-hover')}>Clases</button>
        <button onClick={() => setActiveTab('agenda')} className={cn("px-4 py-2 rounded-lg font-medium", activeTab === 'agenda' ? 'bg-magenta text-white' : 'text-ink-muted hover:bg-surface-hover')}>Agenda</button>
        <button onClick={() => setActiveTab('alumnos')} className={cn("px-4 py-2 rounded-lg font-medium", activeTab === 'alumnos' ? 'bg-magenta text-white' : 'text-ink-muted hover:bg-surface-hover')}>Mis Alumnos</button>
        <button onClick={() => setActiveTab('finanzas')} className={cn("px-4 py-2 rounded-lg font-medium", activeTab === 'finanzas' ? 'bg-magenta text-white' : 'text-ink-muted hover:bg-surface-hover')}>Finanzas</button>
        <button onClick={() => { setActiveTab('perfil'); initProfileData(); }} className={cn("px-4 py-2 rounded-lg font-medium", activeTab === 'perfil' ? 'bg-magenta text-white' : 'text-ink-muted hover:bg-surface-hover')}>Perfil</button>
      </nav>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          {activeTab === 'clases' && (
            <motion.div key="clases" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2">Mis Clases Próximas</h2>
                <p className="text-ink-muted">Administra tus clases y toma asistencia.</p>
              </div>

              {upcomingClasses.length === 0 ? (
                <div className="card text-center py-12">
                  <CalendarDays className="w-12 h-12 mx-auto mb-4 text-ink-muted opacity-20" />
                  <p className="text-ink-muted">No tienes clases programadas próximamente.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingClasses.map(session => (
                    <div key={session.id} className="card overflow-hidden relative">
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4 pb-4 border-b border-ink-muted/10">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-lg">{session.titulo}</h3>
                            <span className={cn("text-[10px] px-2 py-0.5 rounded uppercase font-bold", session.tipo === 'privada' ? "bg-accent-academy/20 text-accent-academy" : "bg-magenta/20 text-magenta")}>
                              {session.tipo}
                            </span>
                            {session.estado === 'pendiente' && (
                              <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-warning/20 text-warning ml-2">
                                Pendiente
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-ink-muted flex items-center gap-2">
                            <Clock className="w-4 h-4" /> {formatDateStr(session.fecha)} a las {session.hora}
                          </p>
                          <p className="text-sm text-ink-muted flex items-center gap-2 mt-1">
                            <MapPin className="w-4 h-4" /> {session.lugar}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="bg-surface p-3 rounded-xl border border-ink-muted/5 text-center min-w-[80px]">
                            <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Inscritos</p>
                            <p className="text-xl font-bold">{session.alumnoIds.length}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        {session.estado === 'pendiente' ? (
                          <div className="bg-warning/5 border border-warning/20 p-4 rounded-xl flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-warning mb-1">Solicitud de Reserva</h4>
                              <p className="text-sm text-ink-muted">El alumno espera tu confirmación para proceder con el pago y/o activación del plan.</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleRejectSession(session)} className="btn-secondary text-error border-error/20 hover:bg-error hover:text-white">Rechazar</button>
                              <button onClick={() => handleConfirmSession(session)} className="btn-primary">Confirmar Reserva</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Sólo de consulta: la asistencia la registra el administrador. */}
                            <h4 className="font-semibold text-sm mb-3">Asistencia:</h4>
                        {session.alumnoIds.length === 0 ? (
                          <p className="text-sm text-ink-muted">No hay alumnos inscritos.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {session.alumnoIds.map(studentId => {
                              const student = data.students.find(s => s.id === studentId);
                              if (!student) return null;

                              const status = session.asistencia?.[studentId];

                              return (
                                <div
                                  key={studentId}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border text-left",
                                    status === 'presente' ? "border-success bg-success/10" : "border-ink-muted/20"
                                  )}
                                >
                                  <span className="font-medium text-sm">{student.nombre}</span>
                                  {status === 'presente' && (
                                    <span className="text-[10px] font-bold uppercase bg-success text-white px-1.5 py-0.5 rounded">Presente</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-xs text-ink-muted mt-3">
                          El registro de clases asistidas lo hace el administrador.
                        </p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'agenda' && (
            <motion.div key="agenda" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Mi Agenda</h2>
                  <p className="text-ink-muted">Administra tus horarios y crea nuevas clases.</p>
                </div>
                <button onClick={() => { setEditingClass(null); setNewClass({ titulo: '', tipo: 'privada', fecha: new Date().toISOString().split('T')[0], hora: '18:00', duracion: 60, lugar: '', valor: 0, notas: '' }); setIsAddingClass(true); }} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Nueva Clase
                </button>
              </div>

              {isAddingClass && (
                <div className="card mb-8 border-magenta/30 shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">{editingClass ? 'Editar Clase' : 'Programar Clase'}</h3>
                    <button onClick={() => setIsAddingClass(false)} className="p-1 hover:bg-surface rounded-full"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="label">Título</label>
                      <input className="input" value={newClass.titulo} onChange={e => setNewClass({...newClass, titulo: e.target.value})} placeholder="Título" />
                    </div>
                    <div>
                      <label className="label">Tipo</label>
                      <select className="input" value={newClass.tipo} onChange={e => setNewClass({...newClass, tipo: e.target.value as any})}>
                        <option value="privada">Privada</option>
                        <option value="academia">Academia</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Fecha</label>
                      <input type="date" className="input" value={newClass.fecha} onChange={e => setNewClass({...newClass, fecha: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Hora</label>
                      <input type="time" className="input" value={newClass.hora} onChange={e => setNewClass({...newClass, hora: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Lugar</label>
                      <input className="input" value={newClass.lugar} onChange={e => setNewClass({...newClass, lugar: e.target.value})} placeholder="Lugar" />
                    </div>
                    <div>
                      <label className="label">Valor ($)</label>
                      <input type="number" className="input" value={newClass.valor} onChange={e => setNewClass({...newClass, valor: Number(e.target.value)})} placeholder="Valor" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setIsAddingClass(false)} className="btn-secondary">Cancelar</button>
                    <button onClick={handleSaveClass} className="btn-primary" disabled={!newClass.titulo}>Guardar</button>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <h3 className="font-bold text-lg border-b border-ink-muted/10 pb-2">Mi Calendario de Clases</h3>
                {(() => {
                  const grouped = teacherSessions.reduce((acc, session) => {
                    if (!acc[session.fecha]) acc[session.fecha] = [];
                    acc[session.fecha].push(session);
                    return acc;
                  }, {} as Record<string, typeof teacherSessions>);
                  
                  const sortedDates = Object.keys(grouped).sort((a,b) => a.localeCompare(b));
                  
                  if (sortedDates.length === 0) {
                    return <p className="text-center text-ink-muted py-8">No tienes clases programadas en tu agenda.</p>;
                  }

                  return sortedDates.map(date => (
                    <div key={date} className="bg-surface p-4 rounded-xl border border-ink-muted/10">
                      <h4 className="font-bold text-magenta mb-3 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        {formatDateStr(date)}
                      </h4>
                      <div className="space-y-3">
                        {grouped[date].sort((a,b) => a.hora.localeCompare(b.hora)).map(session => (
                          <div key={session.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-bg rounded-lg border border-ink-muted/5 hover:border-magenta/30 transition-colors">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{session.hora}</span>
                                <h5 className="font-semibold">{session.titulo}</h5>
                              </div>
                              <p className="text-xs text-ink-muted mt-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {session.lugar}
                                <span className="mx-2">•</span>
                                <Users className="w-3 h-3" /> {session.alumnoIds?.length || 0} inscritos
                              </p>
                            </div>
                            <div className="flex items-center gap-3 mt-2 sm:mt-0">
                              <span className={cn("text-[10px] px-2 py-0.5 rounded uppercase font-bold", session.tipo === 'privada' ? "bg-accent-academy/20 text-accent-academy" : "bg-magenta/20 text-magenta")}>
                                {session.tipo}
                              </span>
                              <button onClick={() => handleEditClassClick(session)} className="p-1.5 text-ink-muted hover:text-ink bg-surface rounded-md"><Edit2 className="w-3.5 h-3.5" /></button>
                              <DeleteButton onConfirm={() => handleDeleteClass(session)} className="text-error hover:underline p-1.5 bg-surface rounded-md" iconOnly={true} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === 'alumnos' && (
            <motion.div key="alumnos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Mis Alumnos</h2>
                  <p className="text-ink-muted">Alumnos que han tomado o tomarán clases contigo.</p>
                </div>
                <button onClick={() => { setEditingStudent(null); setNewStudent({ nombre: '', contacto: '', nivel: 'Principiante', tipo: 'academia', notas: '' }); setSelectedPlanId(''); setIsAddingStudent(true); }} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Nuevo Alumno
                </button>
              </div>
              
              {isAddingStudent && (
                <div className="card mb-8 border-magenta/30 shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">{editingStudent ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
                    <button onClick={() => setIsAddingStudent(false)} className="p-1 hover:bg-surface rounded-full"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="label">Nombre</label>
                      <input className="input" value={newStudent.nombre} onChange={e => setNewStudent({...newStudent, nombre: e.target.value})} placeholder="Nombre" />
                    </div>
                    <div>
                      <label className="label">Contacto (WhatsApp)</label>
                      <input className="input" value={newStudent.contacto} onChange={e => setNewStudent({...newStudent, contacto: e.target.value})} placeholder="Contacto" />
                    </div>
                    <div>
                      <label className="label">Nivel</label>
                      <select className="input" value={newStudent.nivel} onChange={e => setNewStudent({...newStudent, nivel: e.target.value as any})}>
                        <option value="Principiante">Principiante</option>
                        <option value="Intermedio">Intermedio</option>
                        <option value="Avanzado">Avanzado</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Tipo de clases</label>
                      <select className="input" value={newStudent.tipo} onChange={e => setNewStudent({...newStudent, tipo: e.target.value as any})}>
                        <option value="academia">Academia (Grupales)</option>
                        <option value="privada">Clases Privadas</option>
                        <option value="ambas">Ambas</option>
                      </select>
                    </div>

                    {!editingStudent && (
                      <div className="md:col-span-2">
                        <label className="label">Asignar Plan (Opcional)</label>
                        <select className="input" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}>
                          <option value="">Ninguno</option>
                          {data.plans.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre} - ${p.monto.toLocaleString()}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  
                  {/* Competencias editor */}
                  <div className="mb-6 p-4 border border-ink-muted/20 rounded-xl bg-ink-muted/5">
                    <h4 className="font-bold mb-3 flex items-center gap-2 text-magenta">Evaluación de Competencias (0-100)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div>
                        <label className="label text-xs">Ritmo ({newStudent.competencias?.ritmo || 0})</label>
                        <input type="range" min="0" max="100" value={newStudent.competencias?.ritmo || 0} onChange={e => setNewStudent({...newStudent, competencias: {...newStudent.competencias, ritmo: parseInt(e.target.value) || 0} as any})} className="w-full accent-magenta" />
                      </div>
                      <div>
                        <label className="label text-xs">Movimiento ({newStudent.competencias?.movimiento || 0})</label>
                        <input type="range" min="0" max="100" value={newStudent.competencias?.movimiento || 0} onChange={e => setNewStudent({...newStudent, competencias: {...newStudent.competencias, movimiento: parseInt(e.target.value) || 0} as any})} className="w-full accent-magenta" />
                      </div>
                      <div>
                        <label className="label text-xs">Imagen ({newStudent.competencias?.imagen || 0})</label>
                        <input type="range" min="0" max="100" value={newStudent.competencias?.imagen || 0} onChange={e => setNewStudent({...newStudent, competencias: {...newStudent.competencias, imagen: parseInt(e.target.value) || 0} as any})} className="w-full accent-magenta" />
                      </div>
                      <div>
                        <label className="label text-xs">Conexión ({newStudent.competencias?.conexion || 0})</label>
                        <input type="range" min="0" max="100" value={newStudent.competencias?.conexion || 0} onChange={e => setNewStudent({...newStudent, competencias: {...newStudent.competencias, conexion: parseInt(e.target.value) || 0} as any})} className="w-full accent-magenta" />
                      </div>
                    </div>
                  
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setIsAddingStudent(false)} className="btn-secondary">Cancelar</button>
                    <button onClick={handleSaveStudent} className="btn-primary" disabled={!newStudent.nombre}>Guardar</button>
                  </div>
                </div>
              )}

              {myStudents.length === 0 ? (
                <div className="card text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-4 text-ink-muted opacity-20" />
                  <p className="text-ink-muted">Aún no tienes alumnos registrados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myStudents.map(student => (
                    <div key={student.id} className="card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-magenta/10 text-magenta flex items-center justify-center font-bold">
                            {student.nombre.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-bold leading-tight">{student.nombre}</h4>
                            <span className="text-[10px] uppercase text-ink-muted">{student.nivel}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditStudentClick(student)} className="p-1.5 text-ink-muted hover:text-ink bg-surface rounded-md"><Edit2 className="w-3.5 h-3.5" /></button>
                          <DeleteButton onConfirm={() => handleDeleteStudent(student.id)} className="p-1.5 text-ink-muted hover:text-error bg-surface rounded-md" iconOnly={true} />
                        </div>
                      </div>
                      
                      <p className="text-sm text-ink-muted mb-2">Contacto: {student.contacto}</p>
                      
                      <div className="pt-3 border-t border-ink-muted/10 text-xs">
                        <span className="text-ink-muted font-medium">Clases tomadas contigo: </span>
                        <span className="font-bold text-magenta">{teacherSessions.filter(s => s.alumnoIds.includes(student.id) && s.asistencia?.[student.id] === 'presente').length}</span>
                      </div>
                      <div className="mt-4 h-[180px] w-full border-t border-ink-muted/10 pt-2 relative">
                        <h5 className="text-[10px] uppercase font-bold text-ink-muted absolute top-2 left-0 z-10">Competencias</h5>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="65%" data={[
                            { subject: 'Ritmo', A: student.competencias?.ritmo || 0, fullMark: 100 },
                            { subject: 'Mov', A: student.competencias?.movimiento || 0, fullMark: 100 },
                            { subject: 'Imagen', A: student.competencias?.imagen || 0, fullMark: 100 },
                            { subject: 'Conex', A: student.competencias?.conexion || 0, fullMark: 100 },
                          ]}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar name={student.nombre} dataKey="A" stroke="#E33DA0" fill="#E33DA0" fillOpacity={0.4} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'finanzas' && (
            <motion.div key="finanzas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Mis Finanzas</h2>
                <p className="text-ink-muted">Resumen de ingresos por tus clases.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card bg-gradient-to-br from-magenta to-purple-600 text-white">
                  <p className="text-white/80 text-sm font-medium mb-1">Ingresos Acumulados (Clases pasadas)</p>
                  <h3 className="text-3xl font-bold">{formatCurrency(totalEarnings)}</h3>
                </div>
                <div className="card bg-surface">
                  <p className="text-ink-muted text-sm font-medium mb-1">Ingresos Proyectados (Clases futuras)</p>
                  <h3 className="text-3xl font-bold text-ink">{formatCurrency(upcomingEarnings)}</h3>
                </div>
              </div>


              {pendingValidations.length > 0 && (
                <div className="card border-warning/30 bg-warning/5">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-warning">
                    <CheckCircle2 className="w-5 h-5" /> Validar Pagos / Comprobantes
                  </h3>
                  <div className="space-y-3">
                    {pendingValidations.map(payment => {
                      const student = data.students.find(s => s.id === payment.alumnoId);
                      return (
                        <div key={payment.id} className="flex flex-col md:flex-row justify-between md:items-center p-3 bg-surface rounded-lg border border-warning/20 gap-3">
                          <div>
                            <p className="font-bold text-sm">{student?.nombre || 'Alumno desconocido'}</p>
                            <p className="text-xs text-ink-muted">{payment.concepto}</p>
                            <button 
                              onClick={() => setViewingReceipt({ url: payment.comprobanteUrl || '', name: student?.nombre || '' })}
                              className="text-xs text-magenta font-semibold mt-1 flex items-center gap-1 hover:underline"
                            >
                              <Image className="w-3 h-3" /> Ver comprobante
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold mr-2">{formatCurrency(payment.monto)}</span>
                            <button onClick={() => revisarComprobante(payment.id, 'aprobar')} disabled={revisandoPago === payment.id} className="btn-primary py-1 px-3 text-xs bg-success hover:bg-success-dark disabled:opacity-50">Aprobar</button>
                            <button onClick={() => revisarComprobante(payment.id, 'rechazar')} disabled={revisandoPago === payment.id} className="btn-secondary py-1 px-3 text-xs text-error hover:bg-error/10 border-transparent disabled:opacity-50">Rechazar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card">
                <h3 className="font-bold mb-4 border-b border-ink-muted/10 pb-2">Desglose por clase</h3>
                <div className="space-y-3">
                  {teacherSessions.filter(s => s.valor && s.valor > 0).sort((a,b) => b.fecha.localeCompare(a.fecha)).map(session => (
                    <div key={session.id} className="flex justify-between items-center p-3 hover:bg-surface-hover rounded-lg">
                      <div>
                        <p className="font-medium">{session.titulo}</p>
                        <p className="text-xs text-ink-muted">{formatDateStr(session.fecha)}</p>
                      </div>
                      <div className="font-bold">
                        {formatCurrency(session.valor || 0)}
                      </div>
                    </div>
                  ))}
                  {teacherSessions.filter(s => s.valor && s.valor > 0).length === 0 && (
                    <p className="text-center text-ink-muted text-sm py-4">No tienes clases con valor registrado.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'perfil' && (
            <motion.div key="perfil" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Mi Perfil Profesional</h2>
                <p className="text-ink-muted">Administra tu información pública y tus planes.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Perfil Info */}
                <div className="card space-y-4 relative">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-lg">Información Personal</h3>
                    {!isEditingProfile ? (
                      <button onClick={() => { initProfileData(); setIsEditingProfile(true); }} className="text-ink-muted hover:text-magenta transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setIsEditingProfile(false)} className="text-ink-muted hover:text-ink transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                        <button onClick={handleSaveProfile} className="text-magenta hover:text-magenta/80 transition-colors">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingProfile ? (
                    <div className="space-y-4 mt-4">
                      {teacher.foto ? (
                        <img src={teacher.foto} alt={teacher.nombre} className="w-24 h-24 rounded-full object-cover border border-ink-muted/20" />
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center border border-ink-muted/20">
                          <User className="w-8 h-8 text-ink-muted" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Nombre</p>
                        <p className="font-medium text-lg">{teacher.nombre}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Especialidad</p>
                        <p className="font-medium">{teacher.especialidad}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink-muted uppercase tracking-wider">Contacto</p>
                        <p className="font-medium">{teacher.contacto}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="block text-sm font-semibold mb-1">URL de Foto</label>
                        <input type="text" value={profileData.foto} onChange={e => setProfileData({...profileData, foto: e.target.value})} className="input-field w-full" placeholder="Enlace de la foto" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Nombre</label>
                        <input type="text" placeholder="Nombre" value={profileData.nombre} onChange={e => setProfileData({...profileData, nombre: e.target.value})} className="input-field w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Especialidad</label>
                        <input type="text" placeholder="Especialidad" value={profileData.especialidad} onChange={e => setProfileData({...profileData, especialidad: e.target.value})} className="input-field w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Contacto</label>
                        <input type="text" placeholder="Contacto" value={profileData.contacto} onChange={e => setProfileData({...profileData, contacto: e.target.value})} className="input-field w-full" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Planes Info */}
                <div className="card space-y-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg">Mis Planes</h3>
                    <button onClick={() => setEditingPlan({ nombre: '', monto: 0, modalidad: 'Clase suelta', clasesIncluidas: 1 })} className="text-magenta hover:text-magenta/80 transition-colors flex items-center gap-1 text-sm font-medium">
                      <Plus className="w-4 h-4" /> Nuevo Plan
                    </button>
                  </div>

                  {editingPlan && (
                    <div className="bg-surface/50 p-4 rounded-xl border border-ink-muted/10 space-y-3 mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-sm">{editingPlan.id ? 'Editar Plan' : 'Nuevo Plan'}</h4>
                        <button onClick={() => setEditingPlan(null)} className="text-ink-muted hover:text-ink">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Nombre del Plan</label>
                        <input type="text" placeholder="Nombre del plan" value={editingPlan.nombre} onChange={e => setEditingPlan({...editingPlan, nombre: e.target.value})} className="input-field w-full py-1.5 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold mb-1">Monto ($)</label>
                          <input type="number" placeholder="Monto" value={editingPlan.monto} onChange={e => setEditingPlan({...editingPlan, monto: Number(e.target.value)})} className="input-field w-full py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1"># Clases</label>
                          <input type="number" placeholder="Clases incluidas" value={editingPlan.clasesIncluidas} onChange={e => setEditingPlan({...editingPlan, clasesIncluidas: Number(e.target.value)})} className="input-field w-full py-1.5 text-sm" />
                        </div>
                      </div>
                      <button onClick={handleSavePlan} className="btn-primary w-full py-2 text-sm mt-2">Guardar Plan</button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {teacher.planes && teacher.planes.length > 0 ? (
                      teacher.planes.map(p => (
                        <div key={p.id} className="p-3 bg-surface rounded-xl border border-ink-muted/10 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-sm">{p.nombre}</p>
                            <p className="text-xs text-ink-muted">{p.clasesIncluidas} {p.clasesIncluidas === 1 ? 'clase' : 'clases'} · ${p.monto.toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingPlan(p as any)} className="p-1.5 text-ink-muted hover:text-magenta transition-colors bg-bg rounded-md">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeletePlan(p.id)} className="p-1.5 text-ink-muted hover:text-error transition-colors bg-bg rounded-md">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-ink-muted py-4 text-center">No tienes planes configurados.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-ink-muted/10 z-50 flex justify-around items-center p-2 pb-safe">
        <button
          onClick={() => setActiveTab('clases')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors", activeTab === 'clases' ? "text-magenta" : "text-ink-muted")}
        >
          <CalendarDays className={cn("w-5 h-5 mb-1", activeTab === 'clases' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Clases</span>
        </button>
        <button
          onClick={() => setActiveTab('agenda')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors", activeTab === 'agenda' ? "text-magenta" : "text-ink-muted")}
        >
          <Clock className={cn("w-5 h-5 mb-1", activeTab === 'agenda' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Agenda</span>
        </button>
        <button
          onClick={() => setActiveTab('alumnos')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors", activeTab === 'alumnos' ? "text-magenta" : "text-ink-muted")}
        >
          <Users className={cn("w-5 h-5 mb-1", activeTab === 'alumnos' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Alumnos</span>
        </button>
        <button
          onClick={() => setActiveTab('finanzas')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors", activeTab === 'finanzas' ? "text-magenta" : "text-ink-muted")}
        >
          <DollarSign className={cn("w-5 h-5 mb-1", activeTab === 'finanzas' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Finanzas</span>
        </button>
              <button
          onClick={() => { setActiveTab('perfil'); initProfileData(); }}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors", activeTab === 'perfil' ? "text-magenta" : "text-ink-muted")}
        >
          <User className={cn("w-5 h-5 mb-1", activeTab === 'perfil' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Perfil</span>
        </button>
      </nav>
    

      {/* Receipt Modal */}
      <AnimatePresence>
        {viewingReceipt && (
          <ReceiptViewer
            url={viewingReceipt.url}
            nombre={viewingReceipt.name}
            onClose={() => setViewingReceipt(null)}
          />
        )}
      </AnimatePresence>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-bg/80 backdrop-blur-sm flex justify-end"
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-surface h-full shadow-2xl border-l border-ink-muted/10 flex flex-col"
            >
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-magenta" /> Notificaciones</h2>
                <button onClick={() => setShowNotifications(false)} className="p-2 hover:bg-bg rounded-full text-ink-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {myNotifications.length === 0 ? (
                  <div className="text-center py-12 text-ink-muted">
                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No tienes notificaciones.</p>
                  </div>
                ) : (
                  myNotifications.map(n => (
                    <div key={n.id} className={cn("p-4 rounded-xl border", n.type === 'warning' ? 'bg-error/5 border-error/20' : 'bg-bg border-ink-muted/10')}>
                      <h4 className={cn("font-bold text-sm mb-1", n.type === 'warning' ? 'text-error' : 'text-magenta')}>{n.title}</h4>
                      <p className="text-sm text-ink/80">{n.message}</p>
                      <p className="text-xs text-ink-muted mt-2">{formatDateStr(n.fecha)}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
