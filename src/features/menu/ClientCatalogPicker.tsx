import { useEffect, useState } from "react";
import { listClientCatalog } from "./services/menu-catalog.service";
import { actionErrorMessage } from "./menu-errors";
import type { CatalogItem } from "./services/menu-catalog.service";
import type { MenuClient } from "./types/client-session";

interface ClientCatalogPickerProps {
  client: MenuClient;
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}

/**
 * Buscador del catálogo activo (platos y menús) para la media vianda libre.
 *
 * Carga una sola vez al abrirse y filtra en memoria por nombre. El
 * resultado vive junto a su estado (`null` = todavía no llegó), así que
 * `loading` se deriva en el render y el efecto solo fija estado en sus
 * callbacks (regla `react-hooks/set-state-in-effect`).
 */
export function ClientCatalogPicker({
  client,
  onPick,
  onClose,
}: ClientCatalogPickerProps) {
  const [result, setResult] = useState<CatalogItem[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    void listClientCatalog(client)
      .then((items) => {
        if (!cancelled) setResult(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(actionErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const loading = result === null && failure === null;
  const normalized = query.trim().toLowerCase();
  const items = (result ?? []).filter(
    (item) => normalized === "" || item.name.toLowerCase().includes(normalized),
  );

  return (
    <div className="client-catalog">
      <div className="client-catalog__header">
        <span className="client-catalog__title">Elegí del catálogo</span>
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <input
        type="search"
        className="client-catalog__search"
        value={query}
        placeholder="Buscar plato o menú…"
        onChange={(event) => setQuery(event.target.value)}
      />

      {loading && <p className="client-catalog__hint">Cargando catálogo…</p>}

      {failure && (
        <p className="client-catalog__error" role="alert">
          {failure}
        </p>
      )}

      {!loading && !failure && items.length === 0 && (
        <p className="client-catalog__hint">No hay productos que coincidan.</p>
      )}

      {items.length > 0 && (
        <ul className="client-catalog__list">
          {items.map((item) => (
            <li key={`${item.type}:${item.versionId}`}>
              <button type="button" onClick={() => onPick(item)}>
                <span className="client-catalog__name">{item.name}</span>
                <span className="client-menu__chip">
                  {item.type === "dish" ? "Plato" : "Menú"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
