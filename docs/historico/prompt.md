# Todo Artesanal — Reconstrucción completa del proyecto

Este documento es el contrato de dominio y arquitectura para reconstruir Todo Artesanal desde cero.

No hay código previo que consultar. Todo el conocimiento funcional, las reglas de negocio y las invariantes del sistema están contenidos acá. No busques ni asumas la existencia de un proyecto anterior.

El objetivo es construir la aplicación con una base arquitectónica, de datos y de frontend sólida, mantenible y preparada para crecer.

No es una migración mecánica. Es un reinicio donde las funcionalidades y reglas de negocio descritas en este documento se implementan desde cero con las decisiones estructurales correctas.

No es necesario que me pidas confirmación entre etapas. Realiza el análisis internamente y continúa con la implementación. Solo detente para consultarme si encuentras una ambigüedad de negocio realmente bloqueante que no pueda resolverse razonablemente a partir de este documento.

---

# 0. Estado actual del repositorio

Punto de partida real del proyecto al momento de recibir este documento:

**Stack instalado:**

- React 19.3.0
- TypeScript 6.0.3
- Vite 8.3.0
- `@supabase/supabase-js` 2.117.0
- ESLint 10.x

**Estructura actual:**

```
.gitignore
README.md
eslint.config.js
index.html
package.json
package-lock.json
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vite.config.ts
src/
├── App.tsx       (placeholder mínimo, sin lógica de negocio)
├── index.css     (reset neutro)
└── main.tsx      (entrada estándar)
supabase/
├── .gitignore
└── config.toml
```

**Supabase:**

- Proyecto linkeado: `Todo-Artesanal` (región São Paulo).
- Base de datos vacía: sin tablas, sin políticas RLS, sin funciones.
- Sin migraciones.

**Lo que NO existe todavía:**

- Cliente Supabase inicializado en el frontend.
- Ninguna tabla ni estructura de datos.
- Ninguna política RLS.
- Ninguna ruta ni componente de negocio.
- Ninguna dependencia de router, estado global o librería de UI.

Toda la estructura que surja del diseño del dominio debe crearla la IA desde cero.

> **Nota (Fase 5):** Las Fases 1-4 (dominio, modelo conceptual, modelo PostgreSQL, RLS, funciones y triggers) están completas y consolidadas en `estado-fases-1-4.md`. El SQL existe en archivos (`schema-v1.sql`, `01_functions.sql`, `02_triggers.sql`, `03_rls.sql`, `04_admin_setup.sql`) pero todavía no fue aplicado como migración en Supabase. Para el estado actual del proyecto, consultar `estado-fases-1-4.md`.

---

# 1. Stack tecnológico

La nueva versión debe utilizar:

- React
- Vite
- TypeScript
- Supabase
- PostgreSQL
- Supabase Auth

Utilizar:

- `.tsx` para componentes React.
- `.ts` para lógica, servicios, hooks, tipos y utilidades.

No introducir tecnologías adicionales salvo que exista una necesidad técnica clara y justificada.

---

# 2. Proceso de reconstrucción

Antes de comenzar a implementar las páginas y componentes principales, realiza internamente este proceso en el orden indicado:

```
Contexto de dominio (este documento)
        ↓
Reglas de negocio
        ↓
Invariantes del dominio
        ↓
Modelo conceptual
        ↓
Modelo PostgreSQL
        ↓
Constraints, índices y funciones
        ↓
RLS y seguridad
        ↓
Migraciones
        ↓
Tipos TypeScript
        ↓
Reglas y servicios de dominio
        ↓
Tests de dominio
        ↓
Arquitectura frontend
        ↓
Features frontend
        ↓
Interfaz
        ↓
Verificación integral
```

No necesito una respuesta separada después de cada etapa.

La arquitectura y el modelo de datos deben definirse antes de que la UI termine imponiendo accidentalmente una estructura incorrecta.

No permitir que la implementación de una pantalla determine posteriormente la estructura del dominio o de la base de datos. Si durante la implementación aparece una necesidad que contradice el modelo conceptual, revisar primero el modelo y la regla de negocio antes de introducir una excepción local en React.

Tienes libertad total para diseñar tablas, relaciones, servicios, componentes y estructura de carpetas desde cero cuando exista una solución mejor.

---

# 3. Objetivo general del sistema

Todo Artesanal es una aplicación para gestionar un emprendimiento de viandas.

El sistema tiene dos áreas principales:

```
/admin
```

Panel privado de administración.

```
/menu/:token
```

