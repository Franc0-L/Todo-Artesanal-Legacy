import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createClient,
  deleteClient,
  getClient,
  setClientActive,
  updateClient,
} from "./services/clients.service";
import {
  getActiveTokenStatus,
  rotateClientToken,
} from "./services/client-tokens.service";
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
} from "./types/client";
import { ClientHistorySection } from "./ClientHistorySection";
import { ClientPricingSection } from "./ClientPricingSection";
import { useConfirm } from "../../components/ui/useConfirm";
import { isAppError } from "../../lib/errors";

interface ClientDrawerProps {
  mode: "create" | "edit";
  clientId: string | null;
  onClose: () => void;
  onCreated: (client: Client) => void;
  onSaved: (client: Client) => void;
  /** Se dispara cuando el cliente se eliminó definitivamente. */
  onDeleted: (clientId: string) => void;
}
interface ClientFormState {
  name: string;
  phone: string;
  address: string;
  notes: string;
  specialCare: string;
  allowsHalfPortion: boolean;
}
const EMPTY_FORM: ClientFormState = {
  name: "",
  phone: "",
  address: "",
  notes: "",
  specialCare: "",
  allowsHalfPortion: false,
};
function toFormState(client: Client): ClientFormState {
  return {
    name: client.name,
    phone: client.phone ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
    specialCare: client.specialCare ?? "",
    allowsHalfPortion: client.allowsHalfPortion,
  };
}
function hasCreateChanges(form: ClientFormState): boolean {
  return (
    form.name.trim() !== "" ||
    form.phone.trim() !== "" ||
    form.address.trim() !== "" ||
    form.notes.trim() !== "" ||
    form.specialCare.trim() !== "" ||
    form.allowsHalfPortion
  );
}

