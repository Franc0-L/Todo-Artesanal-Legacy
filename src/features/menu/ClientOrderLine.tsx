import { useState } from "react";
import { formatCurrency } from "../../lib/formatters";
import { MODALITY_LABELS } from "./menu-labels";
import type { OrderDetail } from "../pedidos/types/order-detail";

interface ClientOrderLineProps {
  order: OrderDetail;
  busy: boolean;
  onChangeQuantity: (quantity: number) => void;
  onSaveNotes: (notes: string | null) => void;
  onRemove: () => void;
}

/**
 * Pedido ya hecho por el cliente para un día: nombre del producto,
 * modalidad, precio congelado, cantidad editable y notas.
 *
 * Se remonta con `key` cuando cambia (`order.id:order.updatedAt`) para que
 * las notas locales se reinicien con el valor vigente, en vez de
 * sincronizarlas en un efecto.
 */
export function ClientOrderLine({
  order,
  busy,
  onChangeQuantity,
  onSaveNotes,
  onRemove,
}: ClientOrderLineProps) {
  const [notes, setNotes] = useState(order.notes ?? "");

  const trimmedNotes = notes.trim();
  const notesDirty = trimmedNotes !== (order.notes ?? "");
  const optionName = order.option?.name ?? "Tu elección";

  return (
    <li className="client-order-line">
      <div className="client-order-line__main">
        <div className="client-order-line__title">
          <span className="client-order-line__name">{optionName}</span>
          <span className="client-menu__chip">
            {MODALITY_LABELS[order.modality]}
          </span>
        </div>

        <div className="client-order-line__controls">
          <div className="client-order-line__stepper">
            <button
              type="button"
              aria-label="Quitar una unidad"
              disabled={busy || order.quantity <= 1}
              onClick={() => onChangeQuantity(order.quantity - 1)}
            >
              −
            </button>
            <span aria-live="polite">{order.quantity}</span>
            <button
              type="button"
              aria-label="Agregar una unidad"
              disabled={busy}
              onClick={() => onChangeQuantity(order.quantity + 1)}
            >
              +
            </button>
          </div>

          <span className="client-order-line__price">
            {formatCurrency(order.appliedPrice)}
          </span>
        </div>
      </div>

      <div className="client-order-line__notes">
        <label>
          <span className="client-order-line__notes-label">Notas</span>
          <input
            type="text"
            value={notes}
            maxLength={200}
            placeholder="Sin cebolla, porción grande…"
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {notesDirty && (
          <button
            type="button"
            className="client-order-line__save"
            disabled={busy}
            onClick={() => onSaveNotes(trimmedNotes || null)}
          >
            Guardar
          </button>
        )}
      </div>

      <button
        type="button"
        className="client-order-line__remove"
        disabled={busy}
        onClick={onRemove}
      >
        Quitar pedido
      </button>
    </li>
  );
}