Menú personalizado para cada cliente mediante su enlace personal.

Los administradores gestionan:

- clientes
- platos
- menús
- semanas
- pedidos
- montos
- cancelaciones
- historial

Los clientes no necesitan registrarse.

Acceden mediante su link personal y realizan sus pedidos para la semana activa.

---

# 4. Principios del dominio

Mantener una separación clara entre:

### Oferta

Representa qué se ofrece durante una semana determinada.

### Cliente

Representa la configuración actual de una persona que utiliza el servicio.

Tiene información personal, configuración, estado y posibles precios especiales.

### Pedido

Representa una elección concreta realizada por un cliente para una semana y un día determinados.

### Historial

Representa lo que ocurrió realmente en el pasado y debe poder conservar su significado aunque posteriormente cambien los datos actuales.

Conceptualmente:

```
Oferta / Semana = qué se ofrece

Cliente         = qué tiene configurado actualmente

Pedido          = qué eligió realmente

Historial       = qué ocurrió y bajo qué contexto
```

No mezclar estos conceptos ni utilizar uno para reconstruir artificialmente otro.

Una modificación posterior de la configuración actual nunca debe alterar retrospectivamente el significado de un pedido histórico.

### Separación entre plato y menú

### Plato

Una unidad individual del catálogo.

Ejemplos:

```
Arroz con pollo
Milanesa
Puré
Empanadas
Pizza
Tarta
```

### Menú

Una combinación de platos que se presenta como una opción.

Un menú puede tener:

- un plato principal;
- cero guarniciones;
- una guarnición;
- múltiples guarniciones.

No asumir que todos los menús tienen exactamente una guarnición.

Ejemplo:

```
Arroz con pollo
```

es un menú válido aunque no tenga guarnición.

Otro ejemplo:

```
Guisito de carne vacuna
+ Fideos moñitos
+ Vegetales
```

también es un menú válido.

### La UI no define el dominio

La interfaz debe representar el dominio, no definirlo accidentalmente.

Las decisiones relacionadas con:

- precios;
- modalidades;
- elegibilidad;
- disponibilidad;
- cancelaciones;
- estado histórico;
- cálculo de montos;
- acceso de clientes;
- permisos;

deben resolverse en capas de dominio, servicios y/o PostgreSQL cuando corresponda.

No duplicar reglas críticas dentro de múltiples componentes React.

---

# 5. Modalidades de pedido

El sistema contempla únicamente estas tres modalidades:

- General
- Opcional
- Media vianda

No existe una modalidad de "vianda nocturna" y no debe incorporarse al modelo.

## General y opcional

Representan las opciones normales de la oferta semanal.

## Media vianda

La media vianda es una **modalidad de pedido**, no una categoría de plato ni un tipo de producto.

`media_vianda` nunca debe convertirse en:

- categoría de plato;
- tipo de plato;
- tipo de menú;
- producto especial;
- entidad independiente del catálogo.

Una media vianda puede basarse en:

- un plato individual;
- un menú compuesto;
- un plato suelto;
- empanadas;
- pizza;
- tartas;
- otras opciones que puedan incorporarse posteriormente.

No asumir que una media vianda corresponde exclusivamente a platos sueltos.

Tampoco crear una categoría especial de platos llamada `media_vianda`.

La misma opción puede utilizarse para una vianda completa o como media vianda.

Por ejemplo:

```
Lunes
└── Guisito de carne + fideos + vegetales

Cliente A
└── General
    └── Menú completo

Cliente B
└── Media vianda
    └── Mismo menú en modalidad de media vianda
```

También debe poder existir:

```
Media vianda
└── Empanadas
```

sin necesidad de convertir empanadas en una categoría especial.

La arquitectura debe permitir ampliar las opciones disponibles sin rediseñar estructuralmente el sistema.

---

# 6. Precio de la media vianda

La media vianda = 50% del "precio normal aplicable".

El "precio normal aplicable" se determina con la misma precedencia que el resto del dominio (ver §14):

- para dish: precio específico por plato > precio general del cliente > precio base de la versión
- para menu: precio general del cliente > precio base de la versión del menú

La media vianda usa la rama **general** (no la opcional). No tiene precio especial propio.

La lógica exacta queda centralizada en `calculate_order_price` (PostgreSQL, `01_functions.sql`) y no está duplicada entre componentes de React.

Debe ser posible determinar:

- opción seleccionada;
- modalidad;
- precio base;
- precio especial del cliente cuando corresponda;
- precio final aplicado.

El precio efectivamente aplicado debe conservarse en el pedido histórico.

