import React, { useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Students } from './components/Students';
import { Teachers } from './components/Teachers';
import { Academies } from './components/Academies';
import { Gigs } from './components/Gigs';
import { Agenda } from './components/Agenda';
import { Payments } from './components/Payments';
import { Plans } from './components/Plans';
import { Attendance } from './components/Attendance';
import { Settings } from './components/Settings';
import { UsersManager } from './components/UsersManager';
import { EventsManager } from './components/EventsManager';
import { Login } from './components/Login';
import { ForcePasswordChange } from './components/ForcePasswordChange';
import { StudentPortal } from './components/StudentPortal';
import { TeacherPortal } from "./components/TeacherPortal";
import { AnimatePresence, motion } from 'motion/react';
import { ToastContainer } from './components/ToastContainer';

function AppContent() {
  const { loading, currentUser, mustChangePassword, data } = useStore();
  const [currentTab, setCurrentTab] = useState('inicio');

  React.useEffect(() => {
    if (data?.settings) {
       const root = document.documentElement;
       if (data.settings.primaryColor) root.style.setProperty('--color-magenta', data.settings.primaryColor);
       if (data.settings.bgColor) root.style.setProperty('--color-bg', data.settings.bgColor);
       if (data.settings.surfaceColor) root.style.setProperty('--color-surface', data.settings.surfaceColor);
       if (data.settings.textColor) root.style.setProperty('--color-ink', data.settings.textColor);
       
       if (data.settings.brandName) {
           document.title = data.settings.brandName;
       }
    }
  }, [data?.settings]);

  if (loading) {
    return (
      <div className="flex h-screen bg-bg items-center justify-center">
        <div className="w-12 h-12 border-4 border-magenta border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <Login />
        <ToastContainer />
      </>
    );
  }

  // Una contraseña temporal sólo sirve para definir la definitiva: hasta
  // entonces no se entra a ningún portal.
  if (mustChangePassword) {
    return (
      <>
        <ForcePasswordChange />
        <ToastContainer />
      </>
    );
  }

  if (currentUser.rol === 'profesor') {
    return (
      <>
        <TeacherPortal />
        <ToastContainer />
      </>
    );
  }
  if (currentUser.rol === 'alumno') {
    return (
      <>
        <StudentPortal />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-bg font-sans text-ink">
      <ToastContainer />
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      
      <main className="flex-1 overflow-hidden relative pb-24 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full overflow-y-auto"
          >
            {currentTab === 'inicio' && <Dashboard onNavigate={setCurrentTab} />}
            {currentTab === 'alumnos' && <Students />}
            {currentTab === 'usuarios' && <UsersManager />}
            {currentTab === 'profesores' && <Teachers />}
            {currentTab === 'eventos' && <EventsManager />}
            {currentTab === 'planes' && <Plans />}
            {currentTab === 'asistencia' && <Attendance />}
            {currentTab === 'contratos' && <Gigs />}
            {currentTab === 'agenda' && <Agenda />}
            {currentTab === 'pagos' && <Payments />}
            {currentTab === 'ajustes' && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
