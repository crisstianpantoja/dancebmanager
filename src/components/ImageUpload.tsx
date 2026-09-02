import React, { useState } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface ImageUploadProps {
  showPreview?: boolean;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export function ImageUpload({ value, onChange, label = 'Imagen', placeholder = 'Enlace de la imagen', showPreview = true }: ImageUploadProps) {
  const [mode, setMode] = useState<'url' | 'file'>('url');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        onChange(result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <label className="label">{label}</label>
      <div className="flex bg-surface-hover p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors", mode === 'url' ? "bg-surface shadow-sm text-ink" : "text-ink-muted hover:text-ink")}
        >
          <LinkIcon className="w-4 h-4" /> Link (URL)
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors", mode === 'file' ? "bg-surface shadow-sm text-ink" : "text-ink-muted hover:text-ink")}
        >
          <Upload className="w-4 h-4" /> Subir Archivo
        </button>
      </div>

      {mode === 'url' ? (
        <input
          type="text"
          className="input w-full"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="border-2 border-dashed border-ink-muted/30 rounded-xl p-6 text-center hover:bg-surface-hover transition-colors">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id="file-upload"
            onChange={handleFileChange}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center">
            <Upload className="w-8 h-8 text-magenta mb-2" />
            <span className="text-sm font-medium text-ink">Haz clic para subir una imagen</span>
            <span className="text-xs text-ink-muted mt-1">PNG, JPG o GIF</span>
          </label>
        </div>
      )}

      {showPreview && value && (
        <div className="mt-4 p-4 bg-bg rounded-xl border border-ink-muted/20 flex flex-col items-center justify-center">
          <p className="text-xs text-ink-muted mb-2 font-medium">Vista Previa</p>
          <img src={value} alt="Vista previa" className="max-h-32 object-contain rounded-lg" onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x150?text=Imagen+No+Encontrada';
          }} />
        </div>
      )}
    </div>
  );
}
