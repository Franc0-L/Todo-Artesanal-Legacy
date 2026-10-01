import type { Week } from "../../semanas/types/week";
import type { OrderTotals } from "../../pedidos/types/order-totals";

export interface ActiveWeekSummary {
  week: Week;
  totals: OrderTotals;
  expectedClientCount: number;
  unansweredClientCount: number;
  cancellationCount: number;
}

export interface DashboardCatalogCounts {
  activeClients: number;
  totalClients: number;
  activeDishes: number;
  activeMenus: number;
}

export interface DashboardSummary {
  activeWeek: ActiveWeekSummary | null;
  hasDraftWeek: boolean;
  counts: DashboardCatalogCounts;
}
