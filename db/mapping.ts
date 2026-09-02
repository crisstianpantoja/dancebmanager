import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  academies,
  academyPayments,
  events,
  expenses,
  gigs,
  notifications,
  payments,
  plans,
  sessions,
  students,
  teachers,
} from './schema.js';

/**
 * Traducción entre los objetos que maneja el cliente (`AppData` en
 * src/store.tsx) y las filas de Postgres.
 *
 * Todo lo de este archivo es puro: no toca la base de datos, así que se puede
 * razonar y probar por separado.
 */

export type AnyRecord = Record<string, unknown>;

/**
 * Colecciones que son listas de objetos con `id`. Se mapean 1:1 con su tabla.
 *
 * `attendanceRecords` queda fuera a propósito: esta lista es lo que el cliente
 * puede escribir, y la asistencia sólo la escribe el administrador a través de
 * /api/asistencia.
 */
export const LIST_COLLECTIONS = {
  teachers,
  students,
  sessions,
  payments,
  academies,
  gigs,
  plans,
  expenses,
  academyPayments,
  events,
  notifications,
} satisfies Record<string, PgTable>;

export type ListCollection = keyof typeof LIST_COLLECTIONS;

/** `notifications.read` choca con la palabra reservada, en la tabla es `is_read`. */
export function toRowShape(name: ListCollection, item: AnyRecord): AnyRecord {
  if (name !== 'notifications') return item;
  const { read, ...rest } = item;
  return { ...rest, isRead: read === true };
}

export function fromRowShape(name: ListCollection, row: AnyRecord): AnyRecord {
  if (name !== 'notifications') return row;
  const { isRead, ...rest } = row;
  return { ...rest, read: isRead === true };
}

/**
 * Deja sólo las columnas que existen en la tabla y ajusta el tipo de cada
 * valor. Los campos ausentes se omiten para que aplique el default de la
 * columna, en lugar de escribir un null que rompería un NOT NULL.
 */
export function sanitize(table: PgTable, item: AnyRecord): AnyRecord {
  const columns = getTableColumns(table) as Record<string, any>;
  const row: AnyRecord = {};

  for (const [key, column] of Object.entries(columns)) {
    const value = item[key];

    if (value === undefined || value === null) continue;
    if (value === '') {
      // Un string vacío sí es un valor legítimo para una columna de texto.
      if (column.dataType === 'string') row[key] = '';
      continue;
    }

    // En drizzle 1.x `dataType` incluye la precisión ('number int32',
    // 'number double', 'object json'), así que se compara por prefijo.
    const dataType = String(column.dataType);

    if (dataType.startsWith('number')) {
      const num = Number(value);
      // parseInt('') de un formulario vacío da NaN: se omite el campo.
      if (!Number.isFinite(num)) continue;
      row[key] = /int/i.test(dataType) ? Math.round(num) : num;
    } else if (dataType.startsWith('boolean')) {
      row[key] = value === true || value === 'true' || value === 1;
    } else if (dataType.startsWith('string')) {
      row[key] = typeof value === 'string' ? value : String(value);
    } else {
      // json / jsonb: se guarda tal cual.
      row[key] = value;
    }
  }

  return row;
}

/**
 * Las columnas opcionales llegan como `null` desde Postgres, pero los tipos
 * del cliente las declaran como `undefined`, así que se quitan al leer.
 */
export function stripNulls(row: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) out[key] = value;
  }
  return out;
}
