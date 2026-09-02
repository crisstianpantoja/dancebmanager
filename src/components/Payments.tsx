import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { Payment, Expense } from '../types';
import { formatCurrency, formatDateStr, generateId, cn } from '../lib/utils';
import {
  cobroDesdePlan,
  cupoRestante,
  esperaVerificacion,
  estaVigente,
  fueRechazado,
  pagosPorVerificar,
  usaCupo,
} from '../lib/planes';
import { CreditCard, Plus, CheckCircle2, Trash2, ArrowUpRight, ArrowDownRight, Image as ImageIcon, Clock } from 'lucide-react';
import { DeleteButton } from './DeleteButton';
import { ReceiptViewer } from './ReceiptViewer';
import { apiRevisarPago } from '../lib/api';

/**
 * Finanzas: ingresos y gastos.
 *
 * El catálogo de planes vive en su propia sección (components/Plans.tsx): aquí
 * sólo se usa como atajo para llenar un cobro.
 */

export function Payments() {
  const { data, updateData, addToast, refresh } = useStore();
  
  const [view, setView] = useState<'ingresos' | 'gastos'>('ingresos');
  
  // Ingresos
  const [isAdding, setIsAdding] = useState(false);
  const [newPayment, setNewPayment] = useState<Partial<Payment>>({
    alumnoId: '', modalidad: 'Mensualidad', concepto: '', monto: 0, 
    fecha: new Date().toISOString().split('T')[0], estado: 'pagado', clasesIncluidas: 0, clasesUsadas: 0, notas: ''
  });
  
  const handleSavePayment = () => {
    if (!newPayment.alumnoId || !newPayment.monto || !newPayment.concepto) return;
    const p: Payment = {
      id: generateId(),
      ...newPayment
    } as Payment;
    updateData({ payments: [p, ...data.payments] });
    setIsAdding(false);
    setNewPayment({
      alumnoId: '', modalidad: 'Mensualidad', concepto: '', monto: 0, 
      fecha: new Date().toISOString().split('T')[0], estado: 'pagado', clasesIncluidas: 0, clasesUsadas: 0, notas: ''
    });
  };

  // Gastos
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    concepto: '', monto: 0, categoria: 'Alquiler', fecha: new Date().toISOString().split('T')[0], notas: ''
  });

  const handleSaveExpense = () => {
    if (!newExpense.concepto || !newExpense.monto) return;
    const e: Expense = {
      id: generateId(),
      ...newExpense
    } as Expense;
    updateData({ expenses: [e, ...data.expenses] });
    setIsAddingExpense(false);
    setNewExpense({
      concepto: '', monto: 0, categoria: 'Alquiler', fecha: new Date().toISOString().split('T')[0], notas: ''
    });
  };

  const filteredPayments = data.payments.sort((a, b) => b.fecha.localeCompare(a.fecha));

  /**
   * Bandeja de comprobantes: lo que subieron los alumnos y nadie ha revisado.
   * El plan ya está activo, así que revisar sólo confirma o revierte el cobro.
   */
  const porVerificar = pagosPorVerificar(data.payments);
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; nombre: string } | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);

  const revisarComprobante = async (paymentId: string, decision: 'aprobar' | 'rechazar') => {
    if (revisando) return;
    setRevisando(paymentId);
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
      setRevisando(null);
    }
  };
  const filteredExpenses = data.expenses.sort((a, b) => b.fecha.localeCompare(a.fecha));

  /**
   * Al elegir un plan se copian también el tipo de mensualidad y la vigencia,
   * que son los datos con los que después se descuenta la asistencia.
   */
  const applyPlanToPayment = (planId: string) => {
    const plan = data.plans.find(p => p.id === planId);
    if (!plan) return;
    const cobro = cobroDesdePlan(plan, newPayment.alumnoId || '', {
      id: 'preview',
      fecha: newPayment.fecha,
      estado: newPayment.estado,
      notas: newPayment.notas,
    });
    const { id: _id, ...campos } = cobro;
    setNewPayment({ ...newPayment, ...campos });
  };

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Finanzas</h1>
          <div className="flex gap-2 bg-surface p-1 rounded-lg inline-flex">
            <button 
              onClick={() => setView('ingresos')}
              className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2", view === 'ingresos' ? "bg-success text-bg" : "text-ink-muted hover:text-ink")}
            >
              <ArrowUpRight className="w-4 h-4" /> Ingresos
            </button>
            <button 
              onClick={() => setView('gastos')}
              className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2", view === 'gastos' ? "bg-error text-white" : "text-ink-muted hover:text-ink")}
            >
              <ArrowDownRight className="w-4 h-4" /> Gastos
            </button>
          </div>
        </div>
      </div>

      {view === 'ingresos' && (
        <>
          {/* Comprobantes por verificar */}
          {porVerificar.length > 0 && (
            <div className="card mb-8 border-l-4 border-l-pending">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-5 h-5 text-pending" />
                <h2 className="text-xl font-bold">Comprobantes por verificar</h2>
                <span className="bg-pending/20 text-pending text-xs font-bold px-2 py-0.5 rounded-full">
                  {porVerificar.length}
                </span>
              </div>
              <p className="text-sm text-ink-muted mb-4">
                Los alumnos ya tienen el plan activo. Aprueba para confirmar el pago, o rechaza
                para devolver el cobro a pendiente y desactivarlo.
              </p>
              <div className="space-y-3">
                {porVerificar.map(p => {
                  const alumno = data.students.find(s => s.id === p.alumnoId);
                  return (
                    <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-surface-hover/50 rounded-xl border border-pending/20">
                      <div className="min-w-0">
                        <p className="font-bold">{alumno?.nombre || 'Alumno desconocido'}</p>
                        <p className="text-xs text-ink-muted">
                          {p.concepto} · {formatDateStr(p.comprobanteFecha?.slice(0, 10) || p.fecha)}
                          {p.metodoPago && ` · ${p.metodoPago}`}
                        </p>
                        <button
                          onClick={() => setViewingReceipt({ url: p.comprobanteUrl || '', nombre: alumno?.nombre || 'alumno' })}
                          className="text-xs text-magenta font-semibold mt-1 flex items-center gap-1 hover:underline"
                        >
                          <ImageIcon className="w-3 h-3" /> Ver comprobante
                        </button>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold mr-2">{formatCurrency(p.monto)}</span>
                        <button
                          onClick={() => revisarComprobante(p.id, 'aprobar')}
                          disabled={revisando === p.id}
                          className="text-xs bg-success/20 text-success px-3 py-1.5 rounded-lg font-semibold hover:bg-success hover:text-bg transition-colors disabled:opacity-50"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => revisarComprobante(p.id, 'rechazar')}
                          disabled={revisando === p.id}
                          className="text-xs text-error px-3 py-1.5 rounded-lg font-semibold hover:bg-error/10 transition-colors disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end mb-6">
            <button onClick={() => setIsAdding(!isAdding)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nuevo Ingreso
            </button>
          </div>

          {isAdding && (
            <div className="card mb-8 border-l-4 border-l-success">
              <h2 className="text-xl font-bold mb-4">Registrar Pago de Alumno</h2>
              
              <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                {data.plans.map(p => (
                  <button 
                    key={p.id} onClick={() => applyPlanToPayment(p.id)}
                    className="whitespace-nowrap px-3 py-1.5 bg-surface rounded-full text-xs hover:bg-surface-hover border border-ink-muted/10 transition-colors"
                  >
                    {p.nombre} ({formatCurrency(p.monto)})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Alumno</label>
                  <select className="input" value={newPayment.alumnoId} onChange={e => setNewPayment({...newPayment, alumnoId: e.target.value})}>
                    <option value="">Seleccionar alumno...</option>
                    {data.students.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Concepto</label>
                  <input type="text" className="input" placeholder="Concepto" value={newPayment.concepto} onChange={e => setNewPayment({...newPayment, concepto: e.target.value})} />
                </div>
                
                <div>
                  <label className="label">Modalidad</label>
                  <select className="input" value={newPayment.modalidad} onChange={e => setNewPayment({...newPayment, modalidad: e.target.value as any})}>
                    <option value="Mensualidad">Mensualidad</option>
                    <option value="Paquete de clases">Paquete de clases</option>
                    <option value="Clase suelta">Clase suelta</option>
                    <option value="Matrícula">Matrícula</option>
                  </select>
                </div>
                {newPayment.modalidad === 'Paquete de clases' && (
                  <div>
                    <label className="label">Clases Incluidas</label>
                    <input type="number" className="input" placeholder="Clases incluidas" value={newPayment.clasesIncluidas} onChange={e => setNewPayment({...newPayment, clasesIncluidas: parseInt(e.target.value)})} />
                  </div>
                )}
                
                <div>
                  <label className="label">Monto ($ COP)</label>
                  <input type="number" className="input text-success font-bold" placeholder="Monto" value={newPayment.monto} onChange={e => setNewPayment({...newPayment, monto: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={newPayment.estado} onChange={e => setNewPayment({...newPayment, estado: e.target.value as any})}>
                    <option value="pagado">Pagado</option>
                    <option value="pendiente">Pendiente por cobrar</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-2 gap-3">
                <button className="btn-secondary" onClick={() => setIsAdding(false)}>Cancelar</button>
                <button className="btn-primary !bg-success" onClick={handleSavePayment}>Guardar Ingreso</button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {filteredPayments.map(p => {
              const student = data.students.find(s => s.id === p.alumnoId);
              return (
                <div key={p.id} className="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-2 border-l-success/50">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg">{student?.nombre || 'Alumno desconocido'}</h3>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded uppercase font-bold",
                        p.estado === 'pagado' ? "bg-success/20 text-success" : "bg-pending/20 text-pending"
                      )}>
                        {p.estado}
                      </span>
                      {/* Estado de la revisión, sólo en los cobros que reportó el alumno. */}
                      {esperaVerificacion(p) && (
                        <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-pending/20 text-pending">
                          Por verificar
                        </span>
                      )}
                      {p.verificacion === 'aprobado' && (
                        <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-success/20 text-success">
                          Verificado
                        </span>
                      )}
                      {fueRechazado(p) && (
                        <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-error/20 text-error">
                          Rechazado
                        </span>
                      )}
                      {p.origen === 'alumno' && (
                        <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-magenta/15 text-magenta">
                          Reportado por el alumno
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted">{p.concepto} · {formatDateStr(p.fecha)}</p>
                    
                    {/* El consumo se muestra, no se edita: las clases se descuentan
                        al registrar la asistencia, en su propia sección. */}
                    {usaCupo(p) && p.clasesIncluidas > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="w-32 h-2 bg-surface-hover rounded-full overflow-hidden">
                          <div className="h-full bg-success" style={{ width: `${Math.min(100, (p.clasesUsadas / p.clasesIncluidas) * 100)}%`}}></div>
                        </div>
                        <span className="text-xs text-ink-muted">
                          {p.clasesUsadas} / {p.clasesIncluidas} clases usadas
                        </span>
                      </div>
                    )}
                    {p.tipoMensualidad === 'ilimitada' && (
                      <p className="mt-3 text-xs text-success">Clases ilimitadas</p>
                    )}
                    {p.fechaVencimiento && (
                      <p className={cn(
                        "mt-1 text-xs",
                        estaVigente(p) ? "text-ink-muted" : "text-error"
                      )}>
                        {estaVigente(p)
                          ? `Vigente hasta el ${formatDateStr(p.fechaVencimiento)}`
                          : `Venció el ${formatDateStr(p.fechaVencimiento)}`}
                        {usaCupo(p) && estaVigente(p) && ` · ${cupoRestante(p)} disponibles`}
                      </p>
                    )}
                  </div>
                  
                  <div className="text-right flex items-center md:block w-full md:w-auto justify-between">
                    <span className={cn("text-xl font-bold", p.estado === 'pagado' ? "text-success" : "text-pending")}>
                      + {formatCurrency(p.monto)}
                    </span>
                    {/* Cobrar a mano cierra también la revisión: el dinero ya se confirmó aquí. */}
                    {p.estado === 'pendiente' && (
                      <button onClick={() => updateData({ payments: data.payments.map(x => x.id === p.id ? {...x, estado: 'pagado' as const, verificacion: undefined} : x) })} className="md:mt-2 text-xs bg-success/20 text-success px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-success hover:text-bg transition-colors">
                        <CheckCircle2 className="w-4 h-4" /> Marcar Pagado
                      </button>
                    )}
                    <DeleteButton onConfirm={() => updateData({ payments: data.payments.filter(x => x.id !== p.id) })} className="md:mt-2 text-xs text-error hover:underline px-3 py-1.5 rounded-lg flex items-center gap-1" />
                  </div>
                </div>
              )
            })}
            
            {filteredPayments.length === 0 && (
              <div className="text-center p-12 text-ink-muted">
                <ArrowUpRight className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No hay ingresos registrados.</p>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'gastos' && (
        <>
          <div className="flex justify-end mb-6">
            <button onClick={() => setIsAddingExpense(!isAddingExpense)} className="btn-primary !bg-error flex items-center gap-2 text-white">
              <Plus className="w-4 h-4" /> Nuevo Gasto
            </button>
          </div>

          {isAddingExpense && (
            <div className="card mb-8 border-l-4 border-l-error">
              <h2 className="text-xl font-bold mb-4">Registrar Gasto</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Concepto / Motivo</label>
                  <input type="text" className="input" value={newExpense.concepto} onChange={e => setNewExpense({...newExpense, concepto: e.target.value})} placeholder="Concepto" />
                </div>
                <div>
                  <label className="label">Categoría</label>
                  <select className="input" value={newExpense.categoria} onChange={e => setNewExpense({...newExpense, categoria: e.target.value})}>
                    <option value="Alquiler">Alquiler de espacios</option>
                    <option value="Marketing">Marketing y Publicidad</option>
                    <option value="Servicios">Servicios (Agua, Luz, Internet)</option>
                    <option value="Equipamiento">Equipamiento</option>
                    <option value="Nómina">Pago a Profesores/Staff</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
                <div>
                  <label className="label">Monto ($ COP)</label>
                  <input type="number" className="input text-error font-bold" placeholder="Monto" value={newExpense.monto} onChange={e => setNewExpense({...newExpense, monto: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="label">Fecha</label>
                  <input type="date" className="input [color-scheme:dark]" value={newExpense.fecha} onChange={e => setNewExpense({...newExpense, fecha: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end pt-2 gap-3">
                <button className="btn-secondary" onClick={() => setIsAddingExpense(false)}>Cancelar</button>
                <button className="btn-primary !bg-error text-white" onClick={handleSaveExpense}>Guardar Gasto</button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {filteredExpenses.map(e => (
              <div key={e.id} className="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-2 border-l-error/50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">{e.concepto}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold bg-surface-hover text-ink-muted">
                      {e.categoria}
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">{formatDateStr(e.fecha)}</p>
                </div>
                
                <div className="text-right flex items-center md:block w-full md:w-auto justify-between">
                  <span className="text-xl font-bold text-error">
                    - {formatCurrency(e.monto)}
                  </span>
                  <DeleteButton 
                    onConfirm={() => updateData({ expenses: data.expenses.filter(x => x.id !== e.id) })}
                    className="md:mt-2 text-xs text-error/70 hover:text-error hover:bg-error/10 px-2 py-1 rounded-lg transition-colors"
                  />
                </div>
              </div>
            ))}
            
            {filteredExpenses.length === 0 && (
              <div className="text-center p-12 text-ink-muted">
                <ArrowDownRight className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No hay gastos registrados.</p>
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {viewingReceipt && (
          <ReceiptViewer
            url={viewingReceipt.url}
            nombre={viewingReceipt.nombre}
            onClose={() => setViewingReceipt(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}