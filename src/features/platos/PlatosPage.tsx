import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DishDrawer } from "./DishDrawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { listDishes } from "./services/dishes.service";
import type { Climate } from "../../types/domain";
import type { Dish } from "./types/dish";
import type { DishListItem } from "./types/dish-list";
import "./dishes.css";
import "./dish-details.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
type StatusFilter = "all" | "active" | "inactive";
type ClimateFilter = "" | Climate;
const CLIMATE_LABELS: Record<Climate, string> = { frio: "Frío", templado: "Templado", calor: "Calor" };

export function PlatosPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [category, setCategory] = useState("");
  const [climateFilter, setClimateFilter] = useState<ClimateFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Los resultados se guardan junto a la clave de la consulta que los pidió:
  // `items`, `total`, `loading` y `error` se derivan en el render. Así el
  // efecto no sincroniza estado antes de pedir los datos y nunca se muestra
  // el listado de un filtro, página o error anteriores.
  const requestKey = `${page}|${search}|${category}|${climateFilter}|${statusFilter}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    items: DishListItem[];
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
  const filterDebounceRef = useRef<number | null>(null);

  // `reload` vuelve a consultar con los mismos filtros: se usa cuando hay que
  // refrescar el listado sin cambiar la clave por otro motivo.
  const reload = useCallback(() => setReloadToken((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    void listDishes({ search: search || undefined, category: category || undefined, climate: climateFilter || undefined, active: statusFilter === "all" ? undefined : statusFilter === "active", page, pageSize: PAGE_SIZE })
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
          message: loadError instanceof Error ? loadError.message : "No se pudieron cargar los platos.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [category, climateFilter, page, requestKey, search, statusFilter]);

  // Actualiza el listado ya cargado (por ejemplo tras guardar en el drawer)
  // sin disparar una consulta nueva.
  const patchItems = useCallback(
    (updater: (current: DishListItem[]) => DishListItem[]) => {
      setResult((current) =>
        current && current.key === requestKey
          ? { ...current, items: updater(current.items) }
          : current,
      );
    },
    [requestKey],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedDishId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleDishCreated = useCallback((created: Dish) => {
    setCreateDrawerOpen(false);
    setSelectedDishId(created.id);
    setPage(1);
    // `reload` fuerza la consulta aunque ya estuviéramos en la página 1 con
    // los mismos filtros (cambiar `page` a 1 no alcanzaría).
    reload();
  }, [reload]);

  const handleDishSaved = useCallback((updated: Dish) => {
    patchItems((current) => current.map((item) => item.id === updated.id ? { ...item, category: updated.category, climate: updated.climate, active: updated.active } : item));
  }, [patchItems]);

  const handleVersionCreated = useCallback((dishId: string, name: string) => {
    patchItems((current) => current.map((item) => item.id === dishId ? { ...item, name } : item));
  }, [patchItems]);

  useEffect(() => {
    if (filterDebounceRef.current !== null) window.clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
      setCategory(categoryInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (filterDebounceRef.current !== null) window.clearTimeout(filterDebounceRef.current); };
  }, [searchInput, categoryInput]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filterDebounceRef.current !== null) { window.clearTimeout(filterDebounceRef.current); filterDebounceRef.current = null; }
    setPage(1);
    setSearch(searchInput.trim());
    setCategory(categoryInput.trim());
  }
  function handleClimateChange(value: ClimateFilter) { setPage(1); setClimateFilter(value); }
  function handleStatusChange(value: StatusFilter) { setPage(1); setStatusFilter(value); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = search !== "" || category !== "" || climateFilter !== "" || statusFilter !== "all";

  return (
    <section className="platos-page" aria-labelledby="platos-title">
      <header className="platos-page__header">
        <div className="platos-page__heading-row">
          <div>
            <p className="platos-page__eyebrow">Administración</p>
            <h1 id="platos-title">Platos</h1>
            <p className="platos-page__description">Gestioná el catálogo de platos y sus versiones. Editar nombre o precio crea una versión nueva; la anterior queda intacta.</p>
          </div>
          <button className="platos-primary-action" type="button" onClick={() => { setSelectedDishId(null); setCreateDrawerOpen(true); }}>Nuevo plato</button>
        </div>
      </header>
      <div className="platos-toolbar">
        <form className="platos-search" onSubmit={handleSearchSubmit}>
          <div className="platos-search__field"><label htmlFor="dish-search">Buscar</label><input id="dish-search" name="search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nombre del plato" /></div>
          <div className="platos-search__field"><label htmlFor="dish-category">Categoría</label><input id="dish-category" name="category" type="text" value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Ej: Principal" /></div>
          <button type="submit">Buscar</button>
        </form>
        <div className="platos-filter"><label htmlFor="dish-climate">Clima</label><select id="dish-climate" value={climateFilter} onChange={(event) => handleClimateChange(event.target.value as ClimateFilter)}><option value="">Todos</option><option value="frio">Frío</option><option value="templado">Templado</option><option value="calor">Calor</option></select></div>
        <div className="platos-filter"><label htmlFor="dish-status">Estado</label><select id="dish-status" value={statusFilter} onChange={(event) => handleStatusChange(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div>
      </div>
      {error && <div className="platos-feedback platos-feedback--error" role="alert"><p>{error}</p><button type="button" onClick={reload}>Reintentar</button></div>}
      <div className="platos-list-wrapper" aria-busy={loading}>
        {loading ? <p className="platos-feedback">Cargando platos…</p> : items.length === 0 ? <EmptyState mascot="cocinando" title="No hay platos para mostrar" description={hasActiveFilters ? "Probá cambiar la búsqueda o los filtros." : "Todavía no hay platos registrados."} /> : <>
          <div className="platos-list-header" aria-hidden="true"><span>Nombre</span><span>Categoría</span><span>Clima</span><span>Estado</span></div>
          <ul className="platos-list" aria-label="Listado de platos">{items.map((dish) => <li key={dish.id}><button className="dish-row" type="button" onClick={() => setSelectedDishId(dish.id)} aria-label={`Abrir ficha de ${dish.name ?? "plato sin versión"}`}><strong>{dish.name ?? "Sin nombre"}</strong><span>{dish.category ?? "—"}</span><span>{dish.climate ? CLIMATE_LABELS[dish.climate] : "Sin preferencia"}</span><span><span className={`platos-status platos-status--${dish.active ? "active" : "inactive"}`}>{dish.active ? "Activo" : "Inactivo"}</span></span></button></li>)}</ul>
        </>}
      </div>
      {!loading && total > 0 && <nav className="platos-pagination" aria-label="Paginación de platos"><span>Página {page} de {totalPages} · {total} plato{total === 1 ? "" : "s"}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></nav>}
      {/* El `key` remonta el drawer al cambiar de plato o de modo: el
          formulario arranca limpio sin resetear estado dentro de un efecto. */}
      <DishDrawer key={createDrawerOpen ? "create" : `edit:${selectedDishId ?? "closed"}`} mode={createDrawerOpen ? "create" : "edit"} dishId={createDrawerOpen ? null : selectedDishId} onClose={handleCloseDrawer} onCreated={handleDishCreated} onSaved={handleDishSaved} onVersionCreated={handleVersionCreated} />
    </section>
  );
}