Cambios posteriores de precios no deben modificar pedidos anteriores.

---

# 7. Modelo de datos

Diseñar el modelo PostgreSQL antes de implementar el frontend.

Como referencia conceptual, evaluar entidades equivalentes a:

```
clients
dishes
menus
menu_items
weeks
orders
order_items
client_features/configuration
client_special_prices
cancellations
```

No es obligatorio utilizar exactamente estos nombres.

El DDL concreto está en `schema-v1.sql` (ver también `estado-fases-1-4.md`).

Determina las relaciones y cardinalidades adecuadas.

Prestar especial atención a:

- cliente ↔ pedidos
- cliente ↔ precios especiales
- cliente ↔ configuración de media vianda
- semana ↔ menú
- menú ↔ platos
- semana ↔ pedidos
- pedido ↔ día
- pedido ↔ modalidad
- pedido ↔ opción elegida
- cancelación ↔ cliente/semana/día

La estructura debe permitir crecer sin tener que rediseñar el dominio ante cada nueva funcionalidad.

## No asumir `orders → order_items`

No asumir automáticamente que el dominio necesita la estructura tradicional:

```
orders
└── order_items
```

si esa estructura no representa una necesidad real.

Primero determinar conceptualmente cuál es la **unidad de pedido**. Como referencia, un pedido individual debe poder representar:

```
cliente
+
semana
+
día
+
modalidad
+
opción seleccionada
+
precio aplicado
```

La implementación física puede dividir estos datos en varias tablas si existe una razón técnica o de dominio para hacerlo, pero no introducir una cabecera y líneas artificiales únicamente por seguir un patrón genérico de sistemas de pedidos.

Si posteriormente se determina que `order_items` aporta valor real, documentar qué representa exactamente cada nivel.

---

# 8. Pedidos

Conceptualmente, un pedido debe poder representar:

```
cliente
semana
día
modalidad
opción seleccionada
precio aplicado
```

Las modalidades disponibles son:

```
general
opcional
media_vianda
```

Evitar una estructura excesivamente rígida que obligue a que las tres modalidades sean exactamente el mismo tipo de entidad.

La arquitectura debe permitir que una media vianda haga referencia a una opción adecuada de la oferta.

El sistema debe mostrar correctamente las cantidades diarias de:

```
General
Opcional
Media vianda
```

y calcular las raciones y montos correspondientes.

---

# 9. Clientes

El listado de clientes debe mantenerse liviano.

Puede mostrar inicialmente:

- nombre
- teléfono
- dirección
- estado activo

No cargar innecesariamente toda la información de la ficha para cada fila.

Al seleccionar un cliente, debe abrirse su ficha mediante un **drawer lateral**, sin navegar a una página separada.

Eliminar el concepto de botón "Ver ficha".

La interacción principal será:

```
Listado de clientes
        ↓
Seleccionar cliente
        ↓
Drawer de ficha
```

## Ficha del cliente

Debe permitir consultar y modificar:

- nombre
- activo/inactivo
- teléfono
- dirección
- cuidado especial
- observaciones
- precio general especial
- precio opcional especial
- precios especiales por producto
- posibilidad de media vianda

También debe permitir:

- copiar enlace personal;
- rotar enlace;
- acceder al historial completo.

El drawer debe:

- aparecer desde la derecha en desktop;
- utilizar overlay;
- tener una animación sutil;
- ser responsive;
- funcionar correctamente en mobile;
- tener scroll independiente;
- mostrar estados de carga;
- mostrar errores;
- permitir editar;
- guardar cambios;
- cancelar cambios;
- manejar correctamente cambios sin guardar cuando corresponda.

Después de guardar, actualizar el cliente sin recargar innecesariamente toda la aplicación.

---

# 10. Enlaces personales

Cada cliente puede tener un enlace personal.

Los clientes acceden mediante:

```
/menu/:token
```

No necesitan autenticarse.

Desde la ficha administrativa:

- copiar enlace personal;
- rotar enlace.

Rotar el enlace debe invalidar el token anterior y generar uno nuevo.

No permitir que el token anterior continúe otorgando acceso.

El mecanismo de invalidación debe estar garantizado por el backend y no solamente por la interfaz administrativa.

La seguridad del acceso mediante token debe estar garantizada por el backend/RLS y no depender únicamente de React.

---

# 11. Nueva semana

Revisar completamente el flujo de creación de semanas.

Una semana representa la oferta general para ese período.

No crear un menú semanal diferente por cliente.

El flujo esperado es:

