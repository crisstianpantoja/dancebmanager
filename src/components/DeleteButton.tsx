import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface DeleteButtonProps {
  onConfirm: () => void;
  className?: string;
  iconOnly?: boolean;
  text?: string;
  /** Se usa como aria-label y title cuando el botón sólo muestra el icono. */
  label?: string;
}

export function DeleteButton({ onConfirm, className, iconOnly, text = 'Eliminar', label }: DeleteButtonProps) {
  const [asking, setAsking] = useState(false);
  const accessibleLabel = label || text;

  if (asking) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onConfirm(); setAsking(false); }}
        onMouseLeave={() => setAsking(false)}
        aria-label={`Confirmar: ${accessibleLabel}`}
        // En modo icono el botón lleva su propio tamaño para no heredar el del
        // icono, que dejaría el texto «Confirmar» recortado.
        className={cn(
          'bg-error text-white font-bold rounded-xl text-xs animate-pulse',
          iconOnly ? 'h-10 px-3 shrink-0' : 'px-2 py-1',
          iconOnly ? undefined : className
        )}
      >
        Confirmar
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setAsking(true); }}
      className={className}
      aria-label={iconOnly ? accessibleLabel : undefined}
      title={iconOnly ? accessibleLabel : undefined}
    >
      {iconOnly ? <Trash2 className="w-4 h-4" /> : text}
    </button>
  );
}
