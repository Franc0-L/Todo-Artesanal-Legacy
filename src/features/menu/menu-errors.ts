import { isAppError } from "../../lib/errors";

/**
 * Convierte el error de una consulta del menú en algo que se le pueda
 * mostrar al cliente. Un fallo de permisos suele ser un JWT vencido o
 * recién rotado, y el botón de reintentar lo resuelve emitiendo uno nuevo.
 */
export function dataErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
      return "No se pudo consultar la oferta con este enlace. Reintentá.";
    }
    return error.message;
  }

  return "No se pudo cargar la oferta de la semana.";
}

/**
 * Mensaje para acciones del cliente (crear/editar/borrar pedido o
 * cancelación). A diferencia de una consulta, acá interesa el mensaje de
 * la regla de negocio (p. ej. "ya hay un pedido ese día").
 */
export function actionErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
      return "Tu enlace venció. Recargá la página para seguir.";
    }
    return error.message;
  }

  return "No se pudo completar la acción. Reintentá.";
}
