import React from 'react';
import { useStore } from '../store';
import { AnimatePresence, motion } from 'motion/react';
import { X, CheckCircle2, AlertTriangle, Info, Bell } from 'lucide-react';
import { cn } from '../lib/utils';

import { useEffect, useRef } from 'react';

export function ToastContainer() {
  const { toasts, removeToast, data, currentUser, addToast } = useStore();
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    
    const myNotifications = data.notifications?.filter(n => n.userId === currentUser.id && !n.read) || [];
    
    myNotifications.forEach(n => {
      if (!notifiedIds.current.has(n.id)) {
        notifiedIds.current.add(n.id);
        addToast(n.title + ': ' + n.message, n.type === 'warning' ? 'warning' : 'info');
      }
    });
  }, [data.notifications, currentUser, addToast]);


  const getIcon = (type: string) => {
    switch(type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'error': return <AlertTriangle className="w-5 h-5 text-error" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-warning" />;
      default: return <Info className="w-5 h-5 text-magenta" />;
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-80">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={cn(
              "p-4 rounded-xl shadow-lg border backdrop-blur-md pointer-events-auto flex items-start gap-3",
              t.type === 'error' ? 'bg-error/10 border-error/20 text-error' :
              t.type === 'success' ? 'bg-success/10 border-success/20 text-success' :
              t.type === 'warning' ? 'bg-warning/10 border-warning/20 text-warning' :
              'bg-surface/90 border-ink-muted/20 text-ink'
            )}
          >
            <div className="shrink-0 mt-0.5">{getIcon(t.type)}</div>
            <div className="flex-1 text-sm font-medium pr-4">{t.message}</div>
            <button onClick={() => removeToast(t.id)} className="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
