import { useState } from 'react';
import { useStore } from '../store';
import type { PlanModalidad, PlanTemplate, TipoMensualidad } from '../types';
import { formatCurrency, generateId, cn } from '../lib/utils';
import {
  MODALIDADES,
  VIGENCIA_POR_DEFECTO,
  clasesDePlan,
  describirCupo,
  describirVigencia,
  usaCupo,
  usaVigencia,
} from '../lib/planes';
import { Plus, Tag } from 'lucide-react';
import { DeleteButton } from './DeleteButton';

/**
 * Planes y Membresías.
 *
 * Vive fuera de Finanzas porque no es un movimiento de dinero, sino el catálogo
 * con el que se cobra: de aquí salen la vigencia y el cupo que después usa el
 * registro de asistencia.
 *
 * El formulario cambia según la modalidad porque cada una necesita datos
 * distintos, y guardar los que no aplican dejaría planes con cupos o vigencias
 * fantasma que el descuento interpretaría mal.
 */

const ETIQUETA_MODALIDAD: Record<PlanModalidad, string> = {
  'Mensualidad': 'Mensualidad',
  'Paquete de clases': 'Paquete de clases (privadas)',
  'Clase suelta': 'Clase suelta',
  'Matrícula': 'Matrícula (Inscripción)',
};

interface FormPlan {
  nombre: string;
  modalidad: PlanModalidad;
  tipoMensualidad: TipoMensualidad;
  monto: number;
  clasesIncluidas: number;
  vigenciaMeses: number;
}

const FORM_VACIO: FormPlan = {
  nombre: '',
  modalidad: 'Mensualidad',
  tipoMensualidad: 'ilimitada',
  monto: 0,
  clasesIncluidas: 0,
  vigenciaMeses: VIGENCIA_POR_DEFECTO,
};

/** Ayuda breve bajo la modalidad elegida, para saber qué se está creando. */
function pistaModalidad(form: FormPlan): string {
  switch (form.modalidad) {
    case 'Mensualidad':
      return form.tipoMensualidad === 'ilimitada'
        ? 'Acceso libre durante la vigencia: no descuenta clases, sólo se valida que esté vigente.'
        : 'Descuenta una clase por asistencia, dentro de la vigencia.';
    case 'Paquete de clases':
      return 'Clases privadas: descuenta una clase por asistencia, dentro de la vigencia.';
    case 'Clase suelta':
      return 'Una sola clase, sin vigencia: se asigna al alumno sin depender de un plan.';
    case 'Matrícula':
      return 'Pago único de inscripción: no incluye clases ni vigencia.';
  }
}

export function Plans() {
  const { data, updateData } = useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<FormPlan>(FORM_VACIO);

  const conCupo = usaCupo(form);
  const conVigencia = usaVigencia(form);

  const handleSave = () => {
    if (!form.nombre.trim() || !form.monto) return;

    const plan: PlanTemplate = {
      id: generateId(),
      nombre: form.nombre.trim(),
      modalidad: form.modalidad,
      monto: form.monto,
      clasesIncluidas: clasesDePlan(form, form.clasesIncluidas),
    };

    // Sólo se guarda lo que la modalidad usa: así ninguna clase se descuenta de
    // un plan que no debería tener cupo.
    if (form.modalidad === 'Mensualidad') plan.tipoMensualidad = form.tipoMensualidad;
    if (conVigencia) plan.vigenciaMeses = form.vigenciaMeses || VIGENCIA_POR_DEFECTO;

    updateData({ plans: [...data.plans, plan] });
    setIsAdding(false);
    setForm(FORM_VACIO);
  };

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Planes y Membresías</h1>
          <p className="text-sm text-ink-muted">
            Esquemas de cobro con los que se registran los pagos y se descuentan las clases.
          </p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary flex items-center gap-2 self-start">
          <Plus className="w-4 h-4" /> Nuevo Plan
        </button>
      </div>

      {isAdding && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Crear Plan/Membresía</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div>
              <label className="label">Nombre del Plan</label>
              <input
                type="text"
                className="input appearance-none"
                autoComplete="off"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Mensualidad libre"
              />
            </div>

            <div>
              <label className="label">Modalidad</label>
              <select
                className="input"
                value={form.modalidad}
                onChange={(e) => setForm({ ...form, modalidad: e.target.value as PlanModalidad })}
              >
                {MODALIDADES.map((m) => (
                  <option key={m} value={m}>{ETIQUETA_MODALIDAD[m]}</option>
                ))}
              </select>
            </div>

            {form.modalidad === 'Mensualidad' && (
              <div>
                <label className="label">Tipo de mensualidad</label>
                <select
                  className="input"
                  value={form.tipoMensualidad}
                  onChange={(e) => setForm({ ...form, tipoMensualidad: e.target.value as TipoMensualidad })}
                >
                  <option value="ilimitada">Ilimitada</option>
                  <option value="con_tope">Con tope de clases</option>
                </select>
              </div>
            )}

            {conCupo && (
              <div>
                <label className="label">Número de clases incluidas</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  placeholder="Ej: 8"
                  value={form.clasesIncluidas || ''}
                  onChange={(e) => setForm({ ...form, clasesIncluidas: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            {conVigencia && (
              <div>
                <label className="label">Vigencia (meses)</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.vigenciaMeses || ''}
                  onChange={(e) => setForm({ ...form, vigenciaMeses: parseInt(e.target.value) || 0 })}
                />
                <p className="hint">Por defecto 1 mes desde la fecha del pago.</p>
              </div>
            )}

            <div>
              <label className="label">Monto ($ COP)</label>
              <input
                type="number"
                className="input font-bold"
                placeholder="Monto"
                value={form.monto || ''}
                onChange={(e) => setForm({ ...form, monto: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <p className="hint mb-4">{pistaModalidad(form)}</p>

          <div className="flex justify-end pt-2 gap-3">
            <button className="btn-secondary" onClick={() => { setIsAdding(false); setForm(FORM_VACIO); }}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={handleSave}>Guardar Plan</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.plans.map((p) => {
          const cupo = describirCupo(p);
          const vigencia = describirVigencia(p);
          return (
            <div key={p.id} className="card relative group">
              <h3 className="font-bold text-lg mb-1 pr-10">{p.nombre}</h3>
              <p className="font-bold text-2xl mb-3">{formatCurrency(p.monto)}</p>
              <div className="text-sm text-ink-muted mb-2 flex flex-wrap gap-2">
                <span className="bg-surface px-2 py-1 rounded text-xs uppercase font-medium">{p.modalidad}</span>
                {p.modalidad === 'Mensualidad' && (
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-xs uppercase font-medium',
                      p.tipoMensualidad === 'ilimitada'
                        ? 'bg-success/20 text-success'
                        : 'bg-accent-academy/20 text-accent-academy'
                    )}
                  >
                    {p.tipoMensualidad === 'ilimitada' ? 'Ilimitada' : 'Con tope'}
                  </span>
                )}
              </div>
              {cupo && <p className="text-sm text-ink-muted">{cupo}</p>}
              {vigencia && <p className="text-xs text-ink-muted mt-1">{vigencia}</p>}

              <DeleteButton
                onConfirm={() => updateData({ plans: data.plans.filter((x) => x.id !== p.id) })}
                className="absolute top-4 right-4 p-2 text-error/70 hover:text-error hover:bg-error/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                iconOnly={true}
              />
            </div>
          );
        })}

        {data.plans.length === 0 && (
          <div className="md:col-span-3 text-center p-12 text-ink-muted">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Todavía no hay planes creados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
