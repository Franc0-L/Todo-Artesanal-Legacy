export const DIA_LABEL = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

export function formatMonto(valor) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(valor ?? 0));
}

export function formatFecha(fechaISO) {
  if (!fechaISO) return "—";
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}`;
}
