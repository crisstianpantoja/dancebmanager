/**
 * Lectura de hojas de cálculo en el navegador, sin dependencias.
 *
 * El único paquete de npm que lee .xlsx (`xlsx@0.18.5`) arrastra dos
 * vulnerabilidades altas sin corrección publicada, así que aquí se hace lo
 * mínimo necesario: descomprimir el .xlsx (que es un ZIP) con
 * `DecompressionStream` y leer las celdas del XML de la primera hoja.
 *
 * Todas las funciones devuelven una matriz de textos: la primera fila son los
 * encabezados y el resto los datos, tal como los pintaría Excel.
 */

export type SheetRows = string[][];

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

/** Elige el separador más frecuente en la primera línea. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parser de texto delimitado que respeta comillas dobles, comillas escapadas
 * (`""`) y saltos de línea dentro de un campo entrecomillado.
 */
export function parseDelimited(text: string, delimiter?: string): SheetRows {
  const clean = text.replace(/^\ufeff/, '');
  const sep = delimiter || detectDelimiter(clean);

  const rows: SheetRows = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Serializa una matriz a CSV, entrecomillando sólo lo que lo necesita. */
export function toCsv(rows: SheetRows): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? '';
          return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
    )
    .join('\r\n');
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;

interface ZipEntry {
  name: string;
  method: number;
  offset: number;
  compressedSize: number;
}

/** Índice de las entradas del ZIP, leído desde el directorio central. */
function readZipIndex(view: DataView): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no parece un .xlsx válido');

  const total = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();

  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(pointer, true) !== ZIP_CENTRAL) break;

    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const offset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + pointer + 46, nameLength));

    entries.set(name, { name, method, offset, compressedSize });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipEntry(buffer: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  // La cabecera local repite nombre y extras, cuyo tamaño hay que saltar.
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.slice(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('El .xlsx usa una compresión no soportada');

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede leer .xlsx; guarda el archivo como CSV');
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });
}

/** Texto plano de un fragmento XML: concatena todos los `<t>` que contenga. */
function textOf(xml: string): string {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g);
  if (!parts) return '';
  return parts.map((part) => decodeXml(part.replace(/<[^>]+>/g, ''))).join('');
}

/** 'A' → 0, 'B' → 1, 'AA' → 26. */
function columnIndex(reference: string): number {
  const letters = reference.replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<SheetRows> {
  const view = new DataView(buffer);
  const entries = readZipIndex(view);

  const sheetName = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0];
  if (!sheetName) throw new Error('El archivo no contiene ninguna hoja de cálculo');

  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedEntry) {
    const xml = await readZipEntry(buffer, view, sharedEntry);
    for (const item of xml.match(/<si[^>]*>[\s\S]*?<\/si>/g) ?? []) shared.push(textOf(item));
  }

  const sheetXml = await readZipEntry(buffer, view, entries.get(sheetName)!);
  const rows: SheetRows = [];

  for (const rowXml of sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];

    for (const cellXml of rowXml.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const reference = /r="([A-Z]+\d+)"/i.exec(cellXml)?.[1] ?? '';
      const index = reference ? columnIndex(reference) : cells.length;
      const type = /t="([^"]+)"/.exec(cellXml)?.[1] ?? 'n';

      let value = '';
      if (type === 's') {
        const pointer = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? '';
        value = shared[Number(pointer)] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(cellXml);
      } else {
        value = decodeXml(/<v[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? '');
      }

      while (cells.length < index) cells.push('');
      cells[index] = value;
    }

    rows.push(cells);
  }

  return rows.filter((cells) => cells.some((cell) => (cell ?? '').trim() !== ''));
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

/** Lee un archivo .csv, .tsv, .txt o .xlsx y devuelve sus filas como texto. */
export async function readSpreadsheet(file: File): Promise<SheetRows> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls')) {
    throw new Error('El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o .csv');
  }
  return parseDelimited(await file.text());
}
