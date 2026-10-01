import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

/**
 * Reemplazo de window.confirm basado en un diálogo propio de la app.
 *
 * Uso:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   const proceed = await confirm({ message: "¿Seguro?" });
 *   if (!proceed) return;
 *   ...
 *   return (
 *     <>
 *       ...tu JSX...
 *       {confirmDialog}
 *     </>
 *   );
 *
 * Importante: `confirmDialog` debe renderizarse como HERMANO del contenido
 * que puede tener su propio backdrop (drawers, modales), nunca anidado
 * dentro de un elemento que también cierre al hacer click afuera — si no,
 * el click para cancelar el diálogo de confirmación también dispararía el
 * cierre del elemento padre.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (nextOptions: ConfirmOptions): Promise<boolean> => {
      setOptions(nextOptions);

      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  const resolve = useCallback((value: boolean) => {
    setOptions(null);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      tone={options?.tone}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  );

  return { confirm, confirmDialog };
}