export function ClientDrawer({
  mode,
  clientId,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}: ClientDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hasActiveToken, setHasActiveToken] = useState<boolean | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenRotating, setTokenRotating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const isCreateMode = mode === "create";
  const dirty = isCreateMode
    ? hasCreateChanges(form)
    : client
      ? form.name !== client.name ||
        form.phone !== (client.phone ?? "") ||
        form.address !== (client.address ?? "") ||
        form.notes !== (client.notes ?? "") ||
        form.specialCare !== (client.specialCare ?? "") ||
        form.allowsHalfPortion !== client.allowsHalfPortion
      : false;

  useEffect(() => {
    function run() {
      if (isCreateMode || !clientId) {
        setClient(null);
        setForm(EMPTY_FORM);
        setError(null);
        setSaveMessage(null);
        setLoading(false);
        setHasActiveToken(null);
        setTokenLoading(false);
        setTokenError(null);
        setTokenRotating(false);
        setGeneratedToken(null);
        setCopyMessage(null);
        setDeleting(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setClient(null);
      setForm(EMPTY_FORM);
      setError(null);
      setSaveMessage(null);
      setHasActiveToken(null);
      setTokenLoading(true);
      setTokenError(null);
      setGeneratedToken(null);
      setCopyMessage(null);
      setDeleting(false);
      void getClient(clientId)
        .then((result) => {
          if (!cancelled) {
            setClient(result);
            setForm(toFormState(result));
          }
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setError(
              e instanceof Error
                ? e.message
                : "No se pudo cargar la ficha del cliente.",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      void getActiveTokenStatus(clientId)
        .then((status) => {
          if (!cancelled) setHasActiveToken(status.hasActiveToken);
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setTokenError(
              e instanceof Error
                ? e.message
                : "No se pudo consultar el estado del enlace personal.",
            );
        })
        .finally(() => {
          if (!cancelled) setTokenLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return run();
  }, [clientId, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode && !clientId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [clientId, isCreateMode]);

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
      if (!proceed) return;
    }
    onClose();
  }, [confirm, dirty, onClose]);

  useEffect(() => {
    if (!isCreateMode && !clientId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clientId, isCreateMode, requestClose]);

  function updateField<K extends keyof ClientFormState>(
    field: K,
    value: ClientFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      if (isCreateMode) {
        const input: CreateClientInput = {
          name: form.name,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          specialCare: form.specialCare,
          allowsHalfPortion: form.allowsHalfPortion,
        };
        onCreated(await createClient(input));
        return;
      }
      if (!client) return;
      const input: UpdateClientInput = {
        name: form.name,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        specialCare: form.specialCare,
        allowsHalfPortion: form.allowsHalfPortion,
      };
      const updated = await updateClient(client.id, input);
      setClient(updated);
      setForm(toFormState(updated));
      setSaveMessage("Cambios guardados.");
      onSaved(updated);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : isCreateMode
            ? "No se pudo crear el cliente."
            : "No se pudieron guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleActiveToggle() {
    if (!client || statusSaving) return;
    const nextActive = !client.active;
    const proceed = await confirm({
      title: nextActive ? "Activar cliente" : "Desactivar cliente",
      message: nextActive
        ? "¿Activar este cliente? Volverá a ser incluido en futuras semanas activadas."
        : "¿Desactivar este cliente? Su historial se conservará y dejará de incluirse en futuras semanas activadas.",
      confirmLabel: nextActive ? "Activar" : "Desactivar",
      tone: nextActive ? "default" : "danger",
    });
    if (!proceed) return;
    setStatusSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const updated = await setClientActive(client.id, nextActive);
      setClient(updated);
      onSaved(updated);
      setSaveMessage(nextActive ? "Cliente activado." : "Cliente desactivado.");
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo actualizar el estado del cliente.",
      );
    } finally {
      setStatusSaving(false);
    }
  }

  /**
   * Borrado definitivo del cliente. Solo funciona si no tiene datos que lo
   * referencien (pedidos, cancelaciones, semanas que lo esperen): en ese
   * caso la DB responde CONFLICT y se muestra un mensaje accionable.
   */
  async function handleDelete() {
    if (!client || deleting || statusSaving || saving) return;
    const proceed = await confirm({
      title: "Eliminar cliente",
      message:
        "Esta acción elimina el cliente de forma definitiva y no se puede deshacer. Si el cliente tiene pedidos, cancelaciones o semanas que lo incluyen, no se podrá eliminar: en ese caso, desactivalo para conservar su historial.",
      confirmLabel: "Eliminar definitivamente",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!proceed) return;
    setDeleting(true);
    setError(null);
    setSaveMessage(null);
    try {
      await deleteClient(client.id);
      onDeleted(client.id);
    } catch (deleteError: unknown) {
      setError(
        isAppError(deleteError) && deleteError.code === "CONFLICT"
          ? "No se pudo eliminar: el cliente tiene pedidos, cancelaciones o semanas asociadas. Usá Desactivar para conservar su historial."
          : deleteError instanceof Error
            ? deleteError.message
            : "No se pudo eliminar el cliente.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleRotateToken() {
    if (!client || tokenRotating) return;
    const proceed = await confirm({
      title: "Rotar enlace personal",
      message:
        "Al rotar el enlace, el enlace anterior dejará de funcionar inmediatamente. ¿Continuar?",
      confirmLabel: "Rotar enlace",
      tone: "danger",
    });
    if (!proceed) return;
    setTokenRotating(true);
    setTokenError(null);
    setGeneratedToken(null);
    setCopyMessage(null);
    try {
      const result = await rotateClientToken(client.id);
      setGeneratedToken(result.token);
      setHasActiveToken(true);
    } catch (e: unknown) {
      setTokenError(
        e instanceof Error ? e.message : "No se pudo rotar el enlace personal.",
      );
    } finally {
      setTokenRotating(false);
    }
  }

  async function handleCopyLink() {
    if (!generatedToken) return;
    const link = `${window.location.origin}/menu/${generatedToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyMessage("Enlace copiado.");
    } catch {
      setCopyMessage(
        "No se pudo copiar automáticamente. Copiá el enlace manualmente.",
      );
    }
  }

  if (!isCreateMode && clientId === null) return null;

  return (
    <>
      <div
        className="client-drawer__backdrop"
        onMouseDown={() => void requestClose()}
      >
        <aside
          className="client-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-drawer-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="client-drawer__header">
            <div>
              <p className="clients-page__eyebrow">
                {isCreateMode ? "Nuevo cliente" : "Ficha de cliente"}
              </p>
              <h2 id="client-drawer-title">
                {isCreateMode ? "Crear cliente" : (client?.name ?? "Cliente")}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              className="client-drawer__close"
              type="button"
              onClick={() => void requestClose()}
              aria-label="Cerrar ficha del cliente"
            >
              ×
            </button>
          </header>
          <div className="client-drawer__body">
            {loading && <p className="clients-feedback">Cargando ficha…</p>}
            {!loading && error && (
              <div
                className="clients-feedback clients-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}
            {!loading && (isCreateMode || client) && (
              <form className="client-form" onSubmit={handleSubmit}>
                {client && (
                  <section
                    className="client-form__summary"
                    aria-label="Datos básicos del cliente"
                  >
                    <div className="client-form__summary-main">
                      <span
                        className={`clients-status clients-status--${client.active ? "active" : "inactive"}`}
                      >
                        {client.active ? "Activo" : "Inactivo"}
                      </span>
                      <p>{client.phone ?? "Teléfono no informado"}</p>
                      <p>{client.address ?? "Dirección no informada"}</p>
                    </div>
                    <button
                      className="client-form__status-action"
                      type="button"
                      onClick={() => void handleActiveToggle()}
                      disabled={statusSaving || saving}
                    >
                      {statusSaving
                        ? "Actualizando…"
                        : client.active
                          ? "Desactivar cliente"
                          : "Activar cliente"}
                    </button>
                  </section>
                )}
                {isCreateMode && (
                  <p className="client-form__hint">
                    El cliente se creará activo. Después podrás completar su
                    configuración desde la ficha.
                  </p>
                )}
                <div className="client-form__fields">
                  <label>
                    Nombre
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                      autoComplete="name"
                      autoFocus
                    />
                  </label>
                  <label>
                    Teléfono
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      autoComplete="tel"
                    />
                  </label>
                  <label>
                    Dirección
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      autoComplete="street-address"
                    />
                  </label>
                  <label>
                    Cuidados especiales
                    <textarea
                      value={form.specialCare}
                      onChange={(e) =>
                        updateField("specialCare", e.target.value)
                      }
                      rows={3}
                    />
                  </label>
                  <label>
                    Observaciones
                    <textarea
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      rows={4}
                    />
                  </label>
                  <label className="client-form__checkbox">
                    <input
                      type="checkbox"
                      checked={form.allowsHalfPortion}
                      onChange={(e) =>
                        updateField("allowsHalfPortion", e.target.checked)
                      }
                    />
                    <span>Permitir media vianda</span>
                  </label>
                </div>
                {!isCreateMode && client && (
                  <>
                    <section
                      className="client-drawer__section"
                      aria-labelledby="client-link-title"
                    >
                      <div className="client-drawer__section-heading">
                        <div>
                          <h3 id="client-link-title">Enlace personal</h3>
                          <p>
                            El enlace anterior queda invalidado al rotarlo. El
                            nuevo token se muestra una sola vez.
                          </p>
                        </div>
                        <span className="client-link-status">
                          {tokenLoading
                            ? "Consultando…"
                            : hasActiveToken === null
                              ? "Estado desconocido"
                              : hasActiveToken
                                ? "Activo"
                                : "Sin enlace"}
                        </span>
                      </div>
                      {tokenError && (
                        <div
                          className="client-link-feedback client-link-feedback--error"
                          role="alert"
                        >
                          {tokenError}
                        </div>
                      )}
                      {generatedToken && (
                        <div className="client-link-generated" role="status">
                          <label htmlFor="generated-client-link">
                            Nuevo enlace
                          </label>
                          <div className="client-link-generated__controls">
                            <input
                              id="generated-client-link"
                              type="text"
                              readOnly
                              value={`${window.location.origin}/menu/${generatedToken}`}
                            />
                            <button
                              type="button"
                              onClick={() => void handleCopyLink()}
                            >
                              Copiar
                            </button>
                          </div>
                          <p>
                            Guardá este enlace ahora. No volverá a mostrarse el
                            token completo después de cerrar la ficha.
                          </p>
                          {copyMessage && <span>{copyMessage}</span>}
                        </div>
                      )}
                      <button
                        className="client-link-rotate"
                        type="button"
                        onClick={() => void handleRotateToken()}
                        disabled={
                          tokenLoading ||
                          tokenRotating ||
                          saving ||
                          statusSaving
                        }
                      >
                        {tokenRotating
                          ? "Generando enlace…"
                          : hasActiveToken
                            ? "Rotar enlace"
                            : "Generar enlace"}
                      </button>
                    </section>
                    <ClientPricingSection
                      clientId={client.id}
                      disabled={saving || statusSaving || tokenRotating}
                    />
                    <ClientHistorySection clientId={client.id} />
                  </>
                )}
                {saveMessage && (
                  <p className="client-form__success" role="status">
                    {saveMessage}
                  </p>
                )}
                {!isCreateMode && client && (
                  <section
                    className="client-drawer__section"
                    aria-labelledby="client-delete-title"
                  >
                    <div className="client-drawer__section-heading">
                      <div>
                        <h3 id="client-delete-title">Eliminar cliente</h3>
                        <p>
                          Acción definitiva e irreversible. Si el cliente tiene
                          historial (pedidos, cancelaciones o semanas), la base
                          de datos no va a permitir el borrado: desactivalo en
                          su lugar.
                        </p>
                      </div>
                    </div>
                    <button
                      className="client-danger-zone__button"
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={
                        deleting || saving || statusSaving || tokenRotating
                      }
                    >
                      {deleting ? "Eliminando…" : "Eliminar definitivamente"}
                    </button>
                  </section>
                )}
                <footer className="client-form__actions">
                  <button
                    type="button"
                    onClick={() => void requestClose()}
                    disabled={saving || statusSaving || tokenRotating}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || statusSaving || tokenRotating || !dirty}
                  >
                    {saving
                      ? isCreateMode
                        ? "Creando…"
                        : "Guardando…"
                      : isCreateMode
                        ? "Crear cliente"
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
