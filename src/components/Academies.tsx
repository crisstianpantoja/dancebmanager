import React, { useState } from 'react';
import { useStore } from '../store';
import { Academy, AcademyPayment } from '../types';
import { generateId, formatCurrency, cn, formatDateStr } from '../lib/utils';
import { Building2, Plus, Phone, Clock, DollarSign, Calendar, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { DeleteButton } from './DeleteButton';

export function Academies() {
  const { data, updateData } = useStore();
  const [selectedAcademyId, setSelectedAcademyId] = useState<string | null>(null);
  const selectedAcademy = data.academies.find(a => a.id === selectedAcademyId);

  const totalAcademias = data.academies.length;
  const estimatedIncome = data.academies.reduce((acc, curr) => {
    if (curr.pagoModalidad === 'Mensual fijo') return acc + curr.pagoMonto;
    return acc + (curr.pagoMonto * curr.dias.length * 4.33);
  }, 0);

  const [isAdding, setIsAdding] = useState(false);
  const [newAcademy, setNewAcademy] = useState<Partial<Academy>>({
    nombre: '', clase: '', nivel: 'Básica', lugar: '', contacto: '', dias: [], hora: '19:00', duracion: 60, pagoMonto: 50000, pagoModalidad: 'Por clase', color: '#7CC3FF', notas: ''
  });

  const [currentMonthOffset, setCurrentMonthOffset] = useState(0);
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const viewDate = new Date(today.getFullYear(), today.getMonth() + currentMonthOffset, 1);
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const toggleDay = (dayIndex: number) => {
    const current = newAcademy.dias || [];
    if (current.includes(dayIndex)) {
      setNewAcademy({...newAcademy, dias: current.filter(d => d !== dayIndex)});
    } else {
      setNewAcademy({...newAcademy, dias: [...current, dayIndex].sort()});
    }
  };

  const handleSaveAcademy = () => {
    if (!newAcademy.nombre) return;
    const academy: Academy = {
      id: generateId(),
      nombre: newAcademy.nombre,
      clase: newAcademy.clase || '',
      nivel: newAcademy.nivel || 'Básica',
      lugar: newAcademy.lugar || '',
      contacto: newAcademy.contacto || '',
      dias: newAcademy.dias || [],
      hora: newAcademy.hora || '19:00',
      duracion: newAcademy.duracion || 60,
      pagoMonto: newAcademy.pagoMonto || 0,
      pagoModalidad: newAcademy.pagoModalidad as any,
      color: newAcademy.color || '#7CC3FF',
      notas: newAcademy.notas || ''
    };
    updateData({ academies: [...data.academies, academy] });
    setIsAdding(false);
    setSelectedAcademyId(academy.id);
    setNewAcademy({ nombre: '', clase: '', nivel: 'Básica', lugar: '', contacto: '', dias: [], hora: '19:00', duracion: 60, pagoMonto: 50000, pagoModalidad: 'Por clase', color: '#7CC3FF', notas: '' });
  };

  // Generate agenda for selected academy
  let monthlyClasses: { dateStr: string, dateObj: Date, past: boolean, status?: 'dictada' | 'cancelada' }[] = [];
  let dictatedCount = 0;
  
  if (selectedAcademy) {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(viewYear, viewMonth, i);
      if (selectedAcademy.dias.includes(d.getDay())) {
        d.setHours(0,0,0,0);
        const dateStr = d.toISOString().split('T')[0];
        const status = (data.academyLogs || {})[`${selectedAcademy.id}_${dateStr}`];
        if (status === 'dictada') dictatedCount++;
        
        monthlyClasses.push({
          dateStr,
          dateObj: d,
          past: d <= today,
          status
        });
      }
    }
  }

  const handleLogClass = (dateStr: string, status: 'dictada' | 'cancelada') => {
    if (!selectedAcademy) return;
    const key = `${selectedAcademy.id}_${dateStr}`;
    const newLogs = { ...(data.academyLogs || {}) };
    if (newLogs[key] === status) {
      delete newLogs[key]; // toggle off
    } else {
      newLogs[key] = status;
    }
    updateData({ academyLogs: newLogs });
  };

  const calculatedTotal = selectedAcademy?.pagoModalidad === 'Mensual fijo' 
    ? selectedAcademy.pagoMonto 
    : (selectedAcademy?.pagoMonto || 0) * dictatedCount;

  const currentPayment = (data.academyPayments || []).find(p => p.academyId === selectedAcademyId && p.mes === monthKey);

  const [paymentForm, setPaymentForm] = useState(false);
  const [payMethod, setPayMethod] = useState('');

  const registerPayment = () => {
    if (!selectedAcademyId || !payMethod) return;
    const payment: AcademyPayment = {
      id: generateId(),
      academyId: selectedAcademyId,
      mes: monthKey,
      monto: calculatedTotal,
      estado: 'pagado',
      metodoTransferencia: payMethod,
      fechaPago: todayStr
    };
    updateData({ academyPayments: [...(data.academyPayments || []).filter(p => p.id !== currentPayment?.id), payment] });
    setPaymentForm(false);
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      <div className="w-full md:w-80 bg-surface border-r border-ink-muted/10 flex flex-col h-[40vh] md:h-full shrink-0">
        <div className="p-4 border-b border-ink-muted/10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-accent-academy" /> Academias</h2>
            <button onClick={() => setIsAdding(true)} className="p-2 bg-accent-academy/10 text-accent-academy rounded-lg hover:bg-accent-academy hover:text-white transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="bg-bg p-3 rounded-lg border border-ink-muted/10 text-center">
            <p className="text-xs text-ink-muted uppercase">Ingreso Mensual (Est)</p>
            <p className="text-lg font-bold text-success">{formatCurrency(estimatedIncome)}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {data.academies.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAcademyId(a.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between border-l-4",
                selectedAcademyId === a.id ? "bg-surface-hover" : "hover:bg-surface-hover/50 bg-transparent"
              )}
              style={{ borderLeftColor: a.color || '#7CC3FF' }}
            >
              <div>
                <h3 className="font-semibold text-sm truncate">{a.nombre}</h3>
                <p className="text-[10px] text-ink-muted uppercase">{a.clase}</p>
              </div>
            </button>
          ))}
          {data.academies.length === 0 && <p className="text-center text-ink-muted text-sm mt-8">No hay academias.</p>}
        </div>
      </div>

      <div className="flex-1 bg-bg overflow-y-auto">
        {isAdding ? (
          <div className="p-6 md:p-12 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Nueva Academia</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Nombre de Academia</label>
                <input type="text" className="input" placeholder="Nombre de la academia" value={newAcademy.nombre} onChange={e => setNewAcademy({...newAcademy, nombre: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Clase</label>
                  <input type="text" className="input" placeholder="Clase" value={newAcademy.clase} onChange={e => setNewAcademy({...newAcademy, clase: e.target.value})} />
                </div>
                <div>
                  <label className="label">Zona / Lugar</label>
                  <input type="text" className="input" placeholder="Lugar" value={newAcademy.lugar} onChange={e => setNewAcademy({...newAcademy, lugar: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="label">Nivel de la clase</label>
                <select
                  className="input"
                  value={newAcademy.nivel || 'Básica'}
                  onChange={e => setNewAcademy({...newAcademy, nivel: e.target.value as Academy['nivel']})}
                >
                  <option value="Básica">Básica</option>
                  <option value="Intermedia">Intermedia</option>
                  <option value="Avanzada">Avanzada</option>
                </select>
                <p className="hint">Etiqueta y color con los que la clase aparece en el calendario del alumno.</p>
              </div>
              
              <div>
                <label className="label">Días Fijos</label>
                <div className="flex gap-2">
                  {diasSemana.map((d, i) => (
                    <button 
                      key={i} type="button"
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "w-10 h-10 rounded-full text-sm font-medium transition-colors",
                        (newAcademy.dias || []).includes(i) ? "bg-accent-academy text-bg" : "bg-surface border border-ink-muted/20 text-ink-muted"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Hora</label>
                  <input type="time" className="input [color-scheme:dark]" value={newAcademy.hora} onChange={e => setNewAcademy({...newAcademy, hora: e.target.value})} />
                </div>
                <div>
                  <label className="label">Duración (minutos)</label>
                  <input type="number" className="input" placeholder="Duración en minutos" value={newAcademy.duracion} onChange={e => setNewAcademy({...newAcademy, duracion: parseInt(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Modalidad de Pago</label>
                  <select className="input" value={newAcademy.pagoModalidad} onChange={e => setNewAcademy({...newAcademy, pagoModalidad: e.target.value as any})}>
                    <option value="Por clase">Por clase</option>
                    <option value="Mensual fijo">Mensual fijo</option>
                  </select>
                </div>
                <div>
                  <label className="label">Monto ($ COP)</label>
                  <input type="number" className="input" placeholder="Monto" value={newAcademy.pagoMonto} onChange={e => setNewAcademy({...newAcademy, pagoMonto: parseInt(e.target.value)})} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button className="btn-secondary" onClick={() => setIsAdding(false)}>Cancelar</button>
                <button className="btn-primary !bg-accent-academy" onClick={handleSaveAcademy}>Guardar Academia</button>
              </div>
            </div>
          </div>
        ) : selectedAcademy ? (
          <div className="p-6 md:p-12 max-w-4xl mx-auto">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-4xl font-bold mb-2 tracking-tight" style={{ color: selectedAcademy.color }}>{selectedAcademy.nombre}</h1>
                <p className="text-lg text-ink-muted">{selectedAcademy.clase}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-ink-muted uppercase tracking-wide">Nivel</span>
                  <select
                    className="input py-1 text-sm w-auto"
                    value={selectedAcademy.nivel || 'Básica'}
                    onChange={e => updateData({
                      academies: data.academies.map(a =>
                        a.id === selectedAcademy.id ? { ...a, nivel: e.target.value as Academy['nivel'] } : a
                      ),
                    })}
                  >
                    <option value="Básica">Básica</option>
                    <option value="Intermedia">Intermedia</option>
                    <option value="Avanzada">Avanzada</option>
                  </select>
                </div>
              </div>
              <DeleteButton 
                onConfirm={() => {
                  
                    const newLogs = { ...(data.academyLogs || {}) };
                    Object.keys(newLogs).forEach(key => {
                      if (key.startsWith(selectedAcademy.id + '_')) delete newLogs[key];
                    });
                    updateData({ 
                      academies: data.academies.filter(a => a.id !== selectedAcademy.id),
                      academyPayments: (data.academyPayments || []).filter(p => p.academyId !== selectedAcademy.id),
                      academyLogs: newLogs
                    });
                    
                  setSelectedAcademyId(null);
                }}
                className="p-2 text-error/70 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                iconOnly={true}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="card md:col-span-2">
                <div className="flex justify-between items-center mb-6 border-b border-ink-muted/10 pb-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-accent-academy" /> 
                    Agenda Mensual
                  </h3>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentMonthOffset(o => o - 1)} className="text-ink-muted hover:text-white">&lt;</button>
                    <span className="font-medium min-w-24 text-center">
                      {new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(viewDate).toUpperCase()}
                    </span>
                    <button onClick={() => setCurrentMonthOffset(o => o + 1)} className="text-ink-muted hover:text-white">&gt;</button>
                  </div>
                </div>

                <div className="space-y-3">
                  {monthlyClasses.map(c => (
                    <div key={c.dateStr} className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      c.past ? "bg-surface/50 border-ink-muted/20" : "bg-bg border-ink-muted/10 opacity-60"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className="w-12 text-center">
                          <p className="text-xs text-ink-muted uppercase">{diasSemana[c.dateObj.getDay()]}</p>
                          <p className="font-bold text-lg leading-none">{c.dateObj.getDate()}</p>
                        </div>
                        <div className="w-px h-8 bg-ink-muted/20"></div>
                        <div>
                          <p className="font-medium text-sm">{selectedAcademy.hora}</p>
                          <p className="text-xs text-ink-muted">{selectedAcademy.lugar || 'Sede'}</p>
                        </div>
                      </div>

                      {c.past ? (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleLogClass(c.dateStr, 'dictada')}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors border",
                              c.status === 'dictada' ? "bg-success/20 text-success border-success/30" : "bg-surface text-ink-muted hover:text-ink border-transparent"
                            )}
                          >
                            <CheckCircle2 className="w-4 h-4" /> Dictada
                          </button>
                          <button 
                            onClick={() => handleLogClass(c.dateStr, 'cancelada')}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors border",
                              c.status === 'cancelada' ? "bg-error/20 text-error border-error/30" : "bg-surface text-ink-muted hover:text-ink border-transparent"
                            )}
                          >
                            <XCircle className="w-4 h-4" /> Cancelada
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted bg-surface px-3 py-1.5 rounded-md">Próximamente</span>
                      )}
                    </div>
                  ))}
                  {monthlyClasses.length === 0 && (
                    <p className="text-sm text-ink-muted text-center py-4">No hay clases programadas para este mes.</p>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="card">
                  <h3 className="font-semibold text-sm mb-4 text-ink-muted uppercase">Reporte del Mes</h3>
                  
                  <div className="space-y-3 text-sm mb-6">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Clases en el mes:</span>
                      <span className="font-bold">{monthlyClasses.length}</span>
                    </div>
                    {selectedAcademy.pagoModalidad === 'Por clase' && (
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Clases dictadas:</span>
                        <span className="font-bold text-success">{dictatedCount}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t border-ink-muted/10 flex justify-between items-center">
                      <span className="text-ink-muted uppercase text-xs">Total a Cobrar:</span>
                      <span className="font-bold text-xl text-magenta">{formatCurrency(calculatedTotal)}</span>
                    </div>
                  </div>

                  {currentPayment ? (
                    <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-center">
                      <p className="text-success text-sm font-bold mb-1 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Pagado
                      </p>
                      <p className="text-xs text-success/80">Transferido a: {currentPayment.metodoTransferencia}</p>
                      <p className="text-xs text-success/80 mt-1">El {formatDateStr(currentPayment.fechaPago!)}</p>
                      <DeleteButton 
                      onConfirm={() => updateData({ academyPayments: (data.academyPayments || []).filter(p => p.id !== currentPayment.id) })}
                      className="mt-2 text-xs text-error hover:underline"
                      text="Eliminar pago"
                    />
                    </div>
                  ) : (
                    <div>
                      {paymentForm ? (
                        <div className="space-y-3 bg-surface/50 p-3 rounded-lg border border-ink-muted/10">
                          <label className="text-xs text-ink-muted">Método de transferencia</label>
                          <input type="text" className="input text-sm py-1.5" placeholder="Método de pago" value={payMethod} onChange={e => setPayMethod(e.target.value)} />
                          <div className="flex gap-2">
                            <button className="flex-1 btn-secondary text-xs py-1.5" onClick={() => setPaymentForm(false)}>Cancelar</button>
                            <button className="flex-1 bg-success text-bg rounded-md text-xs font-bold py-1.5" onClick={registerPayment}>Registrar Pago</button>
                          </div>
                        </div>
                      ) : (
                        <button className="w-full btn-primary !bg-success flex justify-center items-center gap-2" onClick={() => setPaymentForm(true)}>
                          <DollarSign className="w-4 h-4" /> Registrar Pago Mensual
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3 className="font-semibold text-sm mb-4 text-ink-muted uppercase">Condiciones</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-ink-muted uppercase">Modalidad</p>
                      <p className="font-medium">{selectedAcademy.pagoModalidad}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-muted uppercase">Tarifa</p>
                      <p className="font-bold text-success">{formatCurrency(selectedAcademy.pagoMonto)}</p>
                    </div>
                    {selectedAcademy.contacto && (
                      <div className="pt-2 border-t border-ink-muted/10">
                        <p className="text-xs text-ink-muted uppercase mb-1">Contacto</p>
                        <p className="flex items-center justify-between">
                          <span>{selectedAcademy.contacto}</span>
                          <a href={`tel:${selectedAcademy.contacto.replace(/\D/g,'')}`} className="text-accent-academy"><Phone className="w-4 h-4" /></a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-ink-muted p-6 text-center">
            <Building2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg mb-2">Selecciona una academia para ver los detalles</p>
            <button onClick={() => setIsAdding(true)} className="btn-primary !bg-accent-academy mt-4 flex items-center gap-2 text-bg">
              <Plus className="w-4 h-4" /> Nueva Academia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
