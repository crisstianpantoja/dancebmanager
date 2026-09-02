import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { apiCreateUsers, type CreatedUser, type NewUserPayload } from '../lib/api';
import { readSpreadsheet, toCsv, type SheetRows } from '../lib/spreadsheet';
import { cn } from '../lib/utils';

/** Columnas de la plantilla, en orden. */
const COLUMNS = ['nombre', 'documento', 'rol', 'contacto', 'tipo', 'nivel', 'notas'] as const;
type Column = (typeof COLUMNS)[number];

/** Encabezados que se aceptan para cada columna, ya normalizados. */
const HEADER_ALIASES: Record<Column, string[]> = {
  nombre: ['nombre', 'nombre completo', 'nombres', 'nombre y apellido'],
  documento: ['documento', 'numero de documento', 'num documento', 'cedula', 'cc', 'identificacion', 'id'],
  rol: ['rol', 'perfil', 'tipo de usuario'],
  contacto: ['contacto', 'telefono', 'celular', 'correo', 'email', 'e-mail'],
  tipo: ['tipo', 'modalidad'],
  nivel: ['nivel'],
  notas: ['notas', 'observaciones', 'comentarios'],
};

const TEMPLATE_ROWS: SheetRows = [
  [...COLUMNS],
  ['Nombre completo', 'Documento', 'alumno', 'Contacto', 'ambas', 'Principiante', 'Notas'],
];

