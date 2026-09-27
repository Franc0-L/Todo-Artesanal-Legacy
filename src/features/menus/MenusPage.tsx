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
  const [items, setItems] = useState<MenuListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchDebounceRef = useRef<number | null>(null);

  const loadMenus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listMenus({
        search: search || undefined,
        active: statusFilter === "all" ? undefined : statusFilter === "active",
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      setItems([]);
      setTotal(0);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los menús.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedMenuId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleMenuCreated = useCallback(
    (created: Menu) => {
      setCreateDrawerOpen(false);
      setSelectedMenuId(created.id);
      setPage(1);
      void loadMenus();
    },
    [loadMenus],
  );

  const handleMenuSaved = useCallback((updated: Menu) => {
    setItems((current) =>
      current.map((item) =>
        item.id === updated.id ? { ...item, active: updated.active } : item,
      ),
    );
  }, []);

  // Se dispara al crear una nueva versión desde el drawer: nombre y
  // cantidad de ítems del listado dependen de la versión, no de la
  // identidad del menú.
  const handleVersionCreated = useCallback(
    (menuId: string, name: string, itemCount: number) => {
      setItems((current) =>
        current.map((item) =>
          item.id === menuId ? { ...item, name, itemCount } : item,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    function run() {
      void loadMenus();
    }
    run();
  }, [loadMenus]);

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
          <button type="button" onClick={() => void loadMenus()}>
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

      <MenuDrawer
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
