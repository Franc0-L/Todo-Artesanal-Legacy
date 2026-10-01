import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MenuDrawer } from "./MenuDrawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { listMenus } from "./services/menus.service";
import type { Menu } from "./types/menu";
import type { MenuListItem } from "./types/menu-list";
import "./menus.css";
import "./menu-details.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
type StatusFilter = "all" | "active" | "inactive";

export function MenusPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Los resultados se guardan junto a la clave de la consulta que los pidió:
  // `items`, `total`, `loading` y `error` se derivan en el render. Así el
  // efecto no sincroniza estado antes de pedir los datos y nunca se muestra
  // el listado de un filtro, página o error anteriores.
  const requestKey = `${page}|${search}|${statusFilter}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    items: MenuListItem[];
    total: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const items = result?.key === requestKey ? result.items : [];
  const total = result?.key === requestKey ? result.total : 0;
  const error = failure?.key === requestKey ? failure.message : null;

  const searchDebounceRef = useRef<number | null>(null);

  // `reload` vuelve a consultar con los mismos filtros: se usa cuando hay que
  // refrescar el listado sin cambiar la clave por otro motivo.
  const reload = useCallback(() => setReloadToken((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    void listMenus({
      search: search || undefined,
      active: statusFilter === "all" ? undefined : statusFilter === "active",
      page,
      pageSize: PAGE_SIZE,
    })
      .then((loaded) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: loaded.items, total: loaded.total });
        setFailure(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: [], total: 0 });
        setFailure({
          key: requestKey,
          message:
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar los menús.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [page, requestKey, search, statusFilter]);

  // Actualiza el listado ya cargado (por ejemplo tras guardar en el drawer)
  // sin disparar una consulta nueva.
  const patchItems = useCallback(
    (updater: (current: MenuListItem[]) => MenuListItem[]) => {
      setResult((current) =>
        current && current.key === requestKey
          ? { ...current, items: updater(current.items) }
          : current,
      );
    },
    [requestKey],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedMenuId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleMenuCreated = useCallback(
    (created: Menu) => {
      setCreateDrawerOpen(false);
      setSelectedMenuId(created.id);
      setPage(1);
      // `reload` fuerza la consulta aunque ya estuviéramos en la página 1 con
      // los mismos filtros (cambiar `page` a 1 no alcanzaría).
      reload();
    },
    [reload],
  );

  const handleMenuSaved = useCallback(
    (updated: Menu) => {
      patchItems((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, active: updated.active } : item,
        ),
      );
    },
    [patchItems],
  );

  // Se dispara al crear una nueva versión desde el drawer: nombre y
  // cantidad de ítems del listado dependen de la versión, no de la
  // identidad del menú.
  const handleVersionCreated = useCallback(
    (menuId: string, name: string, itemCount: number) => {
      patchItems((current) =>
        current.map((item) =>
          item.id === menuId ? { ...item, name, itemCount } : item,
        ),
      );
    },
    [patchItems],
  );

  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleStatusChange(value: StatusFilter) {
    setPage(1);
    setStatusFilter(value);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="menus-page" aria-labelledby="menus-title">
      <header className="menus-page__header">
        <div className="menus-page__heading-row">
          <div>
            <p className="menus-page__eyebrow">Administración</p>
            <h1 id="menus-title">Menús</h1>
            <p className="menus-page__description">
              Combiná platos en menús: un plato principal y, opcionalmente, una
              o más guarniciones.
            </p>
          </div>
          <button
            className="menus-primary-action"
            type="button"
            onClick={() => {
              setSelectedMenuId(null);
              setCreateDrawerOpen(true);
            }}
          >
            Nuevo menú
          </button>
        </div>
      </header>

      <div className="menus-toolbar">
        <form className="menus-search" onSubmit={handleSearchSubmit}>
          <label htmlFor="menu-search">Buscar</label>
          <div className="menus-search__controls">
            <input
              id="menu-search"
              name="search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Nombre del menú"
            />
            <button type="submit">Buscar</button>
          </div>
        </form>

        <div className="menus-filter">
          <label htmlFor="menu-status">Estado</label>
          <select
            id="menu-status"
            value={statusFilter}
            onChange={(event) =>
              handleStatusChange(event.target.value as StatusFilter)
            }
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="menus-feedback menus-feedback--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      <div className="menus-list-wrapper" aria-busy={loading}>
        {loading ? (
          <p className="menus-feedback">Cargando menús…</p>
        ) : items.length === 0 ? (
          <EmptyState
            mascot="preparacion"
            title="No hay menús para mostrar"
            description={
              search || statusFilter !== "all"
                ? "Probá cambiar la búsqueda o el filtro."
                : "Todavía no hay menús registrados."
            }
          />
        ) : (
          <>
            <div className="menus-list-header" aria-hidden="true">
              <span>Nombre</span>
              <span>Ítems</span>
              <span>Estado</span>
            </div>
            <ul className="menus-list" aria-label="Listado de menús">
              {items.map((menu) => (
                <li key={menu.id}>
                  <button
                    className="menu-row"
                    type="button"
                    onClick={() => setSelectedMenuId(menu.id)}
                    aria-label={`Abrir ficha de ${menu.name ?? "menú sin versión"}`}
                  >
                    <strong>{menu.name ?? "Sin nombre"}</strong>
                    <span>
                      {menu.itemCount} plato{menu.itemCount === 1 ? "" : "s"}
                    </span>
                    <span>
                      <span
                        className={`menus-status menus-status--${
                          menu.active ? "active" : "inactive"
                        }`}
                      >
                        {menu.active ? "Activo" : "Inactivo"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!loading && total > 0 && (
        <nav className="menus-pagination" aria-label="Paginación de menús">
          <span>
            Página {page} de {totalPages} · {total} menú{total === 1 ? "" : "s"}
          </span>
          <div>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </button>
          </div>
        </nav>
      )}

      {/* El `key` remonta el drawer al cambiar de menú o de modo: el
          formulario arranca limpio sin resetear estado dentro de un efecto. */}
      <MenuDrawer
        key={createDrawerOpen ? "create" : `edit:${selectedMenuId ?? "closed"}`}
        mode={createDrawerOpen ? "create" : "edit"}
        menuId={createDrawerOpen ? null : selectedMenuId}
        onClose={handleCloseDrawer}
        onCreated={handleMenuCreated}
        onSaved={handleMenuSaved}
        onVersionCreated={handleVersionCreated}
      />
    </section>
  );
}
