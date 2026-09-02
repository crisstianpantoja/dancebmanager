import React, { useState } from 'react';
import { useStore } from '../store';
import { LogOut, Calendar as CalendarIcon, QrCode, X, CreditCard, ChevronRight, User, Lock, History, Settings, CalendarDays, CheckCircle2, Star, Clock, Users, Bookmark, MapPin, MessageCircle, Bell, Landmark, Upload, Edit, AlertTriangle, CalendarRange } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { DigitalCard, THEMES, ThemeId } from './DigitalCard';
import { formatDateStr, formatTime, parseLocalDate, cn } from '../lib/utils';
import {
  asistenciasDeAlumno,
  avisosDePlan,
  cobrosPendientes,
  cupoRestante,
  esIlimitada,
  esperaVerificacion,
  estiloCategoria,
  fueRechazado,
  planesActivos,
  planesReportables,
  usaCupo,
} from '../lib/planes';
import { StudentCalendar } from './StudentCalendar';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { apiChangePassword, apiReportarPago } from '../lib/api';
import { CarnetDownloadButton } from './CarnetDownload';

/**
 * Lo que el alumno está reportando en el modal de comprobante: un cobro que ya
 * tenía pendiente, o un plan del catálogo que compra por su cuenta (incluida la
 * clase suelta). El monto y la vigencia los recalcula el servidor.
 */
type ReporteDePago =
  | { tipo: 'cobro'; paymentId: string; concepto: string; monto: number }
  | { tipo: 'plan'; planId: string; concepto: string; monto: number };


