import React, { useState } from 'react';
import { useStore } from '../store';
import { Gig } from '../types';
import { generateId, formatCurrency, formatDateStr, cn } from '../lib/utils';
import { Music, Plus, FileSignature, Trash2, Check, Calendar } from 'lucide-react';
import { DeleteButton } from './DeleteButton';

export function Gigs() {
  const { data, updateData, addToast } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingGigs = data.gigs.filter(g => g.fecha >= todayStr).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const pastGigs = data.gigs.filter(g => g.fecha < todayStr).sort((a,b) => b.fecha.localeCompare(a.fecha));

  const totalGanado = data.gigs.filter(g => g.estado === 'Pagado').reduce((acc, curr) => acc + curr.pago, 0);

  const [newGig, setNewGig] = useState<Partial<Gig>>({
    tipo: 'contrato', evento: '', lugar: '', fecha: todayStr, hora: '20:00', duracion: 2, pago: 200000, estado: 'Cotizado', contacto: '', notas: '', acompanado: false, acompanante: '', pagoAcompanante: 0
  });

  const checkOverlap = (fecha: string, hora: string, duracionHoras: number) => {
    const [h, m] = hora.split(':').map(Number);
    const startMins = h * 60 + m;
    const endMins = startMins + (duracionHoras * 60);

    const isOverlap = (otherHora: string, otherDurMins: number) => {
      const [oh, om] = otherHora.split(':').map(Number);
      const oStart = oh * 60 + om;
      const oEnd = oStart + otherDurMins;
      return startMins < oEnd && endMins > oStart;
    };

    for (const s of data.sessions) {
      if (s.fecha === fecha && isOverlap(s.hora, s.duracion)) {
        return `Ya tienes una clase programada en este horario: ${s.titulo} (${s.hora})`;
      }
    }
    
    for (const g of data.gigs) {
      if (g.fecha === fecha && isOverlap(g.hora, g.duracion * 60)) {
        return `Ya tienes un contrato programado en este horario: ${g.evento} (${g.hora})`;
      }
    }

    return null;
  };

  const handleSaveGig = () => {
    if (!newGig.evento) return;

    const gigFecha = newGig.fecha || todayStr;
    const gigHora = newGig.hora || '20:00';
    const gigDuracion = newGig.duracion || 2;

    const conflict = checkOverlap(gigFecha, gigHora, gigDuracion);
    if (conflict) {
      alert(conflict);
      return;
    }

    const gig: Gig = {
      id: generateId(),
      tipo: 'contrato',
      evento: newGig.evento,
      lugar: newGig.lugar || '',
      fecha: gigFecha,
      hora: gigHora,
      duracion: gigDuracion,
      pago: newGig.pago || 0,
      estado: newGig.estado as any,
      contacto: newGig.contacto || '',
      notas: newGig.notas || '',
      acompanado: newGig.acompanado,
      acompanante: newGig.acompanante,
      pagoAcompanante: newGig.pagoAcompanante
    };

    updateData({ gigs: [...data.gigs, gig] });
    setIsAdding(false);
    setNewGig({ tipo: 'contrato', evento: '', lugar: '', fecha: todayStr, hora: '20:00', duracion: 2, pago: 200000, estado: 'Cotizado', contacto: '', notas: '', acompanado: false, acompanante: '', pagoAcompanante: 0 });
    addToast('Contrato guardado correctamente', 'success');
  };

  const advanceStatus = (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Cotizado' ? 'Confirmado' : 'Pagado';
    updateData({
      gigs: data.gigs.map(g => g.id === id ? { ...g, estado: nextStatus as any } : g)
    });
    addToast(`Estado actualizado a ${nextStatus}`, 'success');
  };

  const GigCard = ({ g }: { g: Gig }) => (
    <div className="card border-l-4 border-l-magenta">
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-3">
          <div className="p-3 rounded-xl bg-magenta/10 text-magenta">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg">{g.evento}</h3>
            <p className="text-sm text-ink-muted">{formatDateStr(g.fecha)} · {g.hora} ({g.duracion}h) · {g.lugar}</p>
          </div>
        </div>
        <div className="text-right">
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-bold uppercase",
            g.estado === 'Pagado' ? "bg-success/20 text-success" : 
            g.estado === 'Confirmado' ? "bg-pending/20 text-pending" : "bg-surface-hover text-ink-muted"
          )}>{g.estado}</span>
        </div>
      </div>
      
      <div className="bg-bg rounded-lg p-3 mt-4 border border-ink-muted/10 flex justify-between items-center">
        <div>
          <p className="text-xs text-ink-muted uppercase">Pago Acordado</p>
          <p className="text-xl font-bold text-success">{formatCurrency(g.pago)}</p>
        </div>
        {g.acompanado && (
          <div className="text-right">
            <p className="text-xs text-ink-muted">Acompañante: {g.acompanante}</p>
            <p className="text-sm font-medium">Pago Acomp.: {formatCurrency(g.pagoAcompanante || 0)}</p>
          </div>
        )}
      </div>

      {(g.contacto || g.notas) && (
        <div className="mt-4 pt-4 border-t border-ink-muted/10 text-sm">
          {g.contacto && <p><span className="font-semibold">Contacto:</span> {g.contacto}</p>}
          {g.notas && <p className="mt-1"><span className="font-semibold">Notas:</span> {g.notas}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-ink-muted/10">
        <DeleteButton onConfirm={() => updateData({ gigs: data.gigs.filter(x => x.id !== g.id) })} className="btn-secondary px-2 text-error hover:text-error" iconOnly={true} />
        {g.estado !== 'Pagado' && (
          <button onClick={() => advanceStatus(g.id, g.estado)} className="btn-primary !bg-success flex items-center gap-1 text-sm py-1">
            <Check className="w-4 h-4" /> Marcar {g.estado === 'Cotizado' ? 'Confirmado' : 'Pagado'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contratos</h1>
          <p className="text-ink-muted">Gestión de contratos y eventos</p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary flex items-center gap-2">
          {isAdding ? 'Cancelar' : <><Plus className="w-4 h-4" /> Nuevo Contrato</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card !bg-magenta/10 border-magenta/30 md:col-span-1">
          <p className="text-xs text-magenta uppercase tracking-wider mb-1">Total Ganado (Histórico)</p>
          <p className="text-3xl font-bold text-magenta">{formatCurrency(totalGanado)}</p>
        </div>
      </div>

      {isAdding && (
        <div className="card mb-8 border-magenta/30 shadow-[0_0_20px_rgba(227,61,160,0.1)]">
          <h2 className="text-xl font-bold mb-4">Registrar Nuevo Contrato</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Nombre del Evento / Festival / Contrato</label>
              <input type="text" className="input" placeholder="Evento" value={newGig.evento} onChange={e => setNewGig({...newGig, evento: e.target.value})} />
            </div>
            <div>
              <label className="label">Lugar</label>
              <input type="text" className="input" placeholder="Lugar del evento" value={newGig.lugar} onChange={e => setNewGig({...newGig, lugar: e.target.value})} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input [color-scheme:dark]" value={newGig.fecha} onChange={e => setNewGig({...newGig, fecha: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Hora de inicio</label>
                <input type="time" className="input [color-scheme:dark]" value={newGig.hora} onChange={e => setNewGig({...newGig, hora: e.target.value})} />
              </div>
              <div>
                <label className="label">Duración (h)</label>
                <input type="number" step="0.5" className="input" placeholder="Duración en horas" value={newGig.duracion} onChange={e => setNewGig({...newGig, duracion: parseFloat(e.target.value)})} />
              </div>
            </div>
            <div>
              <label className="label">Pago Acordado ($ COP)</label>
              <input type="number" className="input font-bold text-success" placeholder="Pago" value={newGig.pago} onChange={e => setNewGig({...newGig, pago: parseInt(e.target.value)})} />
            </div>
            <div>
              <label className="label">Estado Inicial</label>
              <select className="input" value={newGig.estado} onChange={e => setNewGig({...newGig, estado: e.target.value as any})}>
                <option value="Cotizado">Cotizado</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Pagado">Pagado (Ya recibido)</option>
              </select>
            </div>
            <div>
              <label className="label">Contacto (Opcional)</label>
              <input type="text" className="input" placeholder="Contacto" value={newGig.contacto} onChange={e => setNewGig({...newGig, contacto: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Notas Adicionales</label>
              <textarea className="input" placeholder="Notas" value={newGig.notas} onChange={e => setNewGig({...newGig, notas: e.target.value})} rows={2} />
            </div>
          </div>

          <div className="bg-bg p-4 rounded-lg mb-4 border border-ink-muted/10">
            <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm font-medium">
              <input type="checkbox" checked={newGig.acompanado} onChange={e => setNewGig({...newGig, acompanado: e.target.checked})} className="w-4 h-4 accent-magenta" />
              ¿El contrato incluye acompañante?
            </label>
            {newGig.acompanado && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre del Acompañante</label>
                  <input type="text" className="input" placeholder="Acompañante" value={newGig.acompanante} onChange={e => setNewGig({...newGig, acompanante: e.target.value})} />
                </div>
                <div>
                  <label className="label">Pago Acompañante ($ COP)</label>
                  <input type="number" className="input" placeholder="Pago del acompañante" value={newGig.pagoAcompanante} onChange={e => setNewGig({...newGig, pagoAcompanante: parseInt(e.target.value)})} />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={handleSaveGig}>Guardar Contrato</button>
          </div>
        </div>
      )}

      {upcomingGigs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5"/> Próximos Contratos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingGigs.map(g => <div key={g.id}><GigCard g={g} /></div>)}
          </div>
        </div>
      )}

      {pastGigs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 text-ink-muted">Historial</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75 hover:opacity-100 transition-opacity">
            {pastGigs.map(g => <div key={g.id}><GigCard g={g} /></div>)}
          </div>
        </div>
      )}
      
      {data.gigs.length === 0 && !isAdding && (
        <div className="text-center p-12 text-ink-muted">
          <FileSignature className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No hay contratos registrados.</p>
        </div>
      )}
    </div>
  );
}