```
Crear semana
    ↓
Configurar oferta
    ↓
Activar semana
    ↓
La semana queda disponible
    ↓
Cada cliente realiza su pedido
```

Las diferencias individuales deben resolverse mediante:

- configuración del cliente;
- precios especiales;
- modalidades disponibles;
- pedido concreto.

No crear una semana específica para cada cliente.

## Ciclo de vida de una semana

Definir un ciclo de vida explícito para las semanas.

Como mínimo, evaluar estados equivalentes a:

```
draft
active
closed
```

El nombre final puede variar.

Conceptualmente:

### Draft

La semana está siendo configurada y todavía no representa una oferta operativa definitiva.

### Active

La oferta está disponible para los clientes y pueden realizarse las operaciones permitidas.

Al activar una semana, se congela la población de clientes esperados
(`week_expected_clients`) tomando los clientes activos en ese instante.
Una vez activada, esa población no se recalcula a partir del estado
actual del cliente.

### Closed

El período operativo terminó y sus datos deben tratarse como históricos.

Las reglas de modificación y acceso deben depender del estado de la semana cuando corresponda.

No confiar exclusivamente en condiciones de la interfaz para impedir modificaciones inválidas.

Las operaciones no permitidas para una semana cerrada no deben poder ejecutarse simplemente manipulando el frontend.

---

# 12. Menús

Los menús deben soportar:

### Solo plato principal

```
Arroz con pollo
```

### Plato principal + una guarnición

```
Milanesa
+ Puré
```

### Plato principal + múltiples guarniciones

```
Guisito de carne vacuna
+ Fideos moñitos
+ Vegetales
```

No asumir una única guarnición.

No representar media vianda como componente de un menú.

Revisar también la generación del nombre.

Evitar casos como:

```
Arroz con pollo con (Sin guarnición)
```

Si no existe guarnición, el nombre debe representar correctamente esa situación.

Implementar:

- creación;
- edición;
- eliminación;
- búsqueda;
- paginación cuando corresponda;
- navegación hacia platos relacionados.

---

# 13. Platos

Implementar y revisar:

- alta;
- edición;
- eliminación;
- búsqueda;
- paginación;
- categoría;
- clima;
- uso histórico;
- sugerencias según clima y uso reciente.

Revisar cómo las modificaciones de platos afectan:

- menús actuales;
- semanas;
- pedidos;
- historial.

No permitir que editar un plato actual destruya el significado histórico de pedidos o semanas anteriores.

---

# 14. Precios especiales

Los clientes pueden tener:

- precio general especial;
- precio opcional especial;
- precios especiales por producto.

El diseño debe evitar duplicar lógica de precios en múltiples lugares.

Centralizar las reglas de cálculo en una única fuente de verdad.

El cálculo debe poder considerar, según las reglas reales del negocio:

```
opción seleccionada
+
modalidad
+
precio base
+
configuración / precio especial del cliente
+
otras reglas aplicables
=
precio final aplicado
```

El orden exacto de aplicación de estas reglas debe determinarse explícitamente y quedar implementado en un único lugar.

No duplicar la fórmula entre:

- componentes React;
- hooks;
- servicios diferentes;
- consultas;
- funciones administrativas;
- menú público.

El frontend debe consumir el resultado de una regla centralizada.

Distinguir entre:

```
Configuración de precio actual del cliente
```

y:

```
Precio efectivamente aplicado a un pedido histórico
```

Por ejemplo:

```
Hoy:
Cliente → precio especial $8.000

Pedido histórico:
→ conserva $8.000

Más adelante:
Cliente → precio especial $9.000

El pedido histórico continúa mostrando $8.000.
```

---

# 15. Historial y snapshots

Este es uno de los puntos fundamentales de la nueva arquitectura.

Los datos históricos deben representar lo que ocurrió en el momento correspondiente.

No depender incorrectamente de configuraciones actuales.

Esto aplica especialmente a:

- precios;
- menús;
- platos;
- configuración del cliente;
- estado del cliente;
- pedidos.

Por ejemplo, si un cliente estaba activo durante una semana anterior pero posteriormente fue desactivado, esa semana debe seguir reconociéndolo correctamente como cliente activo en ese período.

La aplicación debe poder reconstruir correctamente una semana pasada incluso si posteriormente se modificaron datos actuales.

## Referencia vs Snapshot vs Inmutabilidad

No todo dato debe duplicarse indiscriminadamente.

Para cada información determinar explícitamente si corresponde utilizar:

### Referencia

