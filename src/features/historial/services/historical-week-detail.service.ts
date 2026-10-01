import { listCancellations } from "../../cancelaciones/services/cancellations.service";
import type { Cancellation } from "../../cancelaciones/types/cancellation";
import { listOrders } from "../../pedidos/services/orders.service";
import type { OrderDetail } from "../../pedidos/types/order-detail";
import { AppError } from "../../../lib/errors";

const PAGE_SIZE = 100;

export interface HistoricalWeekDetail {
  orders: OrderDetail[];
  cancellations: Cancellation[];
}

/**
 * Obtiene todos los hechos registrados de una semana cerrada.
 *
 * La consulta se compone a partir de los servicios de pedidos y
 * cancelaciones existentes para mantener una única capa de acceso a
 * Supabase y reutilizar sus mapeos/validaciones.
 */
export async function getHistoricalWeekDetail(
  weekId: string,
): Promise<HistoricalWeekDetail> {
  validateUuid(weekId, "weekId");

  const [orders, cancellations] = await Promise.all([
    listAllOrders(weekId),
    listAllCancellations(weekId),
  ]);

  return { orders, cancellations };
}

async function listAllOrders(weekId: string): Promise<OrderDetail[]> {
  const firstPage = await listOrders({ weekId, page: 1, pageSize: PAGE_SIZE });
  const totalPages = Math.ceil(firstPage.total / PAGE_SIZE);

  if (totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      listOrders({ weekId, page: index + 2, pageSize: PAGE_SIZE }),
    ),
  );

  return [firstPage.items, ...remainingPages.map((page) => page.items)].flat();
}

async function listAllCancellations(weekId: string): Promise<Cancellation[]> {
  const firstPage = await listCancellations({
    weekId,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.ceil(firstPage.total / PAGE_SIZE);

  if (totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      listCancellations({ weekId, page: index + 2, pageSize: PAGE_SIZE }),
    ),
  );

  return [
    firstPage.items,
    ...remainingPages.map((page) => page.items),
  ].flat();
}

function validateUuid(value: string, fieldName: string): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldName} debe ser un UUID válido.`,
    );
  }
}
