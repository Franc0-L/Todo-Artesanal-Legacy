import type { AdminRoutePath } from "../../app/routes";

const sectionCopy: Record<
  AdminRoutePath,
  { title: string; description: string }
> = {
  "/admin": {
    title: "Panel administrativo",
    description: "Resumen y acceso a la gestión de Todo Artesanal.",
  },
  "/admin/clientes": {
    title: "Clientes",
    description: "Gestión de clientes y su configuración actual.",
  },
  "/admin/platos": {
    title: "Platos",
    description: "Gestión del catálogo de platos y sus versiones.",
  },
  "/admin/menus": {
    title: "Menús",
    description: "Gestión de menús y sus composiciones versionadas.",
  },
  "/admin/semanas": {
    title: "Semanas",
    description: "Gestión de períodos, oferta semanal y ciclo de vida.",
  },
  "/admin/pedidos": {
    title: "Pedidos",
    description: "Gestión de pedidos de la semana y sus estados.",
  },
  "/admin/cancelaciones": {
    title: "Cancelaciones",
    description: "Gestión de cancelaciones de pedidos de la semana.",
  },
  "/admin/historial": {
    title: "Historial",
    description:
      "Consulta de hechos históricos sin reinterpretar la configuración actual.",
  },
};

export function AdminSectionPage({ path }: { path: AdminRoutePath }) {
  const { title, description } = sectionCopy[path];

  return (
    <section aria-labelledby="admin-section-title">
      <h1 id="admin-section-title">{title}</h1>
      <p>{description}</p>
    </section>
  );
}
