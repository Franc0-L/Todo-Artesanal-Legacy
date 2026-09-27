import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createDish,
  getDish,
  setDishActive,
  updateDish,
} from "./services/dishes.service";
import {
  createDishVersion,
  listDishVersions,
} from "./services/dish-versions.service";
import { getDishUsage } from "./services/dish-usage.service";
import { formatCurrency, formatDate } from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type { Climate } from "../../types/domain";
import type { CreateDishInput, Dish, UpdateDishInput } from "./types/dish";
import type { CreateDishVersionInput, DishVersion } from "./types/dish-version";
import type { DishUsage } from "./types/dish-usage";

interface DishDrawerProps {
  mode: "create" | "edit";
  dishId: string | null;
  onClose: () => void;
  onCreated: (dish: Dish) => void;
  onSaved: (dish: Dish) => void;
  onVersionCreated: (dishId: string, name: string) => void;
}

interface IdentityFormState {
  category: string;
  climate: Climate | "";
}

interface VersionFormState {
  name: string;
  price: string;
}

const EMPTY_IDENTITY_FORM: IdentityFormState = { category: "", climate: "" };
const EMPTY_VERSION_FORM: VersionFormState = { name: "", price: "" };

function toIdentityFormState(dish: Dish): IdentityFormState {
  return {
    category: dish.category ?? "",
    climate: dish.climate ?? "",
  };
}

