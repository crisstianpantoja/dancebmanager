import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Loader2 } from 'lucide-react';
import type { Student } from '../types';
import { useStore } from '../store';
import {
  ESCALA_CARNET,
  dibujarCarnet,
  guardarCarnet,
  nombreArchivoCarnet,
  temaDeCarnet,
} from '../lib/carnet';
import { cn } from '../lib/utils';

/**
 * Botón de descarga del carnet. El QR se pinta en un canvas oculto y de ahí lo
 * toma el dibujo del carnet, así el código del PNG es exactamente el mismo que
 * se ve en pantalla.
 */

/** Lado del QR dentro del carnet, en píxeles reales del PNG. */
const QR_PX = 110 * ESCALA_CARNET;

interface CarnetDownloadButtonProps {
  student: Student;
  className?: string;
  label?: string;
}

export function CarnetDownloadButton({
  student,
  className,
  label = 'Descargar Carnet',
}: CarnetDownloadButtonProps) {
  const { data, addToast } = useStore();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [generando, setGenerando] = useState(false);

  // qrcode.react multiplica el tamaño por la densidad de la pantalla, así que
  // se le pide en unidades CSS lo que da el mapa de bits exacto que hace falta:
  // el QR entra en el carnet sin reescalar y sigue siendo legible.
  const densidad = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const qrSize = Math.max(64, Math.round(QR_PX / densidad));

  const descargar = async () => {
    if (generando) return;
    const qrCanvas = qrRef.current;
    if (!qrCanvas) {
      addToast('El carnet aún se está preparando, inténtalo de nuevo.', 'error');
      return;
    }
    setGenerando(true);
    try {
      const mostrarLogo = Boolean(data.settings?.showLoginLogo);
      const canvas = await dibujarCarnet(
        {
          nombre: student.nombre,
          nivel: student.nivel || 'Nivel Básico',
          tipo: student.tipo || 'Regular',
          rol: student.rol || 'alumno',
          fotoUrl: student.foto,
          brandName: data.settings?.brandName,
          logoUrl: mostrarLogo
            ? data.settings?.digitalCardLogoUrl || data.settings?.loginLogoUrl
            : undefined,
          qrCanvas,
        },
        temaDeCarnet(student.cardTheme)
      );

      const resultado = await guardarCarnet(canvas, nombreArchivoCarnet(student.nombre));
      if (resultado === 'compartido') addToast('Carnet listo para guardar', 'success');
      else if (resultado === 'descargado') addToast('Carnet descargado exitosamente', 'success');
    } catch (error) {
      console.error('[carnet]', error);
      addToast(
        error instanceof Error && error.message
          ? `No se pudo generar el carnet: ${error.message}`
          : 'No se pudo generar el carnet',
        'error'
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      {/* Fuente del QR para el PNG: no se muestra, sólo se lee su mapa de bits. */}
      <div aria-hidden className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
        {/* marginSize deja la zona de silencio dentro del propio código, que
            es lo que necesita un carnet impreso o fotografiado. */}
        <QRCodeCanvas ref={qrRef} value={`STUDENT:${student.id}`} size={qrSize} marginSize={2} />
      </div>
      <button
        type="button"
        onClick={descargar}
        disabled={generando}
        className={cn('flex justify-center items-center gap-2 disabled:opacity-60', className)}
      >
        {generando ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {generando ? 'Generando…' : label}
      </button>
    </>
  );
}
