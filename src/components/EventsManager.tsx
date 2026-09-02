import React, { useState } from 'react';
import { useStore } from '../store';
import { Ticket, Plus, Calendar, Clock, MapPin, Users, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageUpload } from './ImageUpload';

import { DanceEvent } from '../types';
import { DeleteButton } from './DeleteButton';

export function EventsManager() {
  const { data, updateData, addToast } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<DanceEvent | null>(null);

  const handleDelete = async (id: string) => {
    const updated = data.events.filter(e => e.id !== id);
    await updateData({ events: updated });
    addToast('Evento eliminado', 'success');
  };

  const handleEdit = (ev: DanceEvent) => {
    setEditingEvent(ev);
    setShowModal(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-surface rounded-xl border border-ink-muted/10">
            <Ticket className="w-6 h-6 text-magenta" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-ink">Clases y Eventos</h1>
            <p className="text-ink-muted">Administra el calendario de clases sociales y eventos</p>
          </div>
        </div>
        
        <button 
          className="btn-primary flex items-center gap-2"
          onClick={() => {
            setEditingEvent(null);
            setShowModal(true);
          }}
        >
          <Plus className="w-5 h-5" /> Nuevo Evento
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.events?.map((ev) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card group hover:border-magenta/30 transition-all flex flex-col"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  ev.type === 'clase_regular' ? 'bg-accent-academy/20 text-accent-academy' : 
                  ev.type === 'taller' ? 'bg-success/20 text-success' : 'bg-magenta/20 text-magenta'
                }`}>
                  {ev.type.replace('_', ' ').toUpperCase()}
                </span>
                <h3 className="text-xl font-bold mt-2">{ev.title}</h3>
                {ev.instructor && <p className="text-sm text-ink-muted">por {ev.instructor}</p>}
              </div>
            </div>

            <div className="space-y-2 mb-6 flex-1">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Calendar className="w-4 h-4 text-magenta" /> 
                {new Date(ev.date).toLocaleDateString('es-CO', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Clock className="w-4 h-4 text-accent-academy" /> 
                {ev.startTime} - {ev.endTime}
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Users className="w-4 h-4 text-success" /> 
                {ev.enrolledStudents.length} {ev.capacity ? `/ ${ev.capacity}` : ''} inscritos
              </div>
              {ev.price && ev.price > 0 && (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className="font-bold text-ink">Precio:</span> ${ev.price.toLocaleString()}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t border-ink-muted/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => handleEdit(ev)}
                className="flex-1 py-2 text-sm font-medium bg-surface-hover rounded-lg hover:text-magenta transition-colors flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4" /> Editar
              </button>
              <DeleteButton 
                onConfirm={() => handleDelete(ev.id)}
                className="py-2 px-4 text-sm font-medium bg-error/10 text-error rounded-lg hover:bg-error hover:text-white transition-colors"
                iconOnly={true}
              />
            </div>
          </motion.div>
        ))}

        {!data.events || data.events.length === 0 && (
          <div className="col-span-full py-12 text-center text-ink-muted border border-dashed border-ink-muted/20 rounded-xl">
            No hay clases ni eventos programados.
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <EventFormModal 
            event={editingEvent} 
            onClose={() => setShowModal(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EventFormModal({ event, onClose }: { event: DanceEvent | null, onClose: () => void }) {
  const { data, updateData, addToast } = useStore();
  const [formData, setFormData] = useState<Partial<DanceEvent>>(
    event || {
      title: '',
      type: 'clase_regular',
      date: new Date().toISOString().split('T')[0],
      startTime: '',
      endTime: '',
      level: '',
      capacity: 0,
      price: 0,
      instructor: '',
      description: '',
      enrolledStudents: []
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.date || !formData.startTime || !formData.endTime) {
      addToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    try {
      if (event) {
        const updated = data.events.map(ev => ev.id === event.id ? { ...ev, ...formData } as DanceEvent : ev);
        await updateData({ events: updated });
        addToast('Evento actualizado', 'success');
      } else {
        const newEvent: DanceEvent = {
          ...(formData as DanceEvent),
          id: `e_${Date.now()}`,
          enrolledStudents: []
        };
        await updateData({ events: [...(data.events || []), newEvent] });
        addToast('Evento creado', 'success');
      }
      onClose();
    } catch (error) {
      addToast('Error al guardar', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface rounded-2xl shadow-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-white/5 sticky top-0 bg-surface z-10 flex justify-between items-center">
          <h2 className="text-xl font-bold">{event ? 'Editar Evento' : 'Nuevo Evento'}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Título *</label>
              <input
                type="text"
                className="input"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="Título"
              />
            </div>

            <div>
              <label className="label">Tipo de Evento</label>
              <select
                className="input"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
              >
                <option value="clase_regular">Clase Regular</option>
                <option value="evento_especial">Evento Especial / Social</option>
                <option value="taller">Taller (Bootcamp / Tour)</option>
              </select>
            </div>

            <div>
              <label className="label">Instructor(es)</label>
              <input
                type="text"
                className="input"
                value={formData.instructor}
                onChange={e => setFormData({ ...formData, instructor: e.target.value })}
                placeholder="Instructor"
              />
            </div>

            <div>
              <label className="label">Fecha *</label>
              <input
                type="date"
                className="input"
                required
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Hora Inicio *</label>
                <input
                  type="time"
                  className="input"
                  required
                  value={formData.startTime}
                  onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Hora Fin *</label>
                <input
                  type="time"
                  className="input"
                  required
                  value={formData.endTime}
                  onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">Nivel</label>
              <input
                type="text"
                className="input"
                value={formData.level}
                onChange={e => setFormData({ ...formData, level: e.target.value })}
                placeholder="Nivel"
              />
            </div>

            <div>
              <label className="label">Precio (opcional si es gratis o cubierto)</label>
              <input
                type="number"
                className="input"
                value={formData.price || ''}
                onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                placeholder="Precio"
              />
            </div>

            <div>
              <label className="label">Capacidad (0 = ilimitada)</label>
              <input
                type="number"
                className="input"
                value={formData.capacity || ''}
                onChange={e => setFormData({ ...formData, capacity: Number(e.target.value) })}
                placeholder="Capacidad"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="label">Descripción</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Descripción"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            
            <div className="md:col-span-2">
              <ImageUpload
                label="Imagen / Banner del Evento (Opcional)"
                value={formData.imageUrl || ''}
                onChange={val => setFormData({ ...formData, imageUrl: val })}
                placeholder="Enlace de la imagen"
              />
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-white/5">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Guardar Evento
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