Cuando el dato puede seguir consultándose mediante una relación sin modificar el significado histórico.

### Snapshot

Cuando el valor debe conservarse porque podría cambiar posteriormente y el historial necesita reconstruir el contexto original.

### Inmutabilidad

Cuando el registro histórico no debe poder modificarse una vez consolidado.

La decisión debe hacerse según la pregunta:

> ¿Qué información necesitamos conservar para reconstruir correctamente qué ocurrió en ese momento aunque mañana cambien los datos actuales?

No snapshotear indiscriminadamente toda la base de datos.

Tampoco depender exclusivamente de relaciones actuales para reconstruir información histórica.

## Qué debe conservar un pedido histórico

Un pedido histórico debe conservar suficiente información para conocer:

- quién realizó el pedido;
- a qué semana correspondió;
- a qué día correspondió;
- qué modalidad utilizó;
- qué opción eligió;
- qué precio se aplicó;
- qué contexto relevante tenía esa elección en ese momento.

Cambios posteriores en el catálogo, cliente, menú, precio o configuración no deben modificar el significado histórico.

Determinar para cada campo qué debe conservarse mediante referencia y qué mediante snapshot.

## Cliente actual vs cliente histórico

El estado actual de un cliente no debe utilizarse automáticamente para interpretar semanas o pedidos anteriores.

Ejemplo:

```
Semana anterior:
cliente activo
precio especial = $8.000

Posteriormente:
cliente inactivo
precio especial actual = $9.000
```

La semana anterior debe continuar reconociendo correctamente el contexto aplicable en ese período.

No utilizar consultas como:

```
pedido
→ cliente actual
→ estado actual
```

para responder preguntas históricas cuando ese estado pueda haber cambiado.

---

# 16. Historial de semanas

Crear una experiencia clara para consultar semanas anteriores.

Debe permitir:

- listar semanas;
- navegar entre períodos;
- consultar pedidos;
- consultar cancelaciones;
- consultar información relevante;
- consultar cantidades;
- consultar montos;
- eliminar o limpiar información cuando corresponda.

El historial debe preservar correctamente el contexto histórico.

No reconstruir semanas antiguas utilizando únicamente valores actuales.

---

# 17. Historial del cliente

Debe poder accederse desde la ficha del cliente mediante:

```
Ver historial completo →
```

Debe permitir consultar:

- semanas;
- días;
- pedidos;
- modalidades;
- cantidades;
- montos;
- cancelaciones.

Utilizar agrupación temporal y/o paginación cuando sea necesario.

Debe existir una operación para limpiar/eliminar historial cuando corresponda, con una confirmación apropiada.

---

# 18. Cancelaciones

Gestionar cancelaciones por semana y día.

Debe ser posible:

- consultar;
- gestionar;
- filtrar cuando aporte valor;
- eliminar registros cuando corresponda.

Una cancelación representa un hecho operativo/histórico asociado a un cliente y a un período/día determinado.

Debe conservarse suficiente contexto para que una modificación posterior de la configuración del cliente no altere la interpretación histórica de la cancelación.

## Clientes sin responder

Revisar especialmente el cálculo histórico de clientes "sin responder".

La condición de "sin responder" debe determinarse respecto de una semana concreta.

No utilizar simplemente:

```
cliente activo actualmente
+
no tiene pedido actualmente
```

La población esperada debe determinarse utilizando el estado, configuración y reglas aplicables al período correspondiente.

Para determinar quién no respondió en una semana concreta, utilizar el estado/configuración correspondiente a esa semana y no simplemente el estado actual del cliente.

---

# 19. Navegación

Mejorar la navegación contextual.

Ejemplos:

```
Menú
  → Platos

Cliente
  → Historial

Nueva semana
  → Historial de semanas

Semana
  → Pedidos
  → Cancelaciones
  → Menú
```

Puedes utilizar:

- tabs;
- navegación contextual;
- breadcrumbs;
- desplegables;
- u otro patrón adecuado.

La navegación debe sentirse integrada y no fragmentar excesivamente la aplicación.

---

# 20. Listados

Todos los listados que puedan crecer considerablemente deben estar preparados para ello.

Cuando corresponda utilizar:

- búsqueda;
- filtros;
- ordenamiento;
- paginación;
- selector de cantidad por página.

No incorporar todos los controles indiscriminadamente.

El objetivo es que listados de cientos o miles de registros sigan siendo cómodos de utilizar.

La información inicial de los listados debe ser mínima y relevante.

La información detallada debe cargarse bajo demanda cuando sea apropiado.

