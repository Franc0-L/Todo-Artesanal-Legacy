import { useCallback, useEffect, useState } from "react";
import { getClient } from "../clientes/services/clients.service";
import { listCancellations } from "../cancelaciones/services/cancellations.service";
import { listOrders } from "../pedidos/services/orders.service";
import { getActiveWeek } from "../semanas/services/weeks.service";
import { getWeekOffer } from "../semanas/services/week-offer.service";
import { getEffectivePrice } from "./services/menu-pricing.service";
import { dataErrorMessage } from "./menu-errors";
import { priceKey, type ClientMenuData } from "./types/menu-data";
import type { MenuClient } from "./types/client-session";
import type { WeekOffer } from "../semanas/types/week-offer";

const PAGE_SIZE = 100;

export interface ClientWeekDataState {
  /**
   * Clave de la consulta vigente (`sessionId|reloadToken`). `null`
   * mientras no hay sesión resuelta.
   */
  requestKey: string | null;
  loading: boolean;
  error: string | null;
  /** `null` = sin semana activa (es un estado válido). */
  data: ClientMenuData | null;
  reload: () => void;
}

/**
 * Carga todo el estado de la semana activa para `/menu/:token`:
 * oferta, pedidos y cancelaciones propias, ficha del cliente y precios
 * efectivos.
 *
 * Sigue el patrón del repo (`react-hooks/set-state-in-effect`): el efecto
 * solo dispara la consulta y fija estado dentro de sus callbacks, y el
 * `loading`/`error` se derivan comparando la clave vigente con la del
 * resultado. Los refrescos (post crear/editar/borrar) incrementan el
 * `reloadToken` con `reload()`, nunca llaman al loader desde un evento.
 */
export function useClientWeekData(
  client: MenuClient | null,
  clientId: string | null,
  sessionId: string | null,
): ClientWeekDataState {
  const [result, setResult] = useState<{
    key: string;
    data: ClientMenuData | null;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey =
    sessionId === null || clientId === null
      ? null
      : `${sessionId}|${reloadToken}`;

  useEffect(() => {
    if (!client || clientId === null || requestKey === null) return;
    const key = requestKey;
    let cancelled = false;

    void loadMenuData(client, clientId)
      .then((data) => {
        if (!cancelled) {
          setFailure(null);
          setResult({ key, data });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure({ key, message: dataErrorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [client, clientId, requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const error =
    requestKey !== null && failure?.key === requestKey ? failure.message : null;
  const loading = requestKey !== null && !error && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  return { requestKey, loading, error, data, reload };
}

async function loadMenuData(
  client: MenuClient,
  clientId: string,
): Promise<ClientMenuData | null> {
  const week = await getActiveWeek(client);
  if (!week) return null;

  const [offer, ordersResult, cancellationsResult, clientRow] =
    await Promise.all([
      getWeekOffer(week.id, client),
      listOrders({ clientId, weekId: week.id, pageSize: PAGE_SIZE }, client),
      listCancellations(
        { clientId, weekId: week.id, pageSize: PAGE_SIZE },
        client,
      ),
      getClient(clientId, client),
    ]);

  const prices = await loadOfferPrices(
    offer,
    clientRow?.allowsHalfPortion ?? false,
    client,
  );

  return {
    week,
    offer,
    orders: ordersResult.items,
    cancellations: cancellationsResult.items,
    client: clientRow,
    prices,
  };
}

/**
 * Precio efectivo de cada opción de la oferta (y su media vianda cuando
 * corresponde). Un fallo de precio no debe tumbar la pantalla: se omiten
 * las entradas que fallen y la UI muestra "—".
 */
async function loadOfferPrices(
  offer: WeekOffer,
  allowsHalfPortion: boolean,
  client: MenuClient,
): Promise<Record<string, number>> {
  const requests = offer.days.flatMap((day) =>
    day.options.flatMap((option) => {
      const pending: Promise<readonly [string, number]>[] = [
        loadOptionPrice(option.id, option.offerModality, client),
      ];
      if (allowsHalfPortion) {
        pending.push(loadOptionPrice(option.id, "media_vianda", client));
      }
      return pending;
    }),
  );

  const settled = await Promise.allSettled(requests);
  const prices: Record<string, number> = {};
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      const [key, value] = entry.value;
      prices[key] = value;
    }
  }

  return prices;
}

async function loadOptionPrice(
  optionId: string,
  modality: "general" | "opcional" | "media_vianda",
  client: MenuClient,
): Promise<readonly [string, number]> {
  const value = await getEffectivePrice(
    { weekDayOptionId: optionId, modality },
    client,
  );
  return [priceKey(optionId, modality), value] as const;
}
