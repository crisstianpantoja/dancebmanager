import React from 'react';
import { motion } from 'motion/react';
import { ExternalLink, FileText, X } from 'lucide-react';

/**
 * Muestra el comprobante que subió un alumno. Puede ser una imagen pegada
 * (data URL) o un enlace externo: si no se puede previsualizar, se ofrece
 * abrirlo en otra pestaña.
 */
export function ReceiptViewer({
  url,
  nombre,
  onClose,
}: {
  url: string;
  nombre: string;
  onClose: () => void;
}) {
  const esImagen = url.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url);
  const esEnlace = /^https?:\/\//i.test(url);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex flex-col justify-center items-center p-4"
    >
      <div className="w-full max-w-md bg-surface rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-ink-muted/10 flex justify-between items-center bg-bg gap-2">
          <h3 className="font-bold truncate">Comprobante de {nombre}</h3>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex flex-col items-center justify-center min-h-[240px] bg-ink-muted/5">
          {esImagen ? (
            <img
              src={url}
              alt={`Comprobante de ${nombre}`}
              className="max-h-[60vh] w-auto rounded-xl border border-ink-muted/10"
            />
          ) : (
            <>
              <FileText className="w-16 h-16 text-ink-muted mb-4 opacity-50" />
              <p className="text-ink-muted font-medium mb-1">No se puede previsualizar</p>
              <p className="text-xs text-ink-muted/60 break-all text-center max-w-full">{url || 'Sin comprobante'}</p>
            </>
          )}
          {esEnlace && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mt-4 py-2 text-xs flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir en otra pestaña
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