---

# 21. Operaciones destructivas

Incorporar las operaciones necesarias para:

- eliminar platos;
- eliminar menús;
- eliminar clientes;
- eliminar/limpiar historial;
- eliminar cancelaciones;
- gestionar semanas cuando corresponda.

Las operaciones destructivas deben tener confirmaciones apropiadas.

Antes de eliminar una entidad determinar:

- si tiene referencias históricas;
- si eliminarla destruiría información;
- si debe desactivarse;
- si debe archivarse;
- si debe conservarse como registro histórico;
- si puede eliminarse físicamente sin consecuencias.

Como principio general:

```
Dato actual sin uso histórico
→ puede ser eliminable

Dato utilizado históricamente
→ preservar o archivar según el caso

Pedido histórico
→ preservar

Precio aplicado históricamente
→ inmutable

Cliente histórico
→ no debe desaparecer de la historia por estar actualmente inactivo

Token anterior
→ invalidar, no reutilizar
```

No permitir eliminaciones que produzcan datos históricos inconsistentes.

La estrategia definitiva debe definirse entidad por entidad durante el diseño del esquema.

---

# 22. Arquitectura frontend

Organizar el frontend principalmente por features/dominios.

Una estructura orientativa:

```
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── ...
│
├── features/
│   ├── clientes/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── ...
│   │
│   ├── platos/
│   ├── menus/
│   ├── semanas/
│   ├── pedidos/
│   ├── cancelaciones/
│   └── historial/
│
├── components/
│   ├── ui/
│   └── layout/
│
├── lib/
├── types/
└── styles/
```

Puedes modificar esta estructura si existe una alternativa mejor.

El principio importante es que cada feature sea relativamente autónoma y fácil de comprender.

Evitar páginas gigantes que mezclen:

- consultas a Supabase;
- lógica de negocio;
- formularios;
- estado;
- componentes;
- estilos.

Separar responsabilidades cuando sea necesario.

---

# 23. TypeScript

Utilizar TypeScript desde el comienzo.

Generar tipos desde el esquema de Supabase cuando sea posible.

Complementarlos con tipos de dominio específicos.

Evitar `any` salvo casos realmente justificados.

Tipar correctamente:

- componentes;
- props;
- formularios;
- hooks;
- servicios;
- respuestas de Supabase;
- estados;
- funciones de negocio.

Los tipos deben ayudar a que una herramienta de IA pueda comprender rápidamente la estructura del proyecto.

---

# 24. Componentes reutilizables

Crear componentes compartidos para patrones que realmente se repitan.

Por ejemplo:

- Button;
- Input;
- Select;
- Modal;
- Drawer;
- ConfirmDialog;
- EmptyState;
- LoadingState;
- ErrorState;
- Pagination;
- Table/List.

No crear abstracciones innecesarias.

La reutilización debe mejorar la consistencia y mantenimiento.

---

# 25. Estilos

Evitar concentrar todos los estilos en un único `app.css` gigantesco.

Definir una estrategia clara para:

- tokens;
- variables;
- estilos globales;
- componentes compartidos;
- estilos específicos de cada feature.

Mantener cerca de la feature los estilos que sean específicos de ella cuando resulte conveniente.

Evitar tanto:

```
un único CSS global enorme
```

como:

```
decenas de archivos de estilos diminutos e innecesarios
```

La interfaz debe mantener una identidad visual consistente.

---

# 26. Responsive

Diseñar desktop y mobile desde el comienzo.

Prestar especial atención a:

- clientes;
- drawer;
- formularios;
- pedidos;
- tablas;
- listados;
- navegación;
- botones;
- acciones.

No limitarse a reducir tamaños de desktop.

Adaptar los patrones de interacción cuando sea necesario.

---

# 27. UX del drawer de clientes

El drawer de clientes debe sentirse como parte natural de la pantalla, no como una página incrustada.

La experiencia esperada:

```
Listado
    ↓
Click sobre cliente
    ↓
Overlay
    ↓
Drawer entra desde la derecha
    ↓
Ficha editable
```

Cerrar mediante:

- botón de cierre;
- click sobre overlay cuando corresponda;
- Escape en desktop cuando corresponda.

La apertura y cierre deben tener una animación breve y sutil.

Evitar animaciones excesivas.

---

# 28. Supabase y PostgreSQL

Supabase funciona como backend.

Utilizar PostgreSQL para garantizar las reglas que naturalmente pertenecen al backend.

Evaluar correctamente:

