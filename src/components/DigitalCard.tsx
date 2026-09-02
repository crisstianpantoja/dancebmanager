import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { User, Lock, X } from 'lucide-react';
import { Student } from '../types';
import { useStore } from '../store';
import { temaDeCarnet } from '../lib/carnet';

// Los temas viven junto al dibujo en canvas del carnet, que es quien los
// necesita como valores sueltos; aquí se re-exportan para no cambiar los
// importadores existentes.
export { THEMES } from '../lib/carnet';
export type { ThemeId } from '../lib/carnet';

interface DigitalCardProps {
  student: Student;
  onClose?: () => void;
  showClose?: boolean;
}

export function DigitalCard({ student, onClose, showClose = false }: DigitalCardProps) {
  const { data } = useStore();
  const theme = temaDeCarnet(student.cardTheme);

  const style = {
    '--theme-bg': theme.bg,
    '--theme-rgb': theme.rgb,
    '--theme-hex': theme.hex,
  } as React.CSSProperties;

  return (
    <div 
      className="relative rounded-[2rem] w-full max-w-[340px] mx-auto md:mx-0 overflow-hidden shadow-[0_0_50px_rgba(var(--theme-rgb),0.4)] border-2" 
      style={{ ...style, background: 'var(--theme-bg)', borderColor: 'rgba(var(--theme-rgb), 0.5)' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-20 mix-blend-screen" style={{ background: 'radial-gradient(circle at center, rgba(var(--theme-rgb), 0.8) 0, transparent 60%)' }}></div>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.4) 1px, transparent 0)', backgroundSize: '12px 12px' }}></div>
      <div className="absolute top-[20%] left-[-20%] right-[-20%] text-center opacity-5 select-none pointer-events-none transform -skew-y-6">
        <span className="text-[8rem] font-black italic tracking-tighter">DANCE</span>
      </div>

      {showClose && (
        <button onClick={(e) => { e.stopPropagation(); onClose?.(); }} className="absolute top-4 right-4 text-white/80 hover:text-white z-50 p-2 cursor-pointer">
          <X className="w-6 h-6" />
        </button>
      )}

      <div className="relative z-10 flex flex-col items-center pt-8 pb-10 px-6">
        {data?.settings?.showLoginLogo && (data?.settings?.digitalCardLogoUrl || data?.settings?.loginLogoUrl) ? (
           <img src={data.settings.digitalCardLogoUrl || data.settings.loginLogoUrl} alt="Logo" className="max-h-12 object-contain mb-1 drop-shadow-[0_0_15px_rgba(var(--theme-rgb),0.8)]" />
        ) : (
          <h2 className="text-4xl font-black italic tracking-tight text-white mb-1" style={{ textShadow: '0 0 15px rgba(var(--theme-rgb),0.8)' }}>
            {data?.settings?.brandName || <>Dance<span style={{ color: 'var(--theme-hex)' }}>B</span></>}
          </h2>
        )}
        <p className="text-white/80 text-[10px] uppercase tracking-[0.3em] font-medium mb-6 drop-shadow-md">
          Carnet Digital
        </p>

        <div className="flex flex-col items-center mb-2">
          {student.foto ? (
            <img src={student.foto} alt={student.nombre} className="w-24 h-24 rounded-full object-cover border-2 mb-3 shadow-[0_0_15px_rgba(var(--theme-rgb),0.5)]" style={{ borderColor: 'var(--theme-hex)' }} />
          ) : (
            <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 mb-3 shadow-[0_0_15px_rgba(var(--theme-rgb),0.5)] bg-black/20 text-white text-4xl font-bold uppercase" style={{ borderColor: 'var(--theme-hex)' }}>
              {student.nombre.charAt(0)}
            </div>
          )}
          <h3 className="text-3xl font-extrabold text-white mb-2 tracking-tight uppercase text-center drop-shadow-md">
            {student.nombre}
          </h3>
        </div>
        
        <div className="flex items-center gap-4 w-full mb-6">
          <div className="h-px flex-1 opacity-50" style={{ background: 'linear-gradient(to right, transparent, var(--theme-hex))' }}></div>
          <p className="text-white/90 uppercase tracking-[0.2em] text-xs font-semibold drop-shadow-md text-center">
            {student.nivel || 'Nivel Básico'}
          </p>
          <div className="h-px flex-1 opacity-50" style={{ background: 'linear-gradient(to left, transparent, var(--theme-hex))' }}></div>
        </div>

        <div className="relative mb-6">
          {/* Glowing Corners */}
          <div className="absolute -inset-2 border-2 border-transparent rounded-tl-xl w-1/3 h-1/3 opacity-80" style={{ borderTopColor: 'var(--theme-hex)', borderLeftColor: 'var(--theme-hex)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.6)' }}></div>
          <div className="absolute -inset-2 border-2 border-transparent rounded-tr-xl w-1/3 h-1/3 opacity-80 right-0 left-auto" style={{ borderTopColor: 'var(--theme-hex)', borderRightColor: 'var(--theme-hex)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.6)' }}></div>
          <div className="absolute -inset-2 border-2 border-transparent rounded-bl-xl w-1/3 h-1/3 opacity-80 bottom-0 top-auto" style={{ borderBottomColor: 'var(--theme-hex)', borderLeftColor: 'var(--theme-hex)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.6)' }}></div>
          <div className="absolute -inset-2 border-2 border-transparent rounded-br-xl w-1/3 h-1/3 opacity-80 bottom-0 top-auto right-0 left-auto" style={{ borderBottomColor: 'var(--theme-hex)', borderRightColor: 'var(--theme-hex)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.6)' }}></div>
          
          <div className="bg-white p-2 rounded-xl shadow-2xl relative z-10">
            <QRCodeSVG value={`STUDENT:${student.id}`} size={110} />
          </div>
        </div>

        <p className="font-bold text-[10px] tracking-widest uppercase mb-6" style={{ color: 'var(--theme-hex)', textShadow: '0 0 8px rgba(var(--theme-rgb),0.8)' }}>
          Único e Intransferible
        </p>
        
        <div className="flex gap-3 w-full">
          <div className="flex-1 border rounded-full py-2.5 flex items-center justify-center gap-2 backdrop-blur-sm" style={{ borderColor: 'rgba(var(--theme-rgb), 0.7)', backgroundColor: 'rgba(var(--theme-rgb), 0.1)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.3)' }}>
            <Lock className="w-3.5 h-3.5 text-white/90" />
            <span className="text-white/90 text-[10px] sm:text-xs font-bold uppercase tracking-wider">{student.tipo || 'Regular'}</span>
          </div>
          <div className="flex-1 border rounded-full py-2.5 flex items-center justify-center gap-2 backdrop-blur-sm" style={{ borderColor: 'rgba(var(--theme-rgb), 0.7)', backgroundColor: 'rgba(var(--theme-rgb), 0.1)', boxShadow: '0 0 15px rgba(var(--theme-rgb), 0.3)' }}>
            <User className="w-3.5 h-3.5 text-white/90" />
            <span className="text-white/90 text-[10px] sm:text-xs font-bold uppercase tracking-wider">{student.rol || 'alumno'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
