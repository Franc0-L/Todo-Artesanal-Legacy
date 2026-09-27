import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createMenu, getMenu, setMenuActive } from "./services/menus.service";
import {
  createMenuVersion,
  listMenuVersions,
} from "./services/menu-versions.service";
import { listDishes } from "../platos/services/dishes.service";
import { listDishVersions } from "../platos/services/dish-versions.service";
import { getDishSuggestions } from "../platos/services/dish-usage.service";
import {
  buildMenuName,
  buildMenuPrice,
  compositionSignature,
  suggestComposition,
  type MenuCompositionItem,
  type SuggestionDish,
} from "./menu-suggest";
import { formatCurrency, formatDate } from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type { MenuItemRole } from "../../types/domain";
import type {
  CreateMenuInput,
  Menu,
  MenuWithCurrentVersion,
} from "./types/menu";
import type {
  CreateMenuVersionInput,
  MenuVersionSummary,
} from "./types/menu-version";
import type { DishListItem } from "../platos/types/dish-list";

interface MenuDrawerProps {
  mode: "create" | "edit";
  menuId: string | null;
  onClose: () => void;
  onCreated: (menu: Menu) => void;
  onSaved: (menu: Menu) => void;
  onVersionCreated: (menuId: string, name: string, itemCount: number) => void;
}

interface VersionFormState {
  name: string;
  price: string;
}

/** Item de la composición: la forma local es la misma que la del helper. */
type ComposerItem = MenuCompositionItem;

const EMPTY_VERSION_FORM: VersionFormState = { name: "", price: "" };
const DISH_SEARCH_DEBOUNCE_MS = 350;
const DISH_SEARCH_PAGE_SIZE = 8;

function serializeComposer(items: ComposerItem[]): string {
  return items
    .map((item) => `${item.role}:${item.dishVersionId}`)
    .sort()
    .join("|");
}