- constraints;
- foreign keys;
- índices;
- funciones;
- vistas;
- triggers cuando aporten valor;
- RLS.

No trasladar al frontend reglas que PostgreSQL pueda garantizar de forma más segura y consistente.

Los cálculos críticos de pedidos, montos y datos derivados deben tener una única fuente de verdad siempre que sea posible.

---

# 29. RLS y seguridad

El panel administrativo utiliza Supabase Auth.

Los administradores deben estar autorizados mediante la estructura correspondiente, incluyendo `private.admin_users` o una solución equivalente.

Los clientes acceden mediante:

```
/menu/:token
```

sin autenticación tradicional.

El acceso mediante token debe permitir únicamente:

- consultar la información necesaria;
- consultar la oferta correspondiente;
- crear/modificar sus pedidos;
- modificar su elección cuando las reglas lo permitan.

Un cliente no debe poder acceder a datos de otros clientes.

La seguridad no debe depender exclusivamente del frontend.

## Seguridad como parte del modelo

Diseñar simultáneamente:

```
modelo de datos
+
relaciones
+
constraints
+
RLS
+
flujo de autenticación
+
acceso mediante token
```

No diseñar primero las tablas y agregar RLS posteriormente como una capa independiente.

Las políticas deben surgir de las relaciones y reglas del dominio.

El sistema debe seguir siendo seguro aunque un usuario manipule directamente las peticiones realizadas desde el frontend.

Conceptualmente:

```
token
  ↓
identidad / scope limitado del cliente
  ↓
RLS
  ↓
datos y operaciones permitidas
```

---

# 30. Migraciones

Todas las modificaciones estructurales de PostgreSQL deben quedar representadas mediante migraciones de Supabase.

No depender de modificaciones manuales no documentadas.

Las migraciones deben contemplar cuando corresponda:

- tablas;
- relaciones;
- índices;
- constraints;
- funciones;
- vistas;
- políticas RLS;
- datos iniciales.

---

# 31. Tiempo real

Mantener Supabase Realtime donde aporte valor.

Especialmente para:

- pedidos;
- información operativa;
- panel administrativo;
- actualización de cantidades.

No utilizar realtime indiscriminadamente.

---

# 32. Estados de interfaz

Los formularios y consultas deben contemplar correctamente:

```
loading
saving
success
empty
error
```

cuando corresponda.

Los errores de red o base de datos deben mostrarse de forma comprensible.

Evitar que una operación fallida deje la UI en un estado inconsistente.

Después de una modificación exitosa, actualizar el estado necesario sin recargar toda la aplicación innecesariamente.

---

# 33. Calidad del código

Priorizar:

- responsabilidades claras;
- componentes pequeños;
- nombres descriptivos;
- tipos fuertes;
- separación entre UI y acceso a datos;
- lógica reutilizable;
- ausencia de duplicación innecesaria;
- evitar estados derivados innecesarios;
- evitar efectos secundarios innecesarios;
- evitar abstracciones prematuras.

El código debe ser fácil de explorar tanto para una persona como para herramientas de IA.

Una feature debería poder entenderse principalmente explorando su propia carpeta y sus dependencias directas.

---

# 34. Conocimiento previo como referencia

Este documento contiene el conocimiento funcional y de dominio del proyecto anterior. No hay código previo que consultar.

Toda la información relevante está en las secciones anteriores:

- reglas de negocio;
- funcionalidades;
- estructura conceptual de datos;
- casos límite conocidos;
- comportamiento validado;
- decisiones de UX;
- problemas conocidos del proyecto anterior.

Pero no hay estructura que conservar por inercia:

- componentes;
- páginas;
- hooks;
- servicios;
- nombres;
- estructura de carpetas;
- tablas;
- funciones;
- arquitectura.

El objetivo es aplicar el conocimiento, no replicar decisiones accidentales de implementación.

Si existe una solución mejor para la nueva versión, implementarla directamente.

---

# 35. README

Actualizar el README para que represente la nueva versión real.

Debe documentar:

- propósito;
- conceptos principales;
- funcionalidades;
- arquitectura;
- stack;
- estructura del proyecto;
- Supabase;
- autenticación;
- base de datos;
- RLS;
- desarrollo local;
- migraciones;
- testing;
- flujo operativo;
- roadmap.

No documentar estructuras hipotéticas que no existan realmente.

---

# 36. Invariantes verificables

Las siguientes situaciones deben poder expresarse y comprobarse mediante tests y/o constraints, funciones o políticas de PostgreSQL cuando corresponda:

