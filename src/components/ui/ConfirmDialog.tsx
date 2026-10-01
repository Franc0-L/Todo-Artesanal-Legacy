import { useEffect, useRef } from "react";
import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación genérico. Reemplaza a window.confirm en toda la
 * app: se renderiza en el DOM propio (no en el navegador), es responsive
 * (modal centrado en desktop, hoja inferior en mobile) y no bloquea el
 * hilo principal.
 *
 * Se usa casi siempre a través de useConfirm(), que además maneja el
 * estado y devuelve una Promise<boolean>. Este componente queda expuesto
 * por separado por si algún flujo necesita control manual del estado
 * `open`.
 */
export function ConfirmDialog({
  open,
  title = "Confirmar acción",
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    confirmButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="confirm-dialog__backdrop" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`confirm-dialog__confirm confirm-dialog__confirm--${tone}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
