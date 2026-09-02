import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Users, UserCircle, Building2, Calendar, CreditCard, Music, Menu, LogOut, Ticket, Settings, Shield, Tag, QrCode, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { DeleteButton } from './DeleteButton';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export function Sidebar({ currentTab, setCurrentTab }: SidebarProps) {
  const { data, updateData, logout } = useStore();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'alumnos', label: 'Alumnos', icon: Users },
    { id: 'usuarios', label: 'Usuarios', icon: Shield },
    { id: 'profesores', label: 'Profesores', icon: UserCircle },
    { id: 'eventos', label: 'Eventos y Clases', icon: Ticket },
    { id: 'planes', label: 'Planes y Membresías', icon: Tag },
    { id: 'asistencia', label: 'Asistencia', icon: QrCode },
    { id: 'contratos', label: 'Contratos', icon: Music },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'pagos', label: 'Finanzas', icon: CreditCard },
    { id: 'ajustes', label: 'Ajustes', icon: Settings },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-ink-muted/10 flex-col h-full shrink-0">
        <div className="p-6 flex justify-between items-start">
          <div>
            {data.settings?.showLoginLogo && (data.settings?.sidebarLogoUrl || data.settings?.loginLogoUrl) ? (
              <img src={data.settings.sidebarLogoUrl || data.settings.loginLogoUrl} alt="Logo" className="max-h-12 object-contain" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-tighter text-ink">
                    {data.settings?.brandName || <>D<span className="text-magenta">Ʌ</span>ИCEB</>}
                  </h1>
                  <div className="flex items-end gap-[2px] h-4">
                    <div className="w-1 bg-magenta h-full animate-[bounce_1s_infinite]" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 bg-magenta h-2/3 animate-[bounce_1s_infinite]" style={{ animationDelay: '0.3s' }}></div>
                    <div className="w-1 bg-magenta h-1/2 animate-[bounce_1s_infinite]" style={{ animationDelay: '0.5s' }}></div>
                    <div className="w-1 bg-magenta h-3/4 animate-[bounce_1s_infinite]" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
                <p className="text-xs text-ink-muted mt-1 font-medium tracking-widest uppercase">Style</p>
              </>
            )}
          </div>
          <button onClick={logout} className="p-2 text-ink-muted hover:text-ink transition-colors" title="Cerrar sesión">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm",
                currentTab === item.id 
                  ? "bg-magenta text-white shadow-md shadow-magenta/20 scale-[1.02]" 
                  : "text-ink-muted hover:text-ink hover:bg-surface-hover hover:scale-[1.01]"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-ink-muted/10 space-y-2">
          <button
            onClick={() => {
              if(window.confirm('¿Borrar todos los datos? Se conservará tu cuenta de administrador.')) {
                updateData({
                  teachers: [],
                  students: data.students.filter(s => s.rol === 'administrador'),
                  sessions: [],
                  payments: [],
                  academies: [],
                  gigs: [],
                  events: [],
                  expenses: [],
                  academyPayments: [],
                  notifications: []
                });
              }
            }}
            className="w-full text-xs text-error/70 hover:text-error py-2"
          >
            Borrar Todo
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-surface/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 z-50 flex justify-between items-center p-2 rounded-2xl">
        {navItems.slice(0, 3).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setCurrentTab(item.id);
              setShowMobileMenu(false);
            }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-14 rounded-xl transition-all",
              currentTab === item.id && !showMobileMenu ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5"
            )}
          >
            <item.icon className={cn("w-5 h-5 mb-1", currentTab === item.id && !showMobileMenu && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-14 rounded-xl transition-all",
            showMobileMenu ? "bg-magenta/10 text-magenta" : "text-ink-muted hover:bg-white/5"
          )}
        >
          <Menu className={cn("w-5 h-5 mb-1", showMobileMenu && "drop-shadow-[0_0_8px_rgba(227,61,160,0.5)]")} />
          <span className="text-[10px] font-medium">Más</span>
        </button>
      </nav>

      {/* Mobile Full Menu Overlay */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed inset-0 z-40 bg-surface/95 backdrop-blur-md pb-28 pt-8 px-6 overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">Menú Principal</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setShowMobileMenu(false);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all",
                    currentTab === item.id ? "border-magenta bg-magenta/5 text-magenta shadow-sm" : "border-ink-muted/10 bg-bg text-ink-muted hover:bg-surface-hover"
                  )}
                >
                  <item.icon className="w-6 h-6 mb-2" />
                  <span className="text-sm font-medium text-center">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-3">
              <button onClick={logout} className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-ink-muted/10 bg-bg text-ink-muted font-medium hover:text-error hover:border-error/30 transition-colors">
                <LogOut className="w-5 h-5" /> Cerrar sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