/** Quita acentos y espacios de sobra para comparar encabezados. */
function normalizeHeader(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const VALID_ROLES = ['alumno', 'administrador', 'profesor'];
const ROLE_ALIASES: Record<string, string> = { admin: 'administrador', administrator: 'administrador', teacher: 'profesor', profe: 'profesor' };

function normalizeRole(value: string): string {
  const raw = normalizeHeader(value);
  if (!raw) return 'alumno';
  return ROLE_ALIASES[raw] ?? raw;
}

interface PreviewRow {
  line: number;
  values: Record<Column, string>;
  errors: string[];
  duplicate: boolean;
}

interface ParsedSheet {
  rows: PreviewRow[];
  /** Columnas de la plantilla que el archivo no traía. */
  missing: Column[];
}

interface UserImportProps {
  onClose: () => void;
  /** Documentos ya registrados, para marcar los repetidos en la previsualización. */
  existingDocumentos: Set<string>;
  onImported: () => void;
}

export function UserImport({ onClose, existingDocumentos, onImported }: UserImportProps) {
  const { addToast } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [parseError, setParseError] = useState('');
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [created, setCreated] = useState<CreatedUser[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const validRows = useMemo(() => parsed?.rows.filter((row) => row.errors.length === 0) ?? [], [parsed]);
  const invalidCount = (parsed?.rows.length ?? 0) - validRows.length;

  const downloadTemplate = () => {
    // El BOM hace que Excel abra el CSV en UTF-8 y no rompa los acentos.
    const blob = new Blob(['\ufeff' + toCsv(TEMPLATE_ROWS)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-usuarios.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Convierte las filas del archivo en filas validadas para la previsualización. */
  const buildPreview = (sheet: SheetRows): ParsedSheet => {
    if (sheet.length === 0) throw new Error('El archivo está vacío');

    const headers = sheet[0].map(normalizeHeader);
    const indexOf: Partial<Record<Column, number>> = {};
    for (const column of COLUMNS) {
      const index = headers.findIndex((header) => HEADER_ALIASES[column].includes(header));
      if (index >= 0) indexOf[column] = index;
    }

    if (indexOf.nombre === undefined || indexOf.documento === undefined) {
      throw new Error(
        'La primera fila debe tener los encabezados de la plantilla; faltan «nombre» y/o «documento»'
      );
    }

    const missing = COLUMNS.filter((column) => indexOf[column] === undefined);
    const seen = new Map<string, number>();

    const rows: PreviewRow[] = sheet.slice(1).map((cells, offset) => {
      const values = Object.fromEntries(
        COLUMNS.map((column) => {
          const index = indexOf[column];
          return [column, index === undefined ? '' : (cells[index] ?? '').trim()];
        })
      ) as Record<Column, string>;

      const errors: string[] = [];
      let duplicate = false;

      if (!values.nombre) errors.push('Falta el nombre');
      if (!values.documento) {
        errors.push('Falta el documento');
      } else {
        if (existingDocumentos.has(values.documento)) {
          errors.push('El documento ya existe en la plataforma');
          duplicate = true;
        }
        const previous = seen.get(values.documento);
        if (previous) {
          errors.push(`Documento repetido (fila ${previous})`);
          duplicate = true;
        } else {
          seen.set(values.documento, offset + 2);
        }
      }

      if (values.rol) {
        values.rol = normalizeRole(values.rol);
        if (!VALID_ROLES.includes(values.rol)) errors.push(`Rol no reconocido: ${values.rol}`);
      } else {
        values.rol = 'alumno';
      }

      return { line: offset + 2, values, errors, duplicate };
    });

    if (rows.length === 0) throw new Error('El archivo no tiene ninguna fila de datos');
    return { rows, missing };
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setParseError('');
    setParsed(null);
    setFileName(file.name);
    try {
      setParsed(buildPreview(await readSpreadsheet(file)));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setReading(false);
    }
  };

  const confirmImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const users: NewUserPayload[] = validRows.map((row) => ({
        nombre: row.values.nombre,
        documento: row.values.documento,
        rol: row.values.rol,
        contacto: row.values.contacto,
        tipo: row.values.tipo,
        nivel: row.values.nivel,
        notas: row.values.notas,
      }));
      const result = await apiCreateUsers(users);
      setCreated(result.created);
      onImported();
      addToast(`${result.created.length} usuarios importados`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo importar', 'error');
    } finally {
      setImporting(false);
    }
  };

  const copyAll = async () => {
    if (!created) return;
    const text = created
      .map((user) => `${user.nombre}\t${user.documento}\t${user.tempPassword}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(`Nombre\tDocumento\tContraseña temporal\n${text}`);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      addToast('No se pudo copiar; selecciona y copia manualmente', 'error');
    }
  };

  // ------------------------------------------------------------------
  // Resultado: las contraseñas temporales se muestran una única vez
  // ------------------------------------------------------------------
  if (created) {
    return (
      <div className="card p-6 md:p-8 max-w-3xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              {created.length} usuarios importados
            </h2>
            <p className="text-ink-muted text-sm mt-1">
              Cada persona debe cambiar su contraseña al entrar por primera vez.
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-pending/30 bg-pending/10 p-4 mb-5">
          <AlertTriangle className="w-5 h-5 text-pending shrink-0 mt-0.5" />
          <p className="text-sm text-ink">
            Esta es la única vez que se muestran las contraseñas temporales. Cópialas ahora: después
            sólo se pueden volver a generar.
          </p>
        </div>

        <button onClick={copyAll} className="btn-secondary flex items-center gap-2 mb-4">
          {copiedAll ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          {copiedAll ? 'Copiado' : 'Copiar toda la lista'}
        </button>

        <div className="overflow-x-auto rounded-xl border border-ink-muted/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg text-ink-muted">
              <tr>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Documento</th>
                <th className="p-3 font-medium">Contraseña temporal</th>
              </tr>
            </thead>
            <tbody>
              {created.map((user) => (
                <tr key={user.id} className="border-t border-ink-muted/10">
                  <td className="p-3">{user.nombre}</td>
                  <td className="p-3 font-mono">{user.documento}</td>
                  <td className="p-3 font-mono font-bold text-magenta select-all">{user.tempPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-6">
          <button onClick={onClose} className="btn-primary">Listo</button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Selección de archivo y previsualización
  // ------------------------------------------------------------------
  return (
    <div className="card p-6 md:p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-magenta" />
            Carga masiva de usuarios
          </h2>
          <p className="text-ink-muted text-sm mt-1">
            Sube un CSV o Excel (.xlsx). Las contraseñas no se importan: cada usuario recibe una
            temporal que deberá cambiar al entrar.
          </p>
        </div>
        <button onClick={onClose} className="icon-btn" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <button onClick={downloadTemplate} className="btn-secondary flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Descargar plantilla
        </button>
        <button
          onClick={() => fileInput.current?.click()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" /> {parsed ? 'Elegir otro archivo' : 'Elegir archivo'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {fileName && (
        <p className="text-sm text-ink-muted mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> {fileName}
        </p>
      )}

      {reading && (
        <p className="text-sm text-ink-muted flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Leyendo el archivo…
        </p>
      )}

      {parseError && (
        <div className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/10 p-4">
          <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <p className="text-sm text-ink">{parseError}</p>
        </div>
      )}

      {!parsed && !reading && !parseError && (
        <div className="rounded-xl border border-dashed border-ink-muted/25 p-8 text-center text-ink-muted text-sm">
          La plantilla trae las columnas <span className="text-ink font-medium">{COLUMNS.join(', ')}</span>.
          Sólo «nombre» y «documento» son obligatorias.
        </div>
      )}

      {parsed && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-sm px-3 py-1 rounded-full bg-success/15 text-success font-medium">
              {validRows.length} listos para importar
            </span>
            {invalidCount > 0 && (
              <span className="text-sm px-3 py-1 rounded-full bg-error/15 text-error font-medium">
                {invalidCount} con errores (se omiten)
              </span>
            )}
            {parsed.missing.length > 0 && (
              <span className="text-sm text-ink-muted">
                Columnas ausentes: {parsed.missing.join(', ')}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-ink-muted/10 max-h-[45vh]">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg text-ink-muted sticky top-0">
                <tr>
                  <th className="p-3 font-medium">Fila</th>
                  <th className="p-3 font-medium">Nombre</th>
                  <th className="p-3 font-medium">Documento</th>
                  <th className="p-3 font-medium">Rol</th>
                  <th className="p-3 font-medium">Contacto</th>
                  <th className="p-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => {
                  const ok = row.errors.length === 0;
                  return (
                    <tr
                      key={row.line}
                      className={cn(
                        'border-t border-ink-muted/10',
                        !ok && (row.duplicate ? 'bg-error/10' : 'bg-pending/10')
                      )}
                    >
                      <td className="p-3 text-ink-muted font-mono">{row.line}</td>
                      <td className="p-3">{row.values.nombre || <span className="text-error">—</span>}</td>
                      <td className="p-3 font-mono">{row.values.documento || <span className="text-error">—</span>}</td>
                      <td className="p-3 capitalize">{row.values.rol}</td>
                      <td className="p-3 text-ink-muted">{row.values.contacto || '—'}</td>
                      <td className="p-3">
                        {ok ? (
                          <span className="text-success flex items-center gap-1">
                            <Check className="w-4 h-4" /> Listo
                          </span>
                        ) : (
                          <span className="text-error text-xs leading-snug">{row.errors.join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
            <button onClick={onClose} className="btn-secondary flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={confirmImport}
              disabled={validRows.length === 0 || importing}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? 'Importando…' : `Importar ${validRows.length} usuarios`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
