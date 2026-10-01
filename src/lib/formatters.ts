const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR");

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDate(value: string): string {
  const date = parseDateValue(value);

  return dateFormatter.format(date);
}

/**
 * Fecha y hora local, para mostrar el corte de horario de un día
 * (ej: "6 dic, 20:00"). El valor es un ISO con offset (timestamptz).
 */
export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

/**
 * Convierte un ISO con offset al valor que esperan los inputs
 * `datetime-local` (`YYYY-MM-DDTHH:mm`), en hora local del navegador.
 * Inversible con `new Date(value).toISOString()`.
 */
export function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number): string => String(part).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function parseDateValue(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
  }

  return new Date(value);
}