- una media vianda no es un tipo de plato;
- un menú puede tener cero, una o múltiples guarniciones;
- un pedido histórico conserva su precio aplicado;
- modificar un precio actual no modifica pedidos anteriores;
- desactivar un cliente no elimina su historial;
- una semana no pertenece exclusivamente a un cliente;
- un token rotado deja inválido el anterior;
- un cliente no puede consultar pedidos de otro cliente;
- una semana histórica no depende exclusivamente del estado actual del cliente;
- el cálculo de precio no está duplicado entre múltiples componentes;
- las operaciones no permitidas para una semana cerrada no pueden ejecutarse simplemente manipulando el frontend.

Estas invariantes deben considerarse parte del contrato del dominio.

Invariantes adicionales aprobadas durante Fase 4 (documentadas en `estado-fases-1-4.md`):

- las cancelaciones conservan su contexto histórico;
- "sin responder" se determina respecto de la semana correspondiente;
- la oferta semanal es común; las diferencias individuales pertenecen a configuración/pedido del cliente;
- los hechos históricos no se reinterpretan mediante datos actuales.

---

# 37. Verificación

Antes de considerar terminada la reconstrucción:

- comprobar compilación;
- comprobar TypeScript;
- comprobar rutas;
- comprobar autenticación;
- comprobar RLS;
- comprobar CRUD;
- comprobar formularios;
- comprobar pedidos;
- comprobar modalidades General/Opcional/Media vianda;
- comprobar cálculos;
- comprobar precios especiales;
- comprobar snapshots históricos;
- comprobar historial;
- comprobar cancelaciones;
- comprobar clientes sin responder;
- comprobar links personales;
- comprobar rotación de tokens;
- comprobar drawer;
- comprobar responsive;
- comprobar estados de carga/error/vacío;
- comprobar migraciones;
- comprobar el ciclo de vida de la semana (draft / active / closed);
- comprobar que las invariantes de §36 se cumplen;
- ejecutar las pruebas disponibles.

También revisar que modificaciones actuales no alteren incorrectamente la información histórica.

---

# 38. Criterio general de arquitectura

No optimizar únicamente para que la aplicación funcione hoy.

Optimizar también para que sea fácil:

- agregar funcionalidades;
- modificar reglas de negocio;
- comprender el código;
- realizar cambios mediante IA;
- detectar errores;
- mantener PostgreSQL;
- mantener RLS;
- trabajar con muchos registros.

La arquitectura debe favorecer una relación clara:

```
Base de datos
      ↓
Reglas de negocio
      ↓
Servicios
      ↓
Features
      ↓
Componentes
      ↓
Interfaz
```

Cada capa debe tener responsabilidades claras.

---

# 39. Resultado esperado

El resultado final debe ser una versión de Todo Artesanal que implemente el dominio descrito en este documento con una base sólida y preparada para evolucionar.

Debe poder crecer en cantidad de:

- clientes;
- platos;
- menús;
- semanas;
- pedidos;
- historial;

sin que la complejidad del mantenimiento crezca de forma desproporcionada.

No priorices simplemente agregar más código.

Prioriza un sistema coherente, tipado, seguro, mantenible y preparado para evolucionar.

Tienes libertad para tomar las decisiones técnicas necesarias para conseguirlo siempre que respetes las reglas de negocio y objetivos descritos anteriormente.

---

# 40. Principio rector

La reconstrucción debe aplicar el conocimiento funcional del proyecto anterior sin arrastrar sus decisiones accidentales de implementación.

La regla general es:

> Conservar el significado, rediseñar la estructura.

El conocimiento relevante está en este documento:

- comportamiento real;
- reglas de negocio;
- casos límite;
- decisiones validadas;
- problemas conocidos.

Ninguna estructura debe crearse por inercia de patrones genéricos.

La nueva arquitectura debe priorizar:

```
dominio claro
+
historial confiable
+
seguridad backend
+
fuente única de verdad
+
tipado fuerte
+
mantenibilidad
+
capacidad de evolución
```

Comienza analizando el dominio descrito en este documento y, una vez comprendido el contexto, comienza con la Fase 1 del proceso de reconstrucción (§2).

---

# Apéndice — Roadmap excluido deliberadamente

Los siguientes temas quedan fuera del alcance del modelo inicial. No deben incorporarse salvo que alguna decisión estructural futura lo requiera:

- Integración con WhatsApp.
- Estadísticas avanzadas.
- Generación automática de flyers.
- Cualquier otra funcionalidad no mencionada explícitamente en las secciones anteriores.