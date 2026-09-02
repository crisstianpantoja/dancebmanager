import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';

interface CopyFieldProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * Muestra un valor que sólo se ve una vez (una contraseña temporal) con un
 * botón para copiarlo. Sin `navigator.clipboard` cae a `execCommand`, que es
 * lo único disponible en contextos no seguros.
 */
export function CopyField({ value, label, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <div className="flex-1 min-w-0 bg-bg border border-magenta/30 rounded-xl px-4 py-2.5">
        {label && <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-0.5">{label}</p>}
        <p className="font-mono text-base font-bold text-ink break-all select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copiado' : 'Copiar'}
        className={cn(
          'shrink-0 px-4 rounded-xl font-medium text-sm flex items-center gap-2 transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-magenta focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          copied ? 'bg-success/20 text-success' : 'bg-magenta text-white hover:opacity-90'
        )}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