export function StudentPortal() {
  const { data, currentUser, logout, updateData , addToast, refresh } = useStore();
  const [activeTab, setActiveTab] = useState<'perfil' | 'calendario' | 'reservas' | 'historico'>('perfil');
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [reporte, setReporte] = useState<ReporteDePago | null>(null);
  /** Lista de planes y cobros para elegir qué se está pagando. */
  const [eligiendoPago, setEligiendoPago] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'bold' | 'transferencia'>('bold');
  const [uploadFile, setUploadFile] = useState<string>('');
  const [enviandoComprobante, setEnviandoComprobante] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ nombre: '', contacto: '', documento: '' });
  /** Formulario de cambio de contraseña, independiente del resto del perfil. */
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  const handleEditProfile = () => {
    setProfileForm({
      nombre: student?.nombre || '',
      contacto: student?.contacto || '',
      documento: student?.documento || ''
    });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setIsEditingProfile(true);
  };

  const handleSaveProfile = () => {
    if (!profileForm.nombre || !profileForm.documento) {
      addToast('Nombre y Documento son obligatorios', 'error');
      return;
    }
    const documento = profileForm.documento.trim();
    // Dos personas con el mismo documento no podrían distinguirse al entrar.
    if (data.students.some(s => s.id !== student?.id && (s.documento || '').trim() === documento)) {
      addToast(`Ya existe un usuario con el documento ${documento}`, 'error');
      return;
    }
    updateData({
      students: data.students.map(s => s.id === student?.id ? { ...s, ...profileForm, documento } : s)
    });
    setIsEditingProfile(false);
    addToast('Perfil actualizado correctamente', 'success');
  };

  /**
   * La contraseña se cambia contra el servidor, que es el único que conoce el
   * hash. Nunca se guarda en el perfil ni viaja con el resto de los datos.
   */
  const handleChangePassword = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!currentPassword || !newPassword) {
      addToast('Completa la contraseña actual y la nueva', 'error');
      return;
    }
    if (newPassword.length < 8) {
      addToast('La contraseña nueva debe tener al menos 8 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('La confirmación no coincide con la contraseña nueva', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await apiChangePassword({ currentPassword, newPassword });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      addToast('Contraseña actualizada correctamente', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña', 'error');
    } finally {
      setChangingPassword(false);
    }
  };
  


  if (!currentUser) return null;

  const student = data.students.find(s => s.id === currentUser.id);

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="mb-4 text-ink-muted">Estudiante no encontrado.</p>
          <button onClick={logout} className="btn-secondary">Volver</button>
        </div>
      </div>
    );
      

  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Next classes
  const mySessions = data.sessions.filter(s => s.alumnoIds.includes(student.id));
  const nextClasses = mySessions
    .filter(s => s.fecha >= todayStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Available classes to book (sessions where student is not in alumnoIds and fecha >= today)
  const myNotifications = data.notifications?.filter(n => n.userId === student.id).sort((a,b) => b.fecha.localeCompare(a.fecha)) || [];
  const unreadCount = myNotifications.filter(n => !n.read).length;
    const [bookingTeacherId, setBookingTeacherId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>(todayStr);
const [bookingPlanId, setBookingPlanId] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);

  const WORK_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

  const getAvailableHours = () => {
    if (!bookingTeacherId || !bookingDate) return [];
    const teacherSessions = data.sessions.filter(s => s.profesorId === bookingTeacherId && s.fecha === bookingDate);
    
    return WORK_HOURS.map(hour => {
      const isBusy = teacherSessions.some(s => s.hora === hour);
      return { hour, isBusy };
    });
  };

  const availableHours = getAvailableHours();

const handleBookPrivate = (hour: string) => {
    setBookingLoading(hour);
    setTimeout(() => {
      const selectedTeacher = data.teachers.find(t => t.id === bookingTeacherId);
      const selectedPlan = selectedTeacher?.planes?.find(p => p.id === bookingPlanId);
      
      const newSession = {
        id: 'sess_' + Math.random().toString(36).substr(2, 9),
        profesorId: bookingTeacherId,
        titulo: selectedPlan ? `Clase Privada - ${selectedPlan.nombre}` : 'Clase Privada',
        tipo: 'privada' as const,
        estado: 'pendiente' as const,
        planId: selectedPlan?.id,
        fecha: bookingDate,
        hora: hour,
        duracion: 60,
        lugar: 'Por confirmar',
        valor: selectedPlan?.monto || 0,
        notas: '',
        alumnoIds: [student.id],
        asistencia: {}
      };
      
      const teacherNotif = {
        id: 'notif_' + Math.random().toString(36).substr(2, 9),
        userId: bookingTeacherId,
        title: 'Nueva Reserva de ' + student.nombre,
        message: `Reserva para el ${formatDateStr(bookingDate)} a las ${hour}. Plan: ${selectedPlan?.nombre || 'General'}.`,
        fecha: new Date().toISOString(),
        read: false,
        type: 'info' as const
      };

      const studentNotif = {
        id: 'notif_' + Math.random().toString(36).substr(2, 9),
        userId: student.id,
        title: 'Reserva Pendiente',
        message: `Has solicitado una clase con ${selectedTeacher?.nombre} el ${formatDateStr(bookingDate)} a las ${hour}. Esperando confirmación.`,
        fecha: new Date().toISOString(),
        read: false,
        type: 'info' as const
      };

      updateData({ 
        sessions: [...data.sessions, newSession],
        notifications: [...(data.notifications || []), teacherNotif, studentNotif]
      });
      setBookingLoading(null);
      setActiveTab('historico');
    }, 600);
  };

  // Packages & Payments
  // Un plan sirve si está vigente y le queda cupo; la mensualidad ilimitada
  // sólo necesita estar vigente.
  const activePayments = planesActivos(data.payments, student.id);

  /** Avisos de pocas clases o vigencia por vencer. Son informativos: no bloquean nada. */
  const avisos = avisosDePlan(data.payments, student.id);

  /** Clases tomadas, según los registros del administrador (sin los anulados). */
  const misAsistencias = asistenciasDeAlumno(data.attendanceRecords || [], student.id);

  const pendingPayments = cobrosPendientes(data.payments, student.id);
  /** Comprobantes que subió y el administrador todavía no revisó. */
  const verificationPayments = data.payments.filter(
    p => p.alumnoId === student.id && esperaVerificacion(p)
  );
  /** Planes del catálogo que el alumno puede reportar, clase suelta incluida. */
  const planesDisponibles = planesReportables(data.plans || []);

  const abrirComprobante = (destino: ReporteDePago) => {
    setReporte(destino);
    setEligiendoPago(false);
    setPaymentMethod('bold');
    setUploadFile('');
  };

  const cerrarComprobante = () => {
    setReporte(null);
    setUploadFile('');
  };

  /**
   * Envía el comprobante. El plan queda activo de inmediato y el
   * administrador lo revisa después: el servidor es quien calcula el monto,
   * el cupo y la vigencia desde la plantilla del plan.
   */
  const handlePaymentSubmit = async () => {
    if (!reporte || !uploadFile || enviandoComprobante) return;
    setEnviandoComprobante(true);
    try {
      const respuesta = await apiReportarPago({
        ...(reporte.tipo === 'cobro'
          ? { paymentId: reporte.paymentId }
          : { planId: reporte.planId }),
        metodoPago: paymentMethod,
        comprobanteUrl: uploadFile,
      });
      await refresh();
      cerrarComprobante();
      addToast(respuesta.detalle, 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'No pudimos registrar tu comprobante',
        'error'
      );
    } finally {
      setEnviandoComprobante(false);
    }
  };

  const handleThemeChange = (themeId: ThemeId) => {
    
    const updatedStudents = data.students.map(s => 
      s.id === student.id ? { ...s, cardTheme: themeId } : s
    );
    updateData({ students: updatedStudents });
  };

  return (
    <div className="min-h-screen bg-bg pb-20 md:pb-0">
      <header className="bg-surface border-b border-ink-muted/10 sticky top-0 z-40 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          {data.settings?.showLoginLogo && (data.settings?.studentPortalLogoUrl || data.settings?.loginLogoUrl) ? (
            <img src={data.settings.studentPortalLogoUrl || data.settings.loginLogoUrl} alt="Logo" className="max-h-8 object-contain" />
          ) : (
            <h1 className="text-xl font-bold text-magenta tracking-tight">DanceB</h1>
          )}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setShowNotifications(true);
                // Mark all as read
                if (unreadCount > 0) {
                  const updatedNotifs = data.notifications.map(n => 
                    n.userId === student.id ? { ...n, read: true } : n
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
            <button onClick={logout} className="text-ink-muted hover:text-ink transition-colors flex items-center gap-2 text-sm font-medium">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Top Navigation */}
      <div className="hidden md:flex fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-surface/80 backdrop-blur-md border border-ink-muted/20 rounded-full p-1 shadow-lg">
        <button
          onClick={() => setActiveTab('perfil')}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", activeTab === 'perfil' ? "bg-magenta text-white shadow-md" : "text-ink-muted hover:text-ink")}
        >
          <User className="w-4 h-4" /> Perfil
        </button>

        <button
          onClick={() => setActiveTab('calendario')}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", activeTab === 'calendario' ? "bg-magenta text-white shadow-md" : "text-ink-muted hover:text-ink")}
        >
          <CalendarRange className="w-4 h-4" /> Calendario
        </button>
        <button
          onClick={() => setActiveTab('reservas')}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", activeTab === 'reservas' ? "bg-magenta text-white shadow-md" : "text-ink-muted hover:text-ink")}
        >
          <CalendarDays className="w-4 h-4" /> Reservas
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", activeTab === 'historico' ? "bg-magenta text-white shadow-md" : "text-ink-muted hover:text-ink")}
        >
          <History className="w-4 h-4" /> Histórico
        </button>
      </div>

      <main className="max-w-5xl mx-auto p-4 pb-24 md:p-8 md:pt-12">
        <AnimatePresence mode="wait">
        {activeTab === 'perfil' && (
          <motion.div key="perfil" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full">
            {/* Avisos de cupo y vigencia. Informan; no bloquean nada. */}
            {avisos.length > 0 && (
              <div className="space-y-2 mb-6">
                {avisos.map(aviso => (
                  <div
                    key={aviso.id}
                    className={cn(
                      "rounded-xl border p-4 flex gap-3",
                      aviso.nivel === 'error'
                        ? "border-error/40 bg-error/10"
                        : "border-pending/40 bg-pending/10"
                    )}
                  >
                    <AlertTriangle className={cn("w-5 h-5 shrink-0 mt-0.5", aviso.nivel === 'error' ? "text-error" : "text-pending")} />
                    <div>
                      <p className={cn("font-bold text-sm", aviso.nivel === 'error' ? "text-error" : "text-pending")}>
                        {aviso.titulo}
                      </p>
                      <p className="text-sm text-ink-muted mt-0.5">{aviso.mensaje}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Banner & Header */}
            <div className="relative mb-14 md:mb-16">
              <div className="h-40 md:h-48 w-full rounded-t-3xl md:rounded-t-[2.5rem] overflow-hidden relative bg-surface-hover border border-ink-muted/10">
                 {/* Decorative shapes resembling the reference */}
                 <div className="absolute inset-0 opacity-20">
                    
                 </div>
              </div>
              
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-12 flex items-end gap-6">
                 <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-bg bg-surface overflow-hidden shadow-lg relative group">
                     {student.foto ? (
                       <img src={student.foto} alt={student.nombre} className="w-full h-full object-cover" />
                     ) : (
                       <div className="w-full h-full bg-magenta/10 text-magenta flex items-center justify-center text-4xl font-bold uppercase">
                         {student.nombre.substring(0, 2)}
                       </div>
                     )}
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => setIsEditingProfile(true)}>
                        <Upload className="text-white w-6 h-6" />
                     </div>
                 </div>
              </div>
              
              <div className="absolute top-4 right-4 md:top-auto md:-bottom-4 md:right-8 flex gap-2">
                 <button onClick={() => setIsEditingProfile(true)} className="btn-secondary py-1.5 px-4 text-xs md:text-sm bg-surface shadow-sm hidden md:block">
                    Configuración de la cuenta
                 </button>
                 <button onClick={() => setIsEditingProfile(true)} className="md:hidden bg-surface p-2 rounded-full shadow-sm text-ink-muted hover:text-ink">
                    <Edit className="w-5 h-5" />
                 </button>
              </div>
            </div>

            {/* Name & Title */}
            <div className="px-4 md:px-12 mb-8 mt-4 md:mt-0 text-center md:text-left">
               <h2 className="text-2xl md:text-3xl font-bold text-ink">{student.nombre}</h2>
               <p className="text-ink-muted text-sm flex items-center justify-center md:justify-start gap-2 mt-1">
                 {student.nivel} • {student.tipo === 'ambas' ? 'Academia & Privadas' : student.tipo.charAt(0).toUpperCase() + student.tipo.slice(1)}
               </p>
            </div>

            {/* Fake Tabs Line (from reference) */}
            <div className="px-4 md:px-12 border-b border-ink-muted/10 flex gap-6 mb-8 text-sm font-medium overflow-x-auto no-scrollbar">
               <button className="pb-3 border-b-2 border-magenta text-ink whitespace-nowrap">Vista general</button>
               <button onClick={() => setActiveTab('reservas')} className="pb-3 border-b-2 border-transparent text-ink-muted hover:text-ink whitespace-nowrap">Mi Agenda</button>
               <button onClick={() => setActiveTab('historico')} className="pb-3 border-b-2 border-transparent text-ink-muted hover:text-ink whitespace-nowrap">Historial</button>
            </div>

            {/* Main Layout */}
            <div className="px-4 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column (Main) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Mi Agenda Pendiente */}
                    <div className="bg-surface rounded-2xl p-6 border border-ink-muted/10 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg text-ink flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-magenta"/> Mi Agenda</h3>
                        <button onClick={() => setActiveTab('reservas')} className="text-magenta text-xs font-semibold hover:underline flex items-center">Explorar más</button>
                      </div>
                      
                      {nextClasses.length === 0 ? (
                         <div className="text-center py-6 text-ink-muted bg-bg/50 rounded-xl border border-dashed border-ink-muted/20">
                            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No tienes clases o eventos próximos.</p>
                         </div>
                      ) : (
                         <div className="space-y-3">
                           {nextClasses.slice(0, 4).map(s => (
                             <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl border border-ink-muted/5 hover:bg-bg/50 transition-colors">
                                <div className="bg-magenta/10 text-magenta p-3 rounded-xl flex flex-col items-center justify-center min-w-[64px] border border-magenta/20">
                                   <span className="text-[10px] font-bold uppercase">{new Date(s.fecha).toLocaleDateString('es-CO', { month: 'short' })}</span>
                                   <span className="text-2xl font-black leading-none mt-1">{new Date(s.fecha).getDate()}</span>
                                </div>
                                <div className="flex-1">
                                   <h4 className="font-bold text-sm">{s.titulo}</h4>
                                   <p className="text-xs text-ink-muted flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {s.hora} • <MapPin className="w-3 h-3 ml-1"/> {s.lugar || 'Academia'}</p>
                                </div>
                                {s.estado === 'pendiente' && (
                                  <span className="text-[10px] px-2 py-1 rounded-md bg-warning/20 text-warning font-bold uppercase hidden sm:block">Pendiente</span>
                                )}
                             </div>
                           ))}
                         </div>
                      )}
                    </div>

                    {/* Mi progreso y lo que me dicen los profesores */}
                    <div className="bg-surface rounded-2xl p-6 border border-ink-muted/10 shadow-sm">
                      <h3 className="font-bold text-lg mb-6 text-ink flex items-center gap-2"><Star className="w-5 h-5 text-magenta"/> Mi progreso y feedback</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                          {/* Radar Chart */}
                          <div className="h-56 w-full flex flex-col items-center">
                             {student.competencias ? (
                               <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                      { subject: 'Ritmo', A: student.competencias.ritmo || 0, fullMark: 10 },
                                      { subject: 'Movimiento', A: student.competencias.movimiento || 0, fullMark: 10 },
                                      { subject: 'Imagen', A: student.competencias.imagen || 0, fullMark: 10 },
                                      { subject: 'Conexión', A: student.competencias.conexion || 0, fullMark: 10 }
                                  ]}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#8b8b98', fontSize: 11, fontWeight: 600 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                    <Radar name="Nivel" dataKey="A" stroke="#E33DA0" strokeWidth={2} fill="#E33DA0" fillOpacity={0.4} />
                                  </RadarChart>
                               </ResponsiveContainer>
                             ) : (
                               <div className="h-full flex items-center justify-center text-ink-muted text-sm text-center px-4">
                                  Aún no tienes competencias evaluadas.
                               </div>
                             )}
                          </div>

                          {/* Lo que me dicen los profesores (Historial / Notas) */}
                          <div className="space-y-4">
                             <h4 className="font-semibold text-sm flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-ink-muted"/> Notas de profesores</h4>
                             {student.historial && student.historial.length > 0 ? (
                                <div className="space-y-4">
                                   {student.historial.slice(0, 3).map((h, idx) => (
                                      <div key={idx} className="relative pl-4 border-l-2 border-magenta/30">
                                         <p className="text-[10px] uppercase font-bold text-ink-muted mb-1">{formatDateStr(h.fecha)}</p>
                                         <p className="text-sm font-medium italic text-ink/90 leading-snug">"{h.nota}"</p>
                                      </div>
                                   ))}
                                </div>
                             ) : (
                                <p className="text-sm text-ink-muted bg-bg p-3 rounded-lg border border-ink-muted/10">Aún no tienes feedback registrado de tus profesores.</p>
                             )}
                          </div>
                      </div>
                    </div>
                </div>

                {/* Right Column (Sidebar details) */}
                <div className="space-y-6">
                    {/* Detalles */}
                    <div className="bg-surface rounded-2xl p-6 border border-ink-muted/10 shadow-sm">
                      <h3 className="font-bold text-sm mb-4 text-ink">Detalles de Contacto</h3>
                      <div className="space-y-3">
                         <div className="grid grid-cols-[80px_1fr] text-sm">
                            <span className="text-ink-muted font-medium">Correo</span>
                            <span className="truncate" title={student.contacto}>{student.contacto || 'No especificado'}</span>
                         </div>
                         <div className="grid grid-cols-[80px_1fr] text-sm">
                            <span className="text-ink-muted font-medium">Doc.</span>
                            <span className="truncate">{student.documento || 'No especificado'}</span>
                         </div>
                         <div className="grid grid-cols-[80px_1fr] text-sm">
                            <span className="text-ink-muted font-medium">Ingreso</span>
                            <span>{formatDateStr(student.fechaIngreso)}</span>
                         </div>
                      </div>
                    </div>
                    
                    {/* Membresías */}
                    <div className="bg-surface rounded-2xl p-6 border border-ink-muted/10 shadow-sm">
                       <h3 className="font-bold text-sm mb-4 text-ink flex items-center gap-2"><Landmark className="w-4 h-4"/> Mis Membresías</h3>
                       {activePayments.length > 0 ? (
                         <div className="space-y-4">
                           {activePayments.map(p => {
                             const restantes = cupoRestante(p);
                             return (
                             <div key={p.id}>
                               <h4 className="text-sm font-semibold mb-1">{p.concepto}</h4>
                               {/* Una mensualidad ilimitada no muestra clases restantes: sólo su vigencia. */}
                               {usaCupo(p) && p.clasesIncluidas > 0 ? (
                                  <>
                                     <div className="flex justify-between text-xs mb-1.5">
                                        <span className={cn("font-medium", restantes <= 1 ? "text-error" : "text-magenta")}>
                                          {restantes} restantes
                                        </span>
                                        <span className="text-ink-muted">de {p.clasesIncluidas}</span>
                                     </div>
                                     <div className="w-full bg-bg h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-magenta h-full rounded-full transition-all" style={{ width: `${(restantes / p.clasesIncluidas) * 100}%` }} />
                                     </div>
                                  </>
                               ) : (
                                  <span className="bg-success/20 text-success px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                    {esIlimitada(p) ? 'Clases ilimitadas' : 'Suscripción Activa'}
                                  </span>
                               )}
                               {p.fechaVencimiento && (
                                 <p className="text-[11px] text-ink-muted mt-1.5">
                                   Vigente hasta el {formatDateStr(p.fechaVencimiento)}
                                 </p>
                               )}
                             </div>
                             );
                           })}
                         </div>
                       ) : (
                         <div className="text-center py-4 bg-bg rounded-xl border border-dashed border-ink-muted/20">
                            <p className="text-xs text-ink-muted">No tienes membresías activas.</p>
                         </div>
                       )}

                       {/* Comprobantes en revisión, rechazados y cobros pendientes */}
                       {(pendingPayments.length > 0 || verificationPayments.length > 0) && (
                          <div className="mt-4 pt-4 border-t border-ink-muted/10 space-y-3">
                             {verificationPayments.map(p => (
                                <div key={p.id} className="bg-warning/10 p-3 rounded-lg border border-warning/20">
                                   <div className="flex justify-between items-center text-xs gap-2">
                                      <span className="truncate text-warning font-semibold">{p.concepto}</span>
                                      <span className="text-warning/80 whitespace-nowrap font-bold uppercase text-[10px]">En revisión</span>
                                   </div>
                                   <p className="text-[11px] text-ink-muted mt-1">
                                     Ya está activo. El administrador confirmará tu pago.
                                   </p>
                                </div>
                             ))}
                             {pendingPayments.map(p => (
                                <div key={p.id} className="flex flex-col gap-2 bg-error/5 p-3 rounded-lg border border-error/10">
                                   <div className="flex justify-between items-center text-xs">
                                      <span className="truncate font-semibold text-error max-w-[120px]">{p.concepto}</span>
                                      <span className="font-bold">${(p.monto || 0).toLocaleString()}</span>
                                   </div>
                                   {fueRechazado(p) && (
                                     <p className="text-[11px] text-error">
                                       Tu comprobante fue rechazado. {p.notas || 'Vuelve a subirlo.'}
                                     </p>
                                   )}
                                   <button
                                     onClick={() => abrirComprobante({ tipo: 'cobro', paymentId: p.id, concepto: p.concepto, monto: p.monto || 0 })}
                                     className="w-full text-center text-xs py-1.5 bg-magenta text-white font-bold rounded-md hover:bg-magenta/90"
                                   >
                                     {fueRechazado(p) ? 'Subir de nuevo' : 'Pagar ahora'}
                                   </button>
                                </div>
                             ))}
                          </div>
                       )}

                       {/* El alumno también puede reportar un plan o una clase suelta que pagó por fuera. */}
                       <button
                         onClick={() => setEligiendoPago(true)}
                         className="w-full btn-secondary mt-4 py-2 text-xs flex items-center justify-center gap-2"
                       >
                         <Upload className="w-3.5 h-3.5" /> Reportar un pago
                       </button>
                    </div>

                    {/* Carnet Digital */}
                    <div className="bg-surface rounded-2xl p-6 border border-ink-muted/10 shadow-sm flex flex-col items-center">
                      <h3 className="font-bold text-sm mb-4 text-ink self-start">Mi Carnet Digital</h3>
                      
                      {!student.cardTheme ? (
                         <>
                           <div className="w-full max-w-[280px]">
                              <div className="p-2"><DigitalCard student={{...student, cardTheme: previewTheme || student.cardTheme}} /></div>
                           </div>
                           
                           <div className="mt-4 flex flex-col items-center w-full">
                              <p className="text-[10px] uppercase font-bold text-ink-muted mb-2">Selecciona un color para tu carnet</p>
                              <div className="flex gap-3 mb-2">
                                {(Object.entries(THEMES) as [any, any]).map(([id, theme]) => (
                                  <button
                                    key={id}
                                    onMouseEnter={() => setPreviewTheme(id as ThemeId)}
                                    onMouseLeave={() => setPreviewTheme(null)}
                                    onClick={() => handleThemeChange(id as ThemeId)}
                                    className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                                    style={{ 
                                      backgroundColor: theme.hex, 
                                      borderColor: (previewTheme || student.cardTheme) === id ? 'white' : 'transparent',
                                      opacity: (previewTheme || student.cardTheme) === id ? 1 : 0.5 
                                    }}
                                    title={theme.name}
                                  />
                                ))}
                              </div>
                           </div>
                         </>
                      ) : (
                         <div className="flex flex-col items-center justify-center py-6 w-full">
                            <QrCode className="w-16 h-16 text-magenta mb-4 opacity-80 drop-shadow-md" />
                            <h4 className="font-bold text-lg text-ink mb-1">Carnet Activo</h4>
                            <p className="text-sm text-ink-muted mb-6 text-center">Tu carnet digital está listo para usar.</p>
                            <button onClick={() => setShowCardModal(true)} className="btn-primary flex items-center justify-center gap-2 w-full py-3">
                               <QrCode className="w-4 h-4" /> Ver Carnet
                            </button>
                         </div>
                      )}

                    </div>
                </div>
            </div>

            {/* Modal de Carnet Digital */}
            <AnimatePresence>
              {showCardModal && (
                <motion.div onClick={() => setShowCardModal(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                   <motion.div onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="relative w-full max-w-[340px] flex flex-col items-center">
                      <div className="w-full">
                         <DigitalCard student={student} showClose={true} onClose={() => setShowCardModal(false)} />
                      </div>
                      
                      <CarnetDownloadButton
                        student={student}
                        className="btn-secondary w-full py-3 mt-6 border-white/20 text-white hover:bg-white/10 bg-black/50 backdrop-blur-md"
                      />
                   </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Modal de Configuración */}
            <AnimatePresence>
              {isEditingProfile && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                   <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-surface p-0 rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                      <div className="bg-surface-hover border-b border-ink-muted/10 p-6 flex justify-between items-center relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-8 opacity-5">
                             <Settings className="w-32 h-32 transform translate-x-8 -translate-y-8" />
                         </div>
                         <div className="relative z-10">
                           <h3 className="font-black text-2xl text-ink tracking-tight">Tu Perfil</h3>
                           <p className="text-sm text-ink-muted mt-1">Actualiza tu información personal y de acceso</p>
                         </div>
                         <button onClick={() => setIsEditingProfile(false)} className="relative z-10 p-2 text-ink-muted hover:text-ink bg-bg rounded-full border border-ink-muted/10 hover:border-ink-muted/30 transition-all">
                            <X className="w-5 h-5"/>
                         </button>
                      </div>
                      
                      <div className="p-6 overflow-y-auto flex-1 space-y-6">
                          
                          {/* Sección Foto */}
                          <div className="bg-bg p-5 rounded-2xl border border-ink-muted/10">
                             <div className="flex items-center gap-4 mb-4">
                                <div className="w-16 h-16 rounded-full overflow-hidden bg-surface border-2 border-magenta/20 flex-shrink-0 flex items-center justify-center">
                                   {student.foto ? <img src={student.foto} alt="Profile" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-magenta/50" />}
                                </div>
                                <div>
                                   <h4 className="font-bold text-ink">Fotografía</h4>
                                   <p className="text-xs text-ink-muted">Sube una imagen para tu perfil</p>
                                </div>
                             </div>
                             <div className="w-full">
                                <ImageUpload
                                  value={student.foto || ''}
                                  onChange={(url) => {
                                   updateData({
                                     students: data.students.map(s => s.id === student.id ? { ...s, foto: url } : s)
                                   });
                                 }}
                                 label=""
                                 showPreview={false}
                                />
                                <p className="text-[10px] text-ink-muted/80 mt-3 text-center">La imagen se centrará y recortará automáticamente en forma de círculo.</p>
                             </div>
                          </div>

                          {/* Sección Información Personal */}
                          <div className="space-y-4">
                             <h4 className="font-bold text-sm text-ink uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4 text-magenta" /> Datos Personales
                             </h4>
                             <div className="grid grid-cols-1 gap-4">
                                 <div>
                                   <label className="label text-xs ml-1">Nombre Completo</label>
                                   <input type="text" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" value={profileForm.nombre} onChange={e => setProfileForm({...profileForm, nombre: e.target.value})} placeholder="Nombre completo" />
                                 </div>
                                 <div>
                                   <label className="label text-xs ml-1">Contacto / Teléfono</label>
                                   <input type="text" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" value={profileForm.contacto} onChange={e => setProfileForm({...profileForm, contacto: e.target.value})} placeholder="Contacto" />
                                 </div>
                             </div>
                          </div>

                          <hr className="border-ink-muted/10" />

                          {/* Sección Cuenta / Acceso */}
                          <div className="space-y-4">
                             <h4 className="font-bold text-sm text-ink uppercase tracking-wider flex items-center gap-2">
                                <Lock className="w-4 h-4 text-magenta" /> Datos de Acceso
                             </h4>
                             <div className="grid grid-cols-1 gap-4">
                                 <div>
                                   <label className="label text-xs ml-1">Documento (Login)</label>
                                   <input type="text" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" placeholder="Documento" value={profileForm.documento} onChange={e => setProfileForm({...profileForm, documento: e.target.value})} />
                                 </div>
                             </div>

                             {/* El cambio de contraseña se confirma por separado: no
                                 forma parte de los datos del perfil. */}
                             <div className="rounded-xl border border-ink-muted/10 bg-bg/60 p-4 space-y-3">
                                 <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Cambiar contraseña</p>
                                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                     <input type="password" autoComplete="current-password" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" placeholder="Contraseña actual" value={passwordForm.currentPassword} onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} />
                                     <input type="password" autoComplete="new-password" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" placeholder="Contraseña nueva" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} />
                                     <input type="password" autoComplete="new-password" className="input py-2.5 text-sm bg-bg border-ink-muted/10 focus:border-magenta" placeholder="Confirmar contraseña" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} />
                                 </div>
                                 <div className="flex items-center justify-between gap-3 flex-wrap">
                                     <p className="text-[11px] text-ink-muted/80">Mínimo 8 caracteres.</p>
                                     <button
                                       type="button"
                                       onClick={handleChangePassword}
                                       disabled={changingPassword}
                                       className="btn-secondary text-xs py-2 px-4 disabled:opacity-60"
                                     >
                                       {changingPassword ? 'Guardando…' : 'Actualizar contraseña'}
                                     </button>
                                 </div>
                             </div>
                          </div>

                      </div>
                      
                      <div className="p-6 bg-surface-hover border-t border-ink-muted/10 flex gap-3">
                         <button onClick={() => setIsEditingProfile(false)} className="flex-1 btn-secondary py-3 text-sm font-semibold bg-bg border-ink-muted/20 hover:bg-ink-muted/5 transition-colors">Cancelar</button>
                         <button onClick={handleSaveProfile} className="flex-1 btn-primary py-3 text-sm font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-md">
                            <CheckCircle2 className="w-5 h-5" /> Guardar Cambios
                         </button>
                      </div>
                   </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        )}

                {activeTab === 'reservas' && (
          <motion.div key="reservas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Clases y Eventos Disponibles</h2>
              <p className="text-ink-muted">Inscríbete en nuestros próximos sociales, talleres y clases regulares.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(data.events || []).filter(e => e.date >= todayStr).sort((a,b) => a.date.localeCompare(b.date)).map((ev, idx) => {
                const isEnrolled = ev.enrolledStudents?.includes(student.id);
                // Sin `capacity` (o con 0) el evento no tiene tope. El paréntesis es
                // necesario: `>=` liga más fuerte que `||`, y sin él cualquier evento
                // con un solo inscrito se mostraba como agotado.
                const isFull = !!ev.capacity && (ev.enrolledStudents?.length || 0) >= ev.capacity;
                
                return (
                  <motion.div 
                    key={ev.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="card p-0 relative overflow-hidden flex flex-col group"
                  >
                    {ev.imageUrl && (
                      <div className="w-full h-32 bg-surface-hover overflow-hidden">
                         <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="p-6 relative flex-1 flex flex-col">
                      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: ev.type === 'taller' ? '#37D9A6' : ev.type === 'evento_especial' ? '#B084F5' : '#E33DA0' }}></div>
                      <div className="pl-4 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          ev.type === 'clase_regular' ? 'bg-accent-academy/20 text-accent-academy' : 
                          ev.type === 'taller' ? 'bg-success/20 text-success' : 'bg-magenta/20 text-magenta'
                        }`}>
                          {ev.type.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold mt-1 mb-1">{ev.title}</h3>
                      {ev.instructor && <p className="text-sm text-ink-muted mb-4"><Users className="w-3 h-3 inline mr-1"/> {ev.instructor}</p>}
                      
                      <div className="space-y-2 mb-6 flex-1">
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <CalendarIcon className="w-4 h-4 text-magenta" /> 
                          {new Date(ev.date).toLocaleDateString('es-CO', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <Clock className="w-4 h-4 text-accent-academy" /> 
                          {ev.startTime} - {ev.endTime}
                        </div>
                        {ev.level && (
                          <div className="flex items-center gap-2 text-sm text-ink-muted">
                            <Star className="w-4 h-4 text-pending" /> 
                            {ev.level}
                          </div>
                        )}
                        {ev.price !== undefined && ev.price > 0 && (
                          <div className="flex items-center gap-2 text-sm font-bold text-ink">
                            <CreditCard className="w-4 h-4 text-magenta" /> 
                            ${ev.price.toLocaleString()}
                          </div>
                        )}
                      </div>
                      
                      {isEnrolled ? (
                        <div className="bg-success/10 text-success text-center py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Ya estás inscrito
                        </div>
                      ) : isFull ? (
                        <div className="bg-surface-hover text-ink-muted text-center py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                          <Users className="w-4 h-4" /> Cupos Agotados
                        </div>
                      ) : (
                        <button 
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const updated = (data.events || []).map(e => e.id === ev.id ? { ...e, enrolledStudents: [...(e.enrolledStudents || []), student.id] } : e);
                              await updateData({ events: updated });
                              addToast('Te has inscrito correctamente', 'success');
                            } catch (error) {
                              console.error(error);
                              addToast('Error al inscribirse', 'error');
                            }
                          }}
                          className="btn-primary w-full py-2 text-sm"
                        >
                          Inscribirme
                        </button>
                      )}
                    </div>
                    </div>
                  </motion.div>
                );
              })}
              
              {(!data.events || data.events.filter(e => e.date >= todayStr).length === 0) && (
                 <div className="col-span-full text-center py-12 text-ink-muted bg-surface rounded-xl border border-dashed border-ink-muted/20">
                    No hay eventos ni clases programadas próximas.
                 </div>
              )}
            </div>
          </motion.div>
        )}
        {activeTab === 'calendario' && (
          <motion.div key="calendario" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full">
            <StudentCalendar student={student} />
          </motion.div>
        )}
        {activeTab === 'historico' && (
          <motion.div key="historico" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">Histórico y Próximas</h2>
              <p className="text-ink-muted">Sigue tu proceso de aprendizaje.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Próximas */}
              <div>
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-magenta flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Próximas Clases
                </h3>
                {nextClasses.length === 0 ? (
                  <p className="text-sm text-ink-muted bg-surface p-4 rounded-lg">No tienes clases agendadas próximamente.</p>
                ) : (
                  <div className="space-y-3">
                    {nextClasses.map(s => (
                      <div key={s.id} className="bg-surface p-4 rounded-xl border border-ink-muted/10 relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-magenta"></div>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-base">{s.titulo}</h4>
                          {s.estado === 'pendiente' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-warning/20 text-warning font-bold uppercase">Pendiente</span>
                          )}
                        </div>
                        <p className="text-ink-muted text-sm mb-1">{s.profesorId && <span className="text-magenta mr-2 font-medium">{data.teachers.find(t => t.id === s.profesorId)?.nombre}</span>}{formatDateStr(s.fecha)} · {s.hora}</p>
                        <div className="flex items-center gap-3 text-ink-muted text-xs mt-2">
                          <span>📍 {s.lugar}</span>
                          <span>⏳ {s.duracion} min</span>
                          {s.valor ? <span className="font-semibold text-magenta">💰 ${s.valor.toLocaleString()}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Histórico */}
              <div>
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-muted flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Historial de Clases
                </h3>
                {/* Sólo de consulta: estas clases las registra el administrador. */}
                {misAsistencias.length === 0 ? (
                  <p className="text-sm text-ink-muted bg-surface p-4 rounded-lg">Aún no has tomado clases.</p>
                ) : (
                  <div className="space-y-3">
                    {misAsistencias.map(r => {
                      const estilo = estiloCategoria(r.categoria);
                      return (
                        <div key={r.id} className="bg-surface/50 p-4 rounded-xl border border-ink-muted/10">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <h4 className="font-medium text-base text-ink/80">{r.titulo}</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-success/20 text-success font-bold uppercase shrink-0">Asistió</span>
                          </div>
                          <p className="text-ink-muted text-sm">
                            {formatDateStr(r.fecha)}{r.hora ? ` · ${formatTime(r.hora)}` : ''}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            {r.categoria && (
                              <span className={cn("text-[10px] px-2 py-0.5 rounded uppercase font-bold", estilo.badge)}>
                                {r.categoria}
                              </span>
                            )}
                            {r.planConcepto && (
                              <span className="text-xs text-ink-muted">{r.planConcepto}</span>
                            )}
                            {r.estadoPlan === 'sin_plan' || r.estadoPlan === 'vencido' || r.estadoPlan === 'sin_cupo' ? (
                              <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-pending/20 text-pending">
                                Pendiente de cobro
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-surface/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 z-50 flex justify-around items-center p-2 rounded-2xl no-scrollbar">
        <button
          onClick={() => setActiveTab('perfil')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all", activeTab === 'perfil' ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5")}
        >
          <User className={cn("w-5 h-5 mb-1", activeTab === 'perfil' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Perfil</span>
        </button>

        <button
          onClick={() => setActiveTab('calendario')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all", activeTab === 'calendario' ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5")}
        >
          <CalendarRange className={cn("w-5 h-5 mb-1", activeTab === 'calendario' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Calendario</span>
        </button>
        <button
          onClick={() => setActiveTab('reservas')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all", activeTab === 'reservas' ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5")}
        >
          <CalendarDays className={cn("w-5 h-5 mb-1", activeTab === 'reservas' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Reservas</span>
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={cn("flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all", activeTab === 'historico' ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5")}
        >
          <History className={cn("w-5 h-5 mb-1", activeTab === 'historico' && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Histórico</span>
        </button>
      </nav>

      {/* Selector: qué pago está reportando el alumno */}
      <AnimatePresence>
        {eligiendoPago && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
          >
            <div className="w-full max-w-md bg-surface rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg">
                <h3 className="font-bold text-lg">¿Qué pago quieres reportar?</h3>
                <button onClick={() => setEligiendoPago(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-5">
                {pendingPayments.length > 0 && (
                  <div>
                    <p className="label mb-2">Mis cobros pendientes</p>
                    <div className="space-y-2">
                      {pendingPayments.map(p => (
                        <button
                          key={p.id}
                          onClick={() => abrirComprobante({ tipo: 'cobro', paymentId: p.id, concepto: p.concepto, monto: p.monto || 0 })}
                          className="w-full flex justify-between items-center gap-2 p-3 rounded-xl bg-bg border border-ink-muted/10 hover:border-magenta/50 transition-colors text-left"
                        >
                          <span className="text-sm font-semibold truncate">{p.concepto}</span>
                          <span className="text-sm font-bold text-magenta whitespace-nowrap">${(p.monto || 0).toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="label mb-2">Planes y clases sueltas</p>
                  {planesDisponibles.length > 0 ? (
                    <div className="space-y-2">
                      {planesDisponibles.map(plan => (
                        <button
                          key={plan.id}
                          onClick={() => abrirComprobante({ tipo: 'plan', planId: plan.id, concepto: plan.nombre, monto: plan.monto })}
                          className="w-full flex justify-between items-center gap-2 p-3 rounded-xl bg-bg border border-ink-muted/10 hover:border-magenta/50 transition-colors text-left"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold truncate">{plan.nombre}</span>
                            <span className="block text-[11px] text-ink-muted">
                              {plan.clasesIncluidas > 0 ? `${plan.clasesIncluidas} clase(s)` : plan.modalidad}
                            </span>
                          </span>
                          <span className="text-sm font-bold text-magenta whitespace-nowrap">${plan.monto.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">Todavía no hay planes publicados. Escríbele al administrador.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {reporte && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
          >
            <div className="w-full max-w-md bg-surface rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg truncate">{reporte.concepto}</h3>
                  <p className="text-xs text-ink-muted">
                    ${reporte.monto.toLocaleString()} · queda activo al enviar el comprobante
                  </p>
                </div>
                <button onClick={cerrarComprobante} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex gap-2 mb-6 p-1 bg-ink-muted/5 rounded-lg">
                  <button onClick={() => setPaymentMethod('bold')} className={cn("flex-1 py-2 text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2", paymentMethod === 'bold' ? "bg-white shadow text-magenta" : "text-ink-muted hover:text-ink")}>
                    <CreditCard className="w-4 h-4" /> Link de Bold
                  </button>
                  <button onClick={() => setPaymentMethod('transferencia')} className={cn("flex-1 py-2 text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2", paymentMethod === 'transferencia' ? "bg-white shadow text-magenta" : "text-ink-muted hover:text-ink")}>
                    <Upload className="w-4 h-4" /> Transferencia
                  </button>
                </div>

                <div className="mb-6 min-h-[150px]">
                  {paymentMethod === 'bold' && (
                    <div className="space-y-4">
                      <p className="text-sm text-ink-muted">Haz clic en el enlace para pagar a través de Bold de forma segura. Cuando termines, toma una captura y súbela aquí.</p>
                      <a href="https://checkout.bold.co/payment/LNK_YYOIC6O6BQ" target="_blank" rel="noreferrer" className="w-full btn-secondary py-3 flex justify-center items-center gap-2 border-magenta text-magenta hover:bg-magenta hover:text-white transition-colors">
                        Ir a pagar en Bold
                      </a>
                      <div className="mt-4">
                         <ImageUpload
                           label="Captura de tu pago en Bold"
                           value={uploadFile}
                           onChange={setUploadFile}
                           placeholder="Enlace de la imagen"
                         />
                      </div>
                      
                      <button 
                        onClick={handlePaymentSubmit} 
                        disabled={enviandoComprobante || !uploadFile}
                        className="w-full btn-primary py-3 flex justify-center items-center gap-2 disabled:opacity-50 mt-4"
                      >
                        {enviandoComprobante ? 'Enviando...' : 'Enviar Comprobante'}
                      </button>
                      <button 
                        onClick={cerrarComprobante}
                        className="w-full btn-secondary py-3 text-sm mt-2"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {paymentMethod === 'transferencia' && (
                    <div className="space-y-4">
                      <p className="text-sm text-ink-muted">Sube una foto o PDF del comprobante de transferencia a Nequi / Daviplata o cuenta bancaria.</p>
                      <div className="mt-4">
                         <ImageUpload
                           label="Comprobante de Transferencia"
                           value={uploadFile}
                           onChange={setUploadFile}
                           placeholder="Enlace del comprobante"
                         />
                      </div>
                      
                      <button 
                        onClick={handlePaymentSubmit} 
                        disabled={enviandoComprobante || !uploadFile}
                        className="w-full btn-primary py-3 flex justify-center items-center gap-2 disabled:opacity-50 mt-4"
                      >
                        {enviandoComprobante ? 'Enviando...' : 'Enviar Comprobante'}
                      </button>
                      <button 
                        onClick={cerrarComprobante}
                        className="w-full btn-secondary py-3 text-sm mt-2"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
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
