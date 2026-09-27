import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../../lib/formatters";
import { listDishes } from "../platos/services/dishes.service";
import { listDishVersions } from "../platos/services/dish-versions.service";
import {
  getClientPrices,
  removeClientPrice,
  removeClientProductPrice,
  setClientPrice,
  setClientProductPrice,
} from "./services/client-prices.service";
import type { ClientPrices } from "./types/client-price";
import type { DishListItem } from "../platos/types/dish-list";
import "./client-pricing.css";

interface ClientPricingSectionProps {
  clientId: string;
  disabled?: boolean;
}
interface ProductDraft {
  dishId: string;
  price: string;
}
const EMPTY_PRICES: ClientPrices = {
  general: null,
  opcional: null,
  products: [],
};

export function ClientPricingSection({
  clientId,
  disabled = false,
}: ClientPricingSectionProps) {
  const [prices, setPrices] = useState<ClientPrices>(EMPTY_PRICES);
  const [dishes, setDishes] = useState<DishListItem[]>([]);
  const [dishSearch, setDishSearch] = useState("");
  const [general, setGeneral] = useState("");
  const [opcional, setOpcional] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft>({
    dishId: "",
    price: "",
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dishNames, setDishNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    function init() {
      setLoading(true);
      setError(null);
      setMessage(null);
    }
    init();

    void Promise.all([
      getClientPrices(clientId),
      listDishes({ active: true, page: 1, pageSize: 100 }),
    ])
      .then(async ([clientPrices, dishResult]) => {
        if (cancelled) return;
        setPrices(clientPrices);
        setGeneral(
          clientPrices.general ? String(clientPrices.general.price) : "",
        );
        setOpcional(
          clientPrices.opcional ? String(clientPrices.opcional.price) : "",
        );
        setDishes(dishResult.items);
        const names: Record<string, string> = {};
        for (const product of clientPrices.products) {
          const visible = dishResult.items.find(
            (dish) => dish.id === product.dishId,
          );
          if (visible?.name) {
            names[product.dishId] = visible.name;
            continue;
          }
          try {
            const versions = await listDishVersions(product.dishId);
            if (!cancelled && versions[0])
              names[product.dishId] = versions[0].name;
          } catch {
            /* El precio sigue siendo válido aunque no se pueda cargar el nombre. */
          }
        }
        if (!cancelled) setDishNames(names);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los precios especiales.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const filteredDishes = useMemo(() => {
    const normalized = dishSearch.trim().toLocaleLowerCase();
    if (!normalized) return dishes;
    return dishes.filter((dish) =>
      (dish.name ?? "").toLocaleLowerCase().includes(normalized),
    );
  }, [dishSearch, dishes]);

  const savePrice = async (modality: "general" | "opcional", value: string) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) {
      setError("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const key = `modality:${modality}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      const saved = await setClientPrice({ clientId, modality, price });
      setPrices((current) => ({ ...current, [modality]: saved }));
      setMessage("Precio especial guardado.");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el precio.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const removePrice = async (modality: "general" | "opcional") => {
    const key = `modality:${modality}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      await removeClientPrice(clientId, modality);
      setPrices((current) => ({ ...current, [modality]: null }));
      if (modality === "general") setGeneral("");
      else setOpcional("");
      setMessage("Precio especial eliminado.");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar el precio.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const saveProductPrice = async () => {
    const { dishId, price: rawPrice } = productDraft;
    const price = Number(rawPrice);
    if (!dishId) {
      setError("Seleccioná un plato.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("El precio debe ser un número mayor o igual a 0.");
      return;
    }
    const key = `dish:${dishId}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      const saved = await setClientProductPrice({ clientId, dishId, price });
      setPrices((current) => ({
        ...current,
        products: [
          ...current.products.filter((item) => item.dishId !== dishId),
          saved,
        ],
      }));
      const dish = dishes.find((item) => item.id === dishId);
      if (dish?.name)
        setDishNames((current) => ({ ...current, [dishId]: dish.name! }));
      setProductDraft({ dishId: "", price: "" });
      setMessage("Precio especial por plato guardado.");
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar el precio del plato.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const removeProductPrice = async (dishId: string) => {
    const key = `dish:${dishId}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      await removeClientProductPrice(clientId, dishId);
      setPrices((current) => ({
        ...current,
        products: current.products.filter((item) => item.dishId !== dishId),
      }));
      setMessage("Precio especial por plato eliminado.");
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo eliminar el precio del plato.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section
      className="client-drawer__section client-pricing"
      aria-labelledby="client-pricing-title"
    >
      <div className="client-drawer__section-heading">
        <div>
          <h3 id="client-pricing-title">Precios especiales</h3>
          <p>
            Se aplican al calcular pedidos nuevos. Los precios históricos no se
            modifican.
          </p>
        </div>
      </div>
      {loading && <p className="clients-feedback">Cargando precios…</p>}
      {error && (
        <p
          className="client-link-feedback client-link-feedback--error"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="client-form__success" role="status">
          {message}
        </p>
      )}
      {!loading && (
        <>
          <div className="client-pricing__grid">
            {(
              [
                ["general", "General", general, setGeneral],
                ["opcional", "Opcional", opcional, setOpcional],
              ] as const
            ).map(([modality, label, value, setter]) => (
              <div className="client-pricing__card" key={modality}>
                <label>
                  {label}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    disabled={disabled || savingKey !== null}
                  />
                </label>
                <div className="client-pricing__actions">
                  <button
                    type="button"
                    disabled={
                      disabled || savingKey !== null || value.trim() === ""
                    }
                    onClick={() => void savePrice(modality, value)}
                  >
                    {savingKey === `modality:${modality}`
                      ? "Guardando…"
                      : "Guardar"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      disabled || savingKey !== null || !prices[modality]
                    }
                    onClick={() => void removePrice(modality)}
                  >
                    Quitar
                  </button>
                </div>
                {prices[modality] && (
                  <small>
                    Configurado: {formatCurrency(prices[modality]!.price)}
                  </small>
                )}
              </div>
            ))}
          </div>
          <div className="client-pricing__products">
            <h4>Precio especial por plato</h4>
            <p>
              Este precio tiene prioridad sobre el precio general del cliente
              para ese plato.
            </p>
            <label>
              Buscar plato
              <input
                type="search"
                value={dishSearch}
                onChange={(event) => setDishSearch(event.target.value)}
                placeholder="Nombre del plato"
              />
            </label>
            <label>
              Plato
              <select
                value={productDraft.dishId}
                onChange={(event) =>
                  setProductDraft((current) => ({
                    ...current,
                    dishId: event.target.value,
                  }))
                }
                disabled={disabled || savingKey !== null}
              >
                <option value="">Seleccionar plato…</option>
                {filteredDishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name ?? "Sin nombre"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio especial
              <input
                type="number"
                min={0}
                step="0.01"
                value={productDraft.price}
                onChange={(event) =>
                  setProductDraft((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                disabled={disabled || savingKey !== null}
              />
            </label>
            <button
              type="button"
              disabled={disabled || savingKey !== null}
              onClick={() => void saveProductPrice()}
            >
              {savingKey?.startsWith("dish:")
                ? "Guardando…"
                : "Guardar precio por plato"}
            </button>
            {prices.products.length === 0 ? (
              <p className="clients-feedback">
                No hay precios especiales por plato.
              </p>
            ) : (
              <ul className="client-pricing__product-list">
                {prices.products.map((product) => (
                  <li key={product.dishId}>
                    <div>
                      <strong>{dishNames[product.dishId] ?? "Plato"}</strong>
                      <span>{formatCurrency(product.price)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={disabled || savingKey !== null}
                      onClick={() => void removeProductPrice(product.dishId)}
                    >
                      {savingKey === `dish:${product.dishId}`
                        ? "Quitando…"
                        : "Quitar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
