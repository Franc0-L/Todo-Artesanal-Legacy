import { getActiveWeek, listWeeks } from "../../semanas/services/weeks.service";
import { getExpectedClientCount } from "../../semanas/services/week-expected-clients.service";
import { getOrderTotals } from "../../pedidos/services/orders.service";
import { listCancellations } from "../../cancelaciones/services/cancellations.service";
import { getUnansweredClients } from "../../historial/services/history.service";
import { listClients } from "../../clientes/services/clients.service";
import { listDishes } from "../../platos/services/dishes.service";
import { listMenus } from "../../menus/services/menus.service";
import type {
  ActiveWeekSummary,
  DashboardCatalogCounts,
  DashboardSummary,
} from "../types/dashboard";

/**
 * Consulta y consolida los indicadores de inicio utilizando exclusivamente
 * los servicios y contratos de dominio existentes.
 *
 * Se consultan en paralelo:
 *  - Semana activa (y si existe, sus totales, clientes esperados,
 *    clientes sin responder y cancelaciones)
 *  - Existencia de semanas en borrador
 *  - Conteo de clientes (totales y activos)
 *  - Conteo de platos y menús activos
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [
    activeWeekResult,
    draftWeeksResult,
    activeClientsResult,
    totalClientsResult,
    dishesResult,
    menusResult,
  ] = await Promise.allSettled([
    getActiveWeek(),
    listWeeks({ status: "draft", page: 1, pageSize: 1 }),
    listClients({ active: true, page: 1, pageSize: 1 }),
    listClients({ page: 1, pageSize: 1 }),
    listDishes({ active: true, page: 1, pageSize: 1 }),
    listMenus({ active: true, page: 1, pageSize: 1 }),
  ]);

  const activeWeek =
    activeWeekResult.status === "fulfilled" ? activeWeekResult.value : null;

  let activeWeekSummary: ActiveWeekSummary | null = null;

  if (activeWeek) {
    const [
      totalsResult,
      expectedCountResult,
      unansweredResult,
      cancellationsResult,
    ] = await Promise.allSettled([
      getOrderTotals({ weekId: activeWeek.id }),
      getExpectedClientCount(activeWeek.id),
      getUnansweredClients(activeWeek.id, { page: 1, pageSize: 1 }),
      listCancellations({ weekId: activeWeek.id, page: 1, pageSize: 1 }),
    ]);

    const totals =
      totalsResult.status === "fulfilled"
        ? totalsResult.value
        : { orderCount: 0, totalQuantity: 0, totalAmount: 0 };

    const expectedClientCount =
      expectedCountResult.status === "fulfilled"
        ? expectedCountResult.value
        : 0;

    const unansweredClientCount =
      unansweredResult.status === "fulfilled" ? unansweredResult.value.total : 0;

    const cancellationCount =
      cancellationsResult.status === "fulfilled"
        ? cancellationsResult.value.total
        : 0;

    activeWeekSummary = {
      week: activeWeek,
      totals,
      expectedClientCount,
      unansweredClientCount,
      cancellationCount,
    };
  }

  const hasDraftWeek =
    draftWeeksResult.status === "fulfilled" && draftWeeksResult.value.total > 0;

  const counts: DashboardCatalogCounts = {
    activeClients:
      activeClientsResult.status === "fulfilled"
        ? activeClientsResult.value.total
        : 0,
    totalClients:
      totalClientsResult.status === "fulfilled"
        ? totalClientsResult.value.total
        : 0,
    activeDishes:
      dishesResult.status === "fulfilled" ? dishesResult.value.total : 0,
    activeMenus:
      menusResult.status === "fulfilled" ? menusResult.value.total : 0,
  };

  return {
    activeWeek: activeWeekSummary,
    hasDraftWeek,
    counts,
  };
}
