import type { ReactNode } from "react";

/**
 * Poses, gestos e iconos disponibles de la mascota de Todo Artesanal.
 * Los archivos viven en `public/mascot/<nombre>.png` (fondo transparente).
 */
export type MascotAsset =
  /* Poses completas */
  | "pose_base"
  | "bienvenidos"
  | "aprobado"
  | "delicioso"
  /* Gestos de medio cuerpo */
  | "cocinando"
  | "degustacion"
  | "preparacion"
  | "listo_servir"
  /* Íconos para web / menús */
  | "icon_chef"
  | "icon_batidor"
  | "icon_espatula"
  | "icon_cubiertos"
  | "icon_gorro"
  | "icon_cafe"
  | "icon_pedir"
  | "icon_campana";

export interface EmptyStateProps {
  /** Pose o gesto de la mascota que acompaña el mensaje. */
  mascot: MascotAsset;
  /** Título principal del estado vacío. */
  title: string;
  /** Aclaración opcional (por qué está vacío / qué hacer). */
  description?: string;
  /** Acción opcional (botón, enlace, etc.). */
  action?: ReactNode;
  /** Clases extra para ajustar el layout del contenedor. */
  className?: string;
}

/**
 * Estado vacío reutilizable con la mascota de Todo Artesanal.
 *
 * Es puramente presentacional: no maneja datos ni estados de carga.
 * El estilo vive en `src/index.css` bajo el prefijo `.app-empty-state`,
 * así que respeta los tokens de tema (claro/oscuro) sin CSS adicional.
 */
export function EmptyState({
  mascot,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={className ? `app-empty-state ${className}` : "app-empty-state"}
    >
      <div className="app-empty-state__mascot-wrapper">
        <img
          src={`/mascot/${mascot}.png`}
          alt=""
          aria-hidden="true"
          className="app-empty-state__mascot"
          width="96"
          height="96"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="app-empty-state__content">
        <h2 className="app-empty-state__title">{title}</h2>
        {description && (
          <p className="app-empty-state__description">{description}</p>
        )}
      </div>
      {action && <div className="app-empty-state__action">{action}</div>}
    </div>
  );
}