export function MenuDrawer({
  mode,
  menuId,
  onClose,
  onCreated,
  onSaved,
  onVersionCreated,
}: MenuDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<MenuWithCurrentVersion | null>(null);
  const [versions, setVersions] = useState<MenuVersionSummary[]>([]);

  const [versionForm, setVersionForm] =
    useState<VersionFormState>(EMPTY_VERSION_FORM);
  const [composerItems, setComposerItems] = useState<ComposerItem[]>([]);
  const [baselineVersionForm, setBaselineVersionForm] =
    useState<VersionFormState>(EMPTY_VERSION_FORM);
  const [baselineComposerItems, setBaselineComposerItems] = useState<
    ComposerItem[]
  >([]);

  // Cambia cada vez que el drawer se resetea (se abre para otro menú, o
  // se abre en modo creación). Forzamos con esto que el buscador de
  // platos vuelva a traer la lista por defecto, incluso si el término de
  // búsqueda quedó vacío de la vez anterior (mismo valor no dispara el
  // efecto por dependencias).
  const [composerSessionKey, setComposerSessionKey] = useState(0);

  const [dishQuery, setDishQuery] = useState("");
  const [dishResults, setDishResults] = useState<DishListItem[]>([]);
  const [dishSearchLoading, setDishSearchLoading] = useState(false);
  const [dishSearchError, setDishSearchError] = useState<string | null>(null);
  const [resolvingDishId, setResolvingDishId] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const dishSearchDebounceRef = useRef<number | null>(null);

  // Autocompletado y sugerencias de composición.
  const [suggesting, setSuggesting] = useState(false);
  const suggestionPoolRef = useRef<SuggestionDish[] | null>(null);
  const previousSuggestionRef = useRef<string | null>(null);
  // Último nombre/precio que puso el autocompletado: si el admin los cambió
  // a mano, no se vuelven a pisar al modificar la composición.
  const autoNameRef = useRef<string | null>(null);
  const autoPriceRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);

  const { confirm, confirmDialog } = useConfirm();

  const isCreateMode = mode === "create";
  const currentVersion = menu?.currentVersion ?? null;
  const mainItem = composerItems.find((item) => item.role === "main") ?? null;
  const sideItems = composerItems.filter((item) => item.role === "side");

  const dirty = isCreateMode
    ? versionForm.name.trim() !== "" ||
      versionForm.price.trim() !== "" ||
      composerItems.length > 0
    : versionForm.name !== baselineVersionForm.name ||
      versionForm.price !== baselineVersionForm.price ||
      serializeComposer(composerItems) !==
        serializeComposer(baselineComposerItems);

  function resetState() {
    setMenu(null);
    setVersions([]);
    setVersionForm(EMPTY_VERSION_FORM);
    setComposerItems([]);
    setBaselineVersionForm(EMPTY_VERSION_FORM);
    setBaselineComposerItems([]);
    setDishQuery("");
    setDishResults([]);
    setDishSearchError(null);
    setComposerError(null);
    setError(null);
    setVersionError(null);
    setVersionMessage(null);
    setSuggesting(false);
    suggestionPoolRef.current = null;
    previousSuggestionRef.current = null;
    autoNameRef.current = null;
    autoPriceRef.current = null;
    setComposerSessionKey((key) => key + 1);
  }

  useEffect(() => {
    function run() {
      if (isCreateMode) {
      resetState();
      setLoading(false);
      return;
    }

    if (!menuId) {
      resetState();
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    resetState();

    void Promise.all([getMenu(menuId), listMenuVersions(menuId)])
      .then(([menuResult, versionsResult]) => {
        if (cancelled) return;

        setMenu(menuResult);
        setVersions(versionsResult);

        const initialComposer: ComposerItem[] = (
          menuResult.currentVersion?.items ?? []
        ).map((item) => ({
          dishVersionId: item.dishVersion.id,
          dishId: item.dishVersion.dishId,
          name: item.dishVersion.name,
          price: item.dishVersion.price,
          role: item.role,
        }));

        const initialForm: VersionFormState = {
          name: menuResult.currentVersion?.name ?? "",
          price:
            menuResult.currentVersion?.price !== undefined
              ? String(menuResult.currentVersion.price)
              : "",
        };

        setComposerItems(initialComposer);
        setBaselineComposerItems(initialComposer);
        setVersionForm(initialForm);
        setBaselineVersionForm(initialForm);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la ficha del menú.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

      return () => {
        cancelled = true;
      };
    }
    return run();
  }, [menuId, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode && !menuId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuId, isCreateMode]);

  const requestClose = useCallback(async () => {
    if (dirty) {
      const proceed = await confirm({
        title: "Cambios sin guardar",
        message:
          "Hay cambios sin guardar en esta ficha. Si cerrás ahora, se van a perder.",
        confirmLabel: "Cerrar sin guardar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });

      if (!proceed) {
        return;
      }
    }

    onClose();
  }, [confirm, dirty, onClose]);

  useEffect(() => {
    if (!isCreateMode && !menuId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      void requestClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuId, isCreateMode, requestClose]);

  // Búsqueda de platos para armar la composición. Sin texto cargado
  // muestra directamente los primeros platos activos (sin esperar
  // debounce); con texto, espera una pausa de tipeo antes de buscar.
  // `composerSessionKey` fuerza un refetch cada vez que el drawer se
  // resetea, aunque el término de búsqueda ya estuviera vacío antes.
  useEffect(() => {
    if (dishSearchDebounceRef.current !== null) {
      window.clearTimeout(dishSearchDebounceRef.current);
    }

    const trimmed = dishQuery.trim();
    const delay = trimmed ? DISH_SEARCH_DEBOUNCE_MS : 0;

    function initSearch() {
      setDishSearchLoading(true);
      setDishSearchError(null);
    }
    initSearch();

    dishSearchDebounceRef.current = window.setTimeout(() => {
      void listDishes({
        search: trimmed || undefined,
        active: true,
        pageSize: DISH_SEARCH_PAGE_SIZE,
      })
        .then((result) => setDishResults(result.items))
        .catch((searchError: unknown) => {
          setDishResults([]);
          setDishSearchError(
            searchError instanceof Error
              ? searchError.message
              : "No se pudo buscar platos.",
          );
        })
        .finally(() => setDishSearchLoading(false));
    }, delay);

    return () => {
      if (dishSearchDebounceRef.current !== null) {
        window.clearTimeout(dishSearchDebounceRef.current);
      }
    };
  }, [dishQuery, composerSessionKey]);

  // Autocompletar nombre y precio a partir de la composición.
  //
  // Solo se pisa lo que no fue editado a mano: si el campo está vacío o
  // todavía guarda el valor que puso el autocompletado, se actualiza; si el
  // admin tipeó algo distinto, se respeta su texto.
  useEffect(() => {
    if (composerItems.length === 0) {
      return;
    }

    const name = buildMenuName(composerItems);
    const price = String(buildMenuPrice(composerItems));

    setVersionForm((current) => ({
      name:
        current.name.trim() === "" || current.name === autoNameRef.current
          ? name
          : current.name,
      price:
        current.price === "" || current.price === autoPriceRef.current
          ? price
          : current.price,
    }));

    autoNameRef.current = name;
    autoPriceRef.current = price;
  }, [composerItems]);

  function updateVersionField<K extends keyof VersionFormState>(
    field: K,
    value: VersionFormState[K],
  ) {
    setVersionForm((current) => ({ ...current, [field]: value }));
  }

  // Un plato en el listado ya trae su nombre (resuelto por el servicio a
  // partir de la última versión), pero para componer el menú necesitamos
  // el id de esa versión, que no viaja en DishListItem. Se resuelve acá,
  // en el momento de agregarlo.
  async function handleAddDish(dish: DishListItem, role: MenuItemRole) {
    setComposerError(null);
    setResolvingDishId(dish.id);

    try {
      const dishVersions = await listDishVersions(dish.id);
      const latest = dishVersions[0];

      if (!latest) {
        setComposerError(
          `${dish.name ?? "El plato"} no tiene versiones cargadas.`,
        );
        return;
      }

      setComposerItems((current) => {
        const alreadyPresent = current.some(
          (item) => item.dishVersionId === latest.id,
        );

        if (alreadyPresent) {
          setComposerError("Ese plato ya está en el menú.");
          return current;
        }

        const base =
          role === "main"
            ? current.filter((item) => item.role !== "main")
            : current;

        return [
          ...base,
          {
            dishVersionId: latest.id,
            dishId: dish.id,
            name: latest.name,
            price: latest.price,
            role,
          },
        ];
      });
    } catch (addError: unknown) {
      setComposerError(
        addError instanceof Error
          ? addError.message
          : "No se pudo agregar el plato.",
      );
    } finally {
      setResolvingDishId(null);
    }
  }

  function handleRemoveComposerItem(dishVersionId: string) {
    setComposerItems((current) =>
      current.filter((item) => item.dishVersionId !== dishVersionId),
    );
  }

  /**
   * Completa nombre y precio a partir de la composición actual.
   * No modifica la composición: solo llena los campos.
   */
  function handleAutocomplete() {
    if (composerItems.length === 0) {
      setComposerError("Agregá al menos un plato principal para autocompletar.");
      return;
    }

    setComposerError(null);

    const name = buildMenuName(composerItems);
    const price = String(buildMenuPrice(composerItems));

    autoNameRef.current = name;
    autoPriceRef.current = price;
    setVersionForm((current) => ({ ...current, name, price }));
  }

  /**
   * Propone una combinación de platos (1 principal + hasta 2 guarniciones),
   * reemplaza la composición y completa nombre y precio.
   *
   * Cada clic genera una combinación distinta a la anterior mientras haya
   * variedad en el catálogo. El catálogo se consulta una sola vez por
   * apertura del drawer; las versiones se resuelven recién al aplicar.
   */
  async function handleSuggestComposition() {
    if (suggesting) {
      return;
    }

    setSuggesting(true);
    setComposerError(null);

    try {
      if (!suggestionPoolRef.current) {
        const suggestions = await getDishSuggestions({ limit: 100 });
        const pool: SuggestionDish[] = suggestions
          .filter((item) => item.name.trim() !== "")
          .map((item) => ({
            dishId: item.dishId,
            name: item.name,
            uses: item.uses,
          }));

        suggestionPoolRef.current = pool;
      }

      const picked = suggestComposition(
        suggestionPoolRef.current,
        previousSuggestionRef.current,
      );

      if (!picked) {
        setComposerError("No hay platos activos para armar una sugerencia.");
        return;
      }

      const resolved = await Promise.all(
        picked.map(async (dish) => {
          const versions = await listDishVersions(dish.dishId);
          const latest = versions[0];

          if (!latest) {
            return null;
          }

          return {
            dishVersionId: latest.id,
            dishId: dish.dishId,
            name: latest.name,
            price: latest.price,
            role: dish.role,
          } satisfies MenuCompositionItem;
        }),
      );

      const items = resolved.filter(
        (item): item is MenuCompositionItem => item !== null,
      );

      if (!items.some((item) => item.role === "main")) {
        setComposerError(
          "La sugerencia no se pudo armar: algún plato no tiene versiones cargadas.",
        );
        return;
      }

      previousSuggestionRef.current = compositionSignature(items);
      setComposerItems(items);
    } catch (suggestError: unknown) {
      setComposerError(
        suggestError instanceof Error
          ? suggestError.message
          : "No se pudieron generar sugerencias.",
      );
    } finally {
      setSuggesting(false);
    }
  }

  function validateComposer(): string | null {
    const mainCount = composerItems.filter(
      (item) => item.role === "main",
    ).length;

    if (mainCount !== 1) {
      return "El menú debe tener exactamente un plato principal.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setError(null);

    const trimmedName = versionForm.name.trim();
    const priceValue = Number(versionForm.price);

    if (!trimmedName) {
      setError("El nombre es obligatorio.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError("El precio debe ser un número mayor o igual a 0.");
      return;
    }

    const composerValidationError = validateComposer();

    if (composerValidationError) {
      setError(composerValidationError);
      return;
    }

    setSaving(true);

    try {
      const input: CreateMenuInput = {
        name: trimmedName,
        price: priceValue,
        items: composerItems.map((item) => ({
          dishVersionId: item.dishVersionId,
          role: item.role,
        })),
      };

      const created = await createMenu(input);
      onCreated(created);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo crear el menú.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleActiveToggle() {
    if (!menu || statusSaving) {
      return;
    }

    const nextActive = !menu.active;

    const proceed = await confirm({
      title: nextActive ? "Activar menú" : "Desactivar menú",
      message: nextActive
        ? "¿Activar este menú? Volverá a estar disponible para incluir en la oferta."
        : "¿Desactivar este menú? Su historial se conservará y dejará de estar disponible para nuevas semanas.",
      confirmLabel: nextActive ? "Activar" : "Desactivar",
      tone: nextActive ? "default" : "danger",
    });

    if (!proceed) {
      return;
    }

    setStatusSaving(true);
    setError(null);

    try {
      const updated = await setMenuActive(menu.id, nextActive);
      setMenu((current) =>
        current ? { ...current, active: updated.active } : current,
      );
      onSaved(updated);
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "No se pudo actualizar el estado del menú.",
      );
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleCreateVersion() {
    if (!menu || versionSaving) {
      return;
    }

    setVersionError(null);
    setVersionMessage(null);

    const trimmedName = versionForm.name.trim();
    const priceValue = Number(versionForm.price);

    if (!trimmedName) {
      setVersionError("El nombre es obligatorio.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setVersionError("El precio debe ser un número mayor o igual a 0.");
      return;
    }

    const composerValidationError = validateComposer();

    if (composerValidationError) {
      setVersionError(composerValidationError);
      return;
    }

    setVersionSaving(true);

    try {
      const input: CreateMenuVersionInput = {
        name: trimmedName,
        price: priceValue,
        items: composerItems.map((item) => ({
          dishVersionId: item.dishVersionId,
          role: item.role,
        })),
      };

      const created = await createMenuVersion(menu.id, input);

      setMenu((current) =>
        current ? { ...current, currentVersion: created } : current,
      );
      setVersions((current) => [
        {
          id: created.id,
          menuId: created.menuId,
          versionNumber: created.versionNumber,
          name: created.name,
          price: created.price,
          createdAt: created.createdAt,
        },
        ...current,
      ]);

      const nextForm: VersionFormState = {
        name: created.name,
        price: String(created.price),
      };
      setVersionForm(nextForm);
      setBaselineVersionForm(nextForm);
      setBaselineComposerItems(composerItems);
      setVersionMessage(`Versión ${created.versionNumber} creada.`);
      onVersionCreated(menu.id, created.name, created.items.length);
    } catch (versionCreateError: unknown) {
      setVersionError(
        versionCreateError instanceof Error
          ? versionCreateError.message
          : "No se pudo crear la nueva versión.",
      );
    } finally {
      setVersionSaving(false);
    }
  }

  const open = isCreateMode || menuId !== null;

  if (!open) {
    return null;
  }

  const composerSection = (
    <>
      <div className="dish-form__fields">
        <label>
          Nombre
          <input
            type="text"
            value={versionForm.name}
            onChange={(event) => updateVersionField("name", event.target.value)}
            required={isCreateMode}
            autoFocus={isCreateMode}
          />
        </label>
        <label>
          Precio
          <input
            type="number"
            min={0}
            step="0.01"
            value={versionForm.price}
            onChange={(event) =>
              updateVersionField("price", event.target.value)
            }
            required={isCreateMode}
          />
        </label>
      </div>

      <div className="menu-composer">
        <label htmlFor="menu-dish-search">Agregar plato</label>
        <input
          id="menu-dish-search"
          type="search"
          value={dishQuery}
          onChange={(event) => setDishQuery(event.target.value)}
          placeholder="Buscar plato activo por nombre"
        />

        {dishSearchLoading && <p className="menu-composer__hint">Buscando…</p>}
        {!dishSearchLoading && dishSearchError && (
          <p className="menu-composer__hint menu-composer__hint--error">
            {dishSearchError}
          </p>
        )}
        {!dishSearchLoading && !dishSearchError && dishResults.length === 0 && (
          <p className="menu-composer__hint">
            {dishQuery.trim()
              ? "Sin resultados."
              : "No hay platos activos cargados."}
          </p>
        )}
        {!dishSearchLoading &&
          !dishSearchError &&
          dishQuery.trim() === "" &&
          dishResults.length > 0 && (
            <p className="menu-composer__hint">
              Mostrando los primeros platos activos. Escribí para filtrar.
            </p>
          )}

        {dishResults.length > 0 && (
          <ul className="menu-composer__results">
            {dishResults.map((dish) => (
              <li key={dish.id}>
                <span>{dish.name ?? "Sin nombre"}</span>
                <div className="menu-composer__results-actions">
                  <button
                    type="button"
                    onClick={() => void handleAddDish(dish, "main")}
                    disabled={resolvingDishId === dish.id}
                  >
                    Principal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddDish(dish, "side")}
                    disabled={resolvingDishId === dish.id}
                  >
                    Guarnición
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {composerError && (
          <div
            className="dish-link-feedback dish-link-feedback--error"
            role="alert"
          >
            {composerError}
          </div>
        )}

        <div className="menu-composer__composition">
          <h4>Composición</h4>

          {mainItem ? (
            <div className="menu-composer__item menu-composer__item--main">
              <span className="menu-composer__role-badge">Principal</span>
              <span className="menu-composer__item-name">{mainItem.name}</span>
              <span>{formatCurrency(mainItem.price)}</span>
              <button
                type="button"
                onClick={() => handleRemoveComposerItem(mainItem.dishVersionId)}
                aria-label={`Quitar ${mainItem.name}`}
              >
                ×
              </button>
            </div>
          ) : (
            <p className="menu-composer__empty">
              Todavía no hay plato principal.
            </p>
          )}

          {sideItems.length > 0 && (
            <ul className="menu-composer__sides">
              {sideItems.map((item) => (
                <li key={item.dishVersionId} className="menu-composer__item">
                  <span className="menu-composer__role-badge menu-composer__role-badge--side">
                    Guarnición
                  </span>
                  <span className="menu-composer__item-name">{item.name}</span>
                  <span>{formatCurrency(item.price)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveComposerItem(item.dishVersionId)}
                    aria-label={`Quitar ${item.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="menu-composer__suggest">
          <button
            type="button"
            onClick={handleAutocomplete}
            disabled={composerItems.length === 0}
          >
            Autocompletar nombre y precio
          </button>
          <button
            type="button"
            onClick={() => void handleSuggestComposition()}
            disabled={suggesting}
          >
            {suggesting ? "Armando sugerencia…" : "Sugerir mejores opciones"}
          </button>
          <p className="menu-composer__hint">
            La sugerencia reemplaza la composición (1 principal y hasta 2
            guarniciones) y completa nombre y precio. Cada clic genera otra
            combinación.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        className="dish-drawer__backdrop"
        onMouseDown={() => void requestClose()}
      >
        <aside
          className="dish-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-drawer-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="dish-drawer__header">
            <div>
              <p className="menus-page__eyebrow">
                {isCreateMode ? "Nuevo menú" : "Ficha de menú"}
              </p>
              <h2 id="menu-drawer-title">
                {isCreateMode ? "Crear menú" : (currentVersion?.name ?? "Menú")}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              className="dish-drawer__close"
              type="button"
              onClick={() => void requestClose()}
              aria-label={
                isCreateMode
                  ? "Cerrar creación de menú"
                  : "Cerrar ficha del menú"
              }
            >
              ×
            </button>
          </header>

          <div className="dish-drawer__body">
            {loading && <p className="menus-feedback">Cargando ficha…</p>}

            {!loading && error && (
              <div
                className="menus-feedback menus-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {!loading && isCreateMode && (
              <form className="dish-form" onSubmit={handleSubmit}>
                <p className="dish-form__hint">
                  El nombre y el precio pertenecen a la primera versión del
                  menú. La composición necesita exactamente un plato principal;
                  las guarniciones son opcionales.
                </p>
                {composerSection}
                <footer className="dish-form__actions">
                  <button
                    type="button"
                    onClick={() => void requestClose()}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving || !dirty}>
                    {saving ? "Creando…" : "Crear menú"}
                  </button>
                </footer>
              </form>
            )}

            {!loading && !isCreateMode && menu && (
              <div className="dish-form">
                <section
                  className="dish-form__summary"
                  aria-label="Estado del menú"
                >
                  <div className="dish-form__summary-main">
                    <span
                      className={`menus-status menus-status--${
                        menu.active ? "active" : "inactive"
                      }`}
                    >
                      {menu.active ? "Activo" : "Inactivo"}
                    </span>
                    <p>
                      {currentVersion
                        ? `Versión actual: v${currentVersion.versionNumber} — ${formatCurrency(currentVersion.price)}`
                        : "Sin versiones cargadas"}
                    </p>
                  </div>
                  <button
                    className="dish-form__status-action"
                    type="button"
                    onClick={() => void handleActiveToggle()}
                    disabled={statusSaving}
                  >
                    {statusSaving
                      ? "Actualizando…"
                      : menu.active
                        ? "Desactivar menú"
                        : "Activar menú"}
                  </button>
                </section>

                {currentVersion && (
                  <section
                    className="dish-drawer__section"
                    aria-labelledby="menu-current-title"
                  >
                    <div className="dish-drawer__section-heading">
                      <div>
                        <h3 id="menu-current-title">Composición actual</h3>
                        <p>
                          Versión v{currentVersion.versionNumber}, no editable.
                        </p>
                      </div>
                    </div>
                    <ul className="menu-composer__sides menu-composer__sides--readonly">
                      {currentVersion.items
                        .slice()
                        .sort((a, b) =>
                          a.role === "main" ? -1 : b.role === "main" ? 1 : 0,
                        )
                        .map((item) => (
                          <li key={item.id} className="menu-composer__item">
                            <span
                              className={`menu-composer__role-badge ${
                                item.role === "side"
                                  ? "menu-composer__role-badge--side"
                                  : ""
                              }`}
                            >
                              {item.role === "main"
                                ? "Principal"
                                : "Guarnición"}
                            </span>
                            <span className="menu-composer__item-name">
                              {item.dishVersion.name}
                            </span>
                            <span>
                              {formatCurrency(item.dishVersion.price)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                <section
                  className="dish-drawer__section"
                  aria-labelledby="menu-version-title"
                >
                  <div className="dish-drawer__section-heading">
                    <div>
                      <h3 id="menu-version-title">Nueva versión</h3>
                      <p>
                        Ajustá nombre, precio o composición. La versión actual
                        no se modifica ni se elimina.
                      </p>
                    </div>
                  </div>

                  {versionError && (
                    <div
                      className="dish-link-feedback dish-link-feedback--error"
                      role="alert"
                    >
                      {versionError}
                    </div>
                  )}

                  {versionMessage && (
                    <p className="dish-form__success" role="status">
                      {versionMessage}
                    </p>
                  )}

                  {composerSection}

                  <button
                    className="dish-link-rotate"
                    type="button"
                    onClick={() => void handleCreateVersion()}
                    disabled={versionSaving || !dirty}
                  >
                    {versionSaving ? "Creando versión…" : "Crear nueva versión"}
                  </button>
                </section>

                <section
                  className="dish-drawer__section"
                  aria-labelledby="menu-history-title"
                >
                  <div className="dish-drawer__section-heading">
                    <div>
                      <h3 id="menu-history-title">Historial de versiones</h3>
                      <p>
                        Cada edición de nombre, precio o composición queda
                        registrada acá.
                      </p>
                    </div>
                    <span className="client-link-status">
                      {versions.length} versión(es)
                    </span>
                  </div>
                  <ul className="dish-version-list">
                    {versions.map((version) => (
                      <li key={version.id}>
                        <div>
                          <strong>v{version.versionNumber}</strong>
                          <span>{version.name}</span>
                        </div>
                        <div className="dish-version-list__meta">
                          <span>{formatCurrency(version.price)}</span>
                          <small>{formatDate(version.createdAt)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <footer className="dish-form__actions">
                  <button type="button" onClick={() => void requestClose()}>
                    Cerrar
                  </button>
                </footer>
              </div>
            )}
          </div>
        </aside>
      </div>
      {confirmDialog}
    </>
  );
}