export function DishDrawer({
  mode,
  dishId,
  onClose,
  onCreated,
  onSaved,
  onVersionCreated,
}: DishDrawerProps) {
  const isCreateMode = mode === "create";
  // En modo edición el drawer arranca cargando la ficha: el estado inicial ya
  // representa ese "cargando" y el efecto no necesita sincronizar estado.
  const isEditMode = !isCreateMode && dishId !== null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dish, setDish] = useState<Dish | null>(null);
  const [versions, setVersions] = useState<DishVersion[]>([]);
  const [usage, setUsage] = useState<DishUsage | null>(null);
  const [form, setForm] = useState<IdentityFormState>(EMPTY_IDENTITY_FORM);
  const [versionForm, setVersionForm] =
    useState<VersionFormState>(EMPTY_VERSION_FORM);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionMessage, setVersionMessage] = useState<string | null>(null);

  const { confirm, confirmDialog } = useConfirm();

  const currentVersion = versions[0] ?? null;

  const dirty = isCreateMode
    ? versionForm.name.trim() !== "" ||
      versionForm.price.trim() !== "" ||
      form.category.trim() !== "" ||
      form.climate !== ""
    : dish
      ? form.category !== (dish.category ?? "") ||
        form.climate !== (dish.climate ?? "") ||
        versionForm.name !== (currentVersion?.name ?? "") ||
        versionForm.price !==
          (currentVersion ? String(currentVersion.price) : "")
      : false;

  // La ficha se reinicia por remonte (ver `key` en PlatosPage): el estado
  // inicial ya es el correcto y el efecto solo resuelve el fetch, sin
  // sincronizar estado antes del primer `await`.
  useEffect(() => {
    if (!isEditMode || !dishId) return;

    let cancelled = false;

    void Promise.all([
      getDish(dishId),
      listDishVersions(dishId),
      getDishUsage(dishId),
    ])
      .then(([dishResult, versionsResult, usageResult]) => {
        if (cancelled) return;

        setDish(dishResult);
        setForm(toIdentityFormState(dishResult));
        setVersions(versionsResult);
        setUsage(usageResult);

        const latest = versionsResult[0];
        setVersionForm(
          latest
            ? { name: latest.name, price: String(latest.price) }
            : EMPTY_VERSION_FORM,
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la ficha del plato.",
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
  }, [dishId, isEditMode]);

  useEffect(() => {
    if (!isCreateMode && !dishId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [dishId, isCreateMode]);

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
    if (!isCreateMode && !dishId) {
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
  }, [dishId, isCreateMode, requestClose]);

  function updateIdentityField<K extends keyof IdentityFormState>(
    field: K,
    value: IdentityFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveMessage(null);
  }

  function updateVersionField<K extends keyof VersionFormState>(
    field: K,
    value: VersionFormState[K],
  ) {
    setVersionForm((current) => ({ ...current, [field]: value }));
    setVersionMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      if (isCreateMode) {
        const priceValue = Number(versionForm.price);

        if (!Number.isFinite(priceValue) || priceValue < 0) {
          throw new Error("El precio debe ser un número mayor o igual a 0.");
        }

        const input: CreateDishInput = {
          name: versionForm.name,
          price: priceValue,
          category: form.category || null,
          climate: (form.climate || null) as Climate | null,
        };

        const created = await createDish(input);
        onCreated(created);
        return;
      }

      if (!dish) {
        return;
      }

      const input: UpdateDishInput = {
        category: form.category || null,
        climate: (form.climate || null) as Climate | null,
      };

      const updated = await updateDish(dish.id, input);
      setDish(updated);
      setForm(toIdentityFormState(updated));
      setSaveMessage("Cambios guardados.");
      onSaved(updated);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isCreateMode
            ? "No se pudo crear el plato."
            : "No se pudieron guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleActiveToggle() {
    if (!dish || statusSaving) {
      return;
    }

    const nextActive = !dish.active;

    const proceed = await confirm({
      title: nextActive ? "Activar plato" : "Desactivar plato",
      message: nextActive
        ? "¿Activar este plato? Volverá a estar disponible para incluir en la oferta."
        : "¿Desactivar este plato? Su historial se conservará y dejará de estar disponible para nuevas semanas.",
      confirmLabel: nextActive ? "Activar" : "Desactivar",
      tone: nextActive ? "default" : "danger",
    });

    if (!proceed) {
      return;
    }

    setStatusSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const updated = await setDishActive(dish.id, nextActive);
      setDish(updated);
      onSaved(updated);
      setSaveMessage(nextActive ? "Plato activado." : "Plato desactivado.");
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "No se pudo actualizar el estado del plato.",
      );
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleCreateVersion() {
    if (!dish || versionSaving) {
      return;
    }

    const trimmedName = versionForm.name.trim();
    const priceValue = Number(versionForm.price);

    if (!trimmedName) {
      setVersionError("El nombre de la nueva versión es obligatorio.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setVersionError("El precio debe ser un número mayor o igual a 0.");
      return;
    }

    setVersionSaving(true);
    setVersionError(null);
    setVersionMessage(null);

    try {
      const input: CreateDishVersionInput = {
        name: trimmedName,
        price: priceValue,
      };
      const created = await createDishVersion(dish.id, input);

      setVersions((current) => [created, ...current]);
      setVersionForm({ name: created.name, price: String(created.price) });
      setVersionMessage(`Versión ${created.versionNumber} creada.`);
      onVersionCreated(dish.id, created.name);
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

  const open = isCreateMode || dishId !== null;

  if (!open) {
    return null;
  }

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
          aria-labelledby="dish-drawer-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="dish-drawer__header">
            <div>
              <p className="platos-page__eyebrow">
                {isCreateMode ? "Nuevo plato" : "Ficha de plato"}
              </p>
              <h2 id="dish-drawer-title">
                {isCreateMode
                  ? "Crear plato"
                  : (currentVersion?.name ?? "Plato")}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              className="dish-drawer__close"
              type="button"
              onClick={() => void requestClose()}
              aria-label={
                isCreateMode
                  ? "Cerrar creación de plato"
                  : "Cerrar ficha del plato"
              }
            >
              ×
            </button>
          </header>

          <div className="dish-drawer__body">
            {loading && <p className="platos-feedback">Cargando ficha…</p>}

            {!loading && error && (
              <div
                className="platos-feedback platos-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {!loading && (isCreateMode || dish) && (
              <form className="dish-form" onSubmit={handleSubmit}>
                {dish && (
                  <section
                    className="dish-form__summary"
                    aria-label="Estado del plato"
                  >
                    <div className="dish-form__summary-main">
                      <span
                        className={`platos-status platos-status--${
                          dish.active ? "active" : "inactive"
                        }`}
                      >
                        {dish.active ? "Activo" : "Inactivo"}
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
                      disabled={statusSaving || saving}
                    >
                      {statusSaving
                        ? "Actualizando…"
                        : dish.active
                          ? "Desactivar plato"
                          : "Activar plato"}
                    </button>
                  </section>
                )}

                {isCreateMode && (
                  <p className="dish-form__hint">
                    El nombre y el precio pertenecen a la primera versión del
                    plato. Para cambiarlos más adelante hay que crear una
                    versión nueva: la anterior queda registrada tal cual.
                  </p>
                )}

                {isCreateMode && (
                  <div className="dish-form__fields">
                    <label>
                      Nombre
                      <input
                        type="text"
                        value={versionForm.name}
                        onChange={(event) =>
                          updateVersionField("name", event.target.value)
                        }
                        required
                        autoFocus
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
                        required
                      />
                    </label>
                  </div>
                )}

                <div className="dish-form__fields">
                  <label>
                    Categoría
                    <input
                      type="text"
                      value={form.category}
                      onChange={(event) =>
                        updateIdentityField("category", event.target.value)
                      }
                      placeholder="Texto libre (ej: Principal, Guarnición)"
                    />
                  </label>
                  <label>
                    Clima
                    <select
                      value={form.climate}
                      onChange={(event) =>
                        updateIdentityField(
                          "climate",
                          event.target.value as Climate | "",
                        )
                      }
                    >
                      <option value="">Sin preferencia</option>
                      <option value="frio">Frío</option>
                      <option value="templado">Templado</option>
                      <option value="calor">Calor</option>
                    </select>
                  </label>
                </div>

                {!isCreateMode && (
                  <section className="dish-form__section">
                    <div className="dish-form__section-header">
                      <div>
                        <p className="platos-page__eyebrow">Versionado</p>
                        <h3>Nueva versión</h3>
                      </div>
                      <span className="dish-form__version-count">
                        {versions.length} versión
                        {versions.length === 1 ? "" : "es"}
                      </span>
                    </div>

                    <p className="dish-form__hint">
                      El nombre y el precio son inmutables una vez utilizados.
                      Crear una versión nueva conserva todas las anteriores.
                    </p>

                    <div className="dish-form__fields">
                      <label>
                        Nombre de la nueva versión
                        <input
                          type="text"
                          value={versionForm.name}
                          onChange={(event) =>
                            updateVersionField("name", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Precio de la nueva versión
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={versionForm.price}
                          onChange={(event) =>
                            updateVersionField("price", event.target.value)
                          }
                        />
                      </label>
                    </div>

                    {versionError && (
                      <p
                        className="dish-form__message dish-form__message--error"
                        role="alert"
                      >
                        {versionError}
                      </p>
                    )}
                    {versionMessage && (
                      <p className="dish-form__message" role="status">
                        {versionMessage}
                      </p>
                    )}

                    <button
                      className="dish-form__secondary-action"
                      type="button"
                      onClick={() => void handleCreateVersion()}
                      disabled={versionSaving || saving}
                    >
                      {versionSaving ? "Creando versión…" : "Crear versión"}
                    </button>
                  </section>
                )}

                {!isCreateMode && versions.length > 0 && (
                  <section className="dish-form__section">
                    <div className="dish-form__section-header">
                      <div>
                        <p className="platos-page__eyebrow">Historial</p>
                        <h3>Versiones anteriores</h3>
                      </div>
                    </div>
                    <div className="dish-version-list">
                      {versions.map((version) => (
                        <article className="dish-version-card" key={version.id}>
                          <div>
                            <strong>
                              v{version.versionNumber} — {version.name}
                            </strong>
                            <p>
                              {formatCurrency(version.price)} ·{" "}
                              {formatDate(version.createdAt)}
                            </p>
                          </div>
                          {version.id === currentVersion?.id && (
                            <span className="dish-version-card__current">
                              Actual
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {!isCreateMode && usage && (
                  <section className="dish-form__section">
                    <div className="dish-form__section-header">
                      <div>
                        <p className="platos-page__eyebrow">Uso histórico</p>
                        <h3>Utilización del plato</h3>
                      </div>
                    </div>
                    <p className="dish-form__usage">
                      Este plato fue utilizado en {usage.totalUses} registro
                      {usage.totalUses === 1 ? "" : "s"} histórico
                      {usage.totalUses === 1 ? "" : "s"}.
                    </p>
                  </section>
                )}

                {saveMessage && (
                  <p className="dish-form__message" role="status">
                    {saveMessage}
                  </p>
                )}

                <footer className="dish-form__actions">
                  <button
                    className="dish-form__secondary-action"
                    type="button"
                    onClick={() => void requestClose()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="dish-form__primary-action"
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? "Guardando…"
                      : isCreateMode
                        ? "Crear plato"
                        : "Guardar cambios"}
                  </button>
                </footer>
              </form>
            )}
          </div>
        </aside>
      </div>
      {confirmDialog}
    </>
  );
}
