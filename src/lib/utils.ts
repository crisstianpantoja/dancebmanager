export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Fechas: en español; parseo local (new Date(y, m-1, d)) para evitar el desfase de un día por timezone
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) return new Date(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateStr(dateStr: string): string {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(parseLocalDate(dateStr));
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  let date = new Date();
  date.setHours(parseInt(h, 10));
  date.setMinutes(parseInt(m, 10));
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
