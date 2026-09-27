# Documentación

Índice del sistema de documentación de Todo Artesanal.

## Qué contiene cada documento

| Documento             | Qué es                                                                                                                                  | Se actualiza cuando…                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `prompt.md`           | Contrato original completo (requisitos, reglas, invariantes). **No se actualiza**: es el histórico de lo pedido.                        | Nunca. Si el dominio cambia, el cambio se documenta abajo. |
| `dominio.md`          | Síntesis operativa del dominio: separación oferta/cliente/pedido/historial, precios, invariantes.                                       | Cambia una regla o aparece una decisión de dominio.        |
| `glosario.md`         | Definiciones cortas de los términos.                                                                                                    | Aparece un término nuevo o cambia su significado.          |
| `modelo-datos.md`     | Esquema PostgreSQL real: tablas, columnas, constraints, índices, triggers y migraciones.                                                | Cambia el esquema o se agrega una migración.               |
| `flujos.md`           | Secuencias operativas paso a paso (con `mermaid`) y qué invariantes usan.                                                               | Cambia el proceso de un flujo o se agrega uno.             |
| `arquitectura.md`     | Capas, límites, patrones de datos en la UI, Edge Functions, diagrama de features.                                                       | Cambia una decisión técnica o aparece un patrón nuevo.     |
| `servicios.md`        | Catálogo de la capa de servicios: funciones, firmas, RPCs y Edge Functions invocadas.                                                   | Se agrega o cambia una función de servicio.                |
| `estado-fases-1-5.md` | **Estado consolidado del proyecto**: qué fase está hecha, inventario de migraciones/servicios/UI y pendientes.                          | Se completa una fase o cambia el estado real.              |
| `decisiones/`         | Decisiones puntuales y fechadas de dominio o técnica (ej: `20260926-oferta-general-opcional.md`, `20260927-local-fuente-de-verdad.md`). | Se cierra una decisión que afecta reglas o el proceso.     |
| `adr/`                | Architecture Decision Records (formato en `adr/README.md`).                                                                             | Se toma una decisión técnica relevante.                    |

## Convenciones

- Español rioplatense, Markdown en UTF-8, formateado con
  `npx prettier --write docs/<archivo>.md`.
- Cuando un documento queda desactualizado respecto del código o de la base,
  se corrige el documento: **la fuente de verdad es el código y las
  migraciones**, nunca la documentación.
- Los cambios de dominio se documentan en dos lugares: la regla en sí en
  `dominio.md` / `glosario.md`, y su contexto en `decisiones/`. Las
  decisiones de proceso/técnica (ej: cómo reconciliar migraciones) viven
  solo en `decisiones/` y se enlazan desde `estado-fases-1-5.md`.

## Orden sugerido de lectura

1. `prompt.md` si querés el contrato completo.
2. `dominio.md` + `glosario.md` para entender el lenguaje.
3. `modelo-datos.md` + `arquitectura.md` para el diseño.
4. `servicios.md` + `flujos.md` para operar.
5. `estado-fases-1-5.md` para saber qué está hecho y qué falta.
