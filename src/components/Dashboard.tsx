import React from 'react';
import { useStore } from '../store';
import { formatCurrency, parseLocalDate, formatDateStr } from '../lib/utils';
import { Users, AlertTriangle, Calendar as CalendarIcon, Music, ArrowDownRight, ArrowUpRight, Clock, ChevronRight } from 'lucide-react';
import { pagosPorVerificar } from '../lib/planes';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function Dashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { data } = useStore();

  /** Comprobantes que subieron los alumnos y esperan revisión en Finanzas. */
  const porVerificar = pagosPorVerificar(data.payments);

  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  const todayDay = today.getDay();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Stats
  const activeStudents = data.students.length;
  
  const totalIncome = data.payments
    .filter(p => {
      const d = parseLocalDate(p.fecha);
      return p.estado === 'pagado' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, curr) => acc + curr.monto, 0) + 
    data.gigs
    .filter(g => {
      const d = parseLocalDate(g.fecha);
      return g.estado === 'Pagado' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, curr) => acc + curr.pago, 0) +
    data.academyPayments
    .filter(p => p.mes === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)
    .reduce((acc, curr) => acc + curr.monto, 0);

  const totalExpenses = data.expenses
    .filter(e => {
      const d = parseLocalDate(e.fecha);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, curr) => acc + curr.monto, 0);


  const clasesDictadasMes = data.sessions.filter(s => {
    const d = parseLocalDate(s.fecha);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const pagosProcesadosMes = data.payments.filter(p => {
    const d = parseLocalDate(p.fecha);
    return p.estado === 'pagado' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const operativityData = [
    { name: 'Alumnos', cantidad: activeStudents },
    { name: 'Clases (Mes)', cantidad: clasesDictadasMes },
    { name: 'Pagos (Mes)', cantidad: pagosProcesadosMes },
  ];
  const estimatedAcademias = data.academies.reduce((acc, curr) => {
    if (curr.pagoModalidad === 'Mensual fijo') return acc + curr.pagoMonto;
    return acc + (curr.pagoMonto * curr.dias.length * 4.33); // approx weeks
  }, 0);

  // Alerts
  const lowPackages = data.payments.filter(p => p.modalidad === 'Paquete de clases' && (p.clasesIncluidas - p.clasesUsadas) <= 1);
  const pendingPayments = data.payments.filter(p => p.estado === 'pendiente');

  // Today's classes
  const todaysSessions = data.sessions.filter(s => s.fecha === todayStr);
  const todaysAcademias = data.academies.filter(a => a.dias.includes(todayDay));

  // Upcoming Gigs
  const upcomingGigs = data.gigs.filter(g => (g.estado === 'Cotizado' || g.estado === 'Confirmado') && g.fecha >= todayStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Chart Data (Last 6 months)
  const chartData: { name: string; Ingresos: number; Gastos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    
    const p = data.payments.filter(pay => {
      const pd = parseLocalDate(pay.fecha);
      return pay.estado === 'pagado' && pd.getMonth() === m && pd.getFullYear() === y;
    }).reduce((acc, curr) => acc + curr.monto, 0);

    const ap = data.academyPayments.filter(pay => {
      return pay.mes === `${y}-${String(m + 1).padStart(2, '0')}`;
    }).reduce((acc, curr) => acc + curr.monto, 0);

    const g = data.gigs.filter(gig => {
      const gd = parseLocalDate(gig.fecha);
      return gig.estado === 'Pagado' && gd.getMonth() === m && gd.getFullYear() === y;
    }).reduce((acc, curr) => acc + curr.pago, 0);

    const exp = data.expenses.filter(e => {
      const ed = parseLocalDate(e.fecha);
      return ed.getMonth() === m && ed.getFullYear() === y;
    }).reduce((acc, curr) => acc + curr.monto, 0);

    chartData.push({
      name: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(d).toUpperCase(),
      Ingresos: p + g + ap,
      Gastos: exp
    });
  }

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <h1 className="text-3xl font-bold mb-6 tracking-tight">Inicio</h1>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card border-l-4 border-l-success relative overflow-hidden">
          <ArrowUpRight className="absolute top-2 right-2 w-16 h-16 opacity-5 text-success" />
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Ingresos (Mes)</p>
          <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
        </div>
        
        <div className="card border-l-4 border-l-error relative overflow-hidden">
          <ArrowDownRight className="absolute top-2 right-2 w-16 h-16 opacity-5 text-error" />
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Gastos (Mes)</p>
          <p className="text-2xl font-bold text-error">{formatCurrency(totalExpenses)}</p>
        </div>
        
        <div className="card">
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Ganancia Neta (Mes)</p>
          <p className={`text-2xl font-bold ${(totalIncome - totalExpenses) >= 0 ? 'text-success' : 'text-error'}`}>
            {formatCurrency(totalIncome - totalExpenses)}
          </p>
        </div>

        <div className="card">
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">Alumnos Activos</p>
          <p className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-academy" /> {activeStudents}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Comprobantes por revisar: el detalle y las acciones están en Finanzas. */}
          {porVerificar.length > 0 && (
            <button
              onClick={() => onNavigate?.('pagos')}
              className="w-full text-left bg-pending/10 border border-pending/30 rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-pending/15 transition-colors"
            >
              <div>
                <h2 className="text-pending font-bold flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5" />
                  {porVerificar.length} comprobante{porVerificar.length === 1 ? '' : 's'} por verificar
                </h2>
                <p className="text-sm text-ink-muted">
                  Los alumnos reportaron su pago y el plan ya quedó activo. Revísalos en Finanzas.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-pending shrink-0" />
            </button>
          )}

          {/* Alerts */}
          {(lowPackages.length > 0 || pendingPayments.length > 0) && (
            <div className="bg-error/10 border border-error/20 rounded-xl p-4">
              <h2 className="text-error font-bold flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5" /> Atención Requerida
              </h2>
              <ul className="space-y-2">
                {lowPackages.map(p => {
                  const student = data.students.find(s => s.id === p.alumnoId);
                  return (
                    <li key={p.id} className="text-sm flex justify-between">
                      <span>Paquete de <strong>{student?.nombre}</strong></span>
                      <span className="text-error">{(p.clasesIncluidas - p.clasesUsadas)} clases rest.</span>
                    </li>
                  )
                })}
                {pendingPayments.map(p => {
                  const student = data.students.find(s => s.id === p.alumnoId);
                  return (
                    <li key={p.id} className="text-sm flex justify-between">
                      <span>Cobro a <strong>{student?.nombre}</strong></span>
                      <span className="text-pending">{formatCurrency(p.monto)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Resumen Operativo */}
          <div className="card">
            <h2 className="font-semibold mb-6">Resumen Operativo</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operativityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c35" vertical={false} />
                  <XAxis dataKey="name" stroke="#928DA6" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(244,242,247,0.05)'}}
                    contentStyle={{backgroundColor: '#17171F', borderColor: '#1F1F2B', color: '#F4F2F7', borderRadius: '8px'}}
                  />
                  <Bar dataKey="cantidad" fill="#E33DA0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Chart */}
          <div className="card">
            <h2 className="font-semibold mb-6">Finanzas Últimos 6 Meses</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c35" vertical={false} />
                  <XAxis dataKey="name" stroke="#928DA6" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(244,242,247,0.05)'}}
                    contentStyle={{backgroundColor: '#17171F', borderColor: '#1F1F2B', color: '#F4F2F7', borderRadius: '8px'}}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="Ingresos" fill="#18c964" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill="#f31260" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Today's Classes */}
          <div className="card">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-magenta" /> Clases de Hoy
            </h2>
            {todaysSessions.length === 0 ? (
              <p className="text-ink-muted text-sm">No hay clases agendadas para hoy.</p>
            ) : (
              <div className="space-y-3">
                {todaysSessions.map(s => (
                  <div key={s.id} className="flex justify-between items-center bg-bg p-3 rounded-lg border border-ink-muted/10">
                    <div>
                      <h3 className="font-medium">{s.titulo}</h3>
                      <p className="text-xs text-ink-muted">{s.hora} · {s.lugar}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          
          {/* Today's Academies */}
          <div className="card">
            <h2 className="font-semibold mb-4">Hoy dictas en...</h2>
            {todaysAcademias.length === 0 ? (
              <p className="text-ink-muted text-sm">Libre de academias hoy.</p>
            ) : (
              <div className="space-y-3">
                {todaysAcademias.map(a => (
                  <div key={a.id} className="bg-bg p-3 rounded-lg border-l-2" style={{ borderColor: a.color || '#7CC3FF' }}>
                    <h3 className="font-medium">{a.nombre}</h3>
                    <p className="text-xs text-ink-muted">{a.hora} · {a.clase}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Events (Gigs) */}
          <div className="card">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Music className="w-5 h-5 text-accent-dj" /> Próximos Eventos
            </h2>
            {upcomingGigs.length === 0 ? (
              <p className="text-ink-muted text-sm">No hay eventos próximos.</p>
            ) : (
              <div className="space-y-4">
                {upcomingGigs.map(g => (
                  <div key={g.id} className="bg-bg p-3 rounded-lg border border-ink-muted/10">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-medium text-sm leading-tight">{g.evento}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${g.tipo === 'dj' ? 'bg-accent-dj/20 text-accent-dj' : 'bg-accent-academy/20 text-accent-academy'}`}>
                        {g.tipo.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted">{formatDateStr(g.fecha)} · {g.hora}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-pending">{g.estado}</span>
                      <span className="text-sm font-bold text-success">{formatCurrency(g.pago)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
