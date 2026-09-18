# Todo Artesanal

Aplicación web para gestionar el menú semanal de viandas, pedidos de clientes y administración del negocio.

Los clientes reciben un **link personal** para elegir sus viandas de cada día, mientras que desde el panel administrativo se puede gestionar el menú, los clientes, los pedidos, los montos y el historial.

## ¿Qué es?

Todo Artesanal es una aplicación pensada para simplificar la gestión semanal de un emprendimiento de viandas.

Permite centralizar en un solo lugar la creación del menú, la recepción de pedidos y la administración de clientes, reemplazando gran parte de la gestión manual.

Los clientes no necesitan registrarse: acceden mediante un link personal y seleccionan qué quieren comer cada día de la semana.

## Funcionalidades

- Gestión de platos
  - Alta y edición de platos.
  - Categoría y clima asociado.
  - Registro de cuándo fue utilizado cada plato.
  - Sugerencia de platos según clima y uso reciente.

- Creación de menús semanales
  - Configuración del menú de lunes a viernes.
  - Plato general y plato opcional por día.
  - Activación de una semana para comenzar a recibir pedidos.

- Pedidos de clientes
  - Link personal para cada cliente.
  - Selección del menú para cada día.
  - Opción de indicar que no come un determinado día.
  - Actualización automática de los pedidos.
  - Cálculo automático de montos.

- Gestión de clientes
  - Alta y edición de clientes.
  - Nombre, teléfono y cuidados especiales.
  - Precios especiales.
  - Generación automática del link personal.
  - Rotación manual del link personal para invalidar enlaces comprometidos.

- Historial
  - Historial de semanas.
  - Resumen diario de pedidos.
  - Historial de pedidos por cliente.

- Cancelaciones
  - Registro de clientes que no realizan un pedido.
  - Gestión de cancelaciones por semana.

- Panel administrativo
  - Vista de la semana activa.
  - Pedidos por cliente y por día.
  - Totales y montos.
  - Cantidad de raciones a preparar por día.
  - Actualización en vivo de los pedidos.

## Tecnologías

- React
- Vite
- Supabase
- PostgreSQL
- Supabase Auth

## Estructura del proyecto

```text
src/
├── lib/           # Cliente de Supabase y lógica compartida
├── pages/         # Páginas principales de la aplicación
└── styles/        # Tokens de estilos

supabase/
├── migrations/    # Migraciones de la base de datos
└── tests/         # Pruebas SQL
```

Si un cliente cancela un día, puede modificar su elección desde el mismo link.

Al finalizar la semana, la información queda disponible en el historial.

## Arquitectura

### Frontend

La aplicación está desarrollada con **React + Vite**.

Cuenta con dos áreas principales:

- `/admin` — panel privado de administración.
- `/menu/:token` — menú personalizado para cada cliente.

### Backend

**Supabase** funciona como backend de la aplicación y proporciona:

- PostgreSQL como base de datos.
- API para acceder a los datos.
- Funciones y vistas para la lógica de pedidos y montos.
- Row Level Security (RLS) para controlar el acceso a la información.

### Autenticación

El panel administrativo utiliza **Supabase Auth** para el inicio de sesión.

Los administradores ingresan con email y contraseña.

Los clientes no necesitan registrarse ni iniciar sesión. Acceden mediante su link personal.

El acceso al panel administrativo se controla mediante la tabla `private.admin_users`.

### Base de datos

La aplicación utiliza **PostgreSQL** como base de datos.

La estructura se administra mediante migraciones de Supabase, que contienen:

- Tablas y relaciones.
- Vistas.
- Funciones.
- Políticas de seguridad.
- Catálogo inicial de platos.

Los cambios futuros en la base de datos se realizan mediante nuevas migraciones.

## Estado del proyecto

### Implementado

- Panel administrativo.
- Autenticación de administradores.
- Gestión de platos.
- Gestión de clientes.
- Links personalizados para clientes.
- Creación y activación de semanas.
- Selección de menú por día.
- Gestión de pedidos.
- Cancelaciones.
- Cálculo automático de montos.
- Cálculo de raciones a preparar.
- Actualización de pedidos en tiempo real.
- Historial de semanas.
- Historial de pedidos por cliente.
- Sugerencia de platos según clima y uso reciente.

### Pendiente

- Generación automática del flyer semanal.
- Mejorar el cálculo histórico de clientes "sin responder", teniendo en cuenta los clientes que estaban activos en cada semana.

## Futuras mejoras

- Generación automática del flyer a partir del menú semanal.
- Envío automático de links a los clientes por WhatsApp.
- Estadísticas de ventas y pedidos.
- Mejoras en la sugerencia automática de platos.
- Gestión más avanzada de precios especiales.
- Historial más preciso del estado de los clientes.
- Mejoras de experiencia y usabilidad en dispositivos móviles.

## Desarrollo local

### Requisitos

- Node.js
- npm
- Supabase CLI
- Proyecto de Supabase

### Instalación

Instalar las dependencias:

```bash
npm install
```

Crear el archivo de variables de entorno:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Completar `.env` con las credenciales del proyecto:

```env
VITE_SUPABASE_URL=<TU_SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<TU_SUPABASE_ANON_KEY>
```

### Configuración de Supabase

Si es un proyecto nuevo, iniciar sesión:

```bash
supabase login
```

Vincular el repositorio con el proyecto:

```bash
supabase link --project-ref <TU_PROJECT_REF>
```

Aplicar las migraciones:

```bash
supabase db push
```

Después, crear el usuario administrador desde **Authentication > Users** en el dashboard de Supabase.

Para invalidar un link existente, usá **Rotar enlace** desde la pantalla de clientes y compartí el nuevo link.

Copiar el UUID del usuario y agregarlo a `private.admin_users`:

```sql
insert into private.admin_users (user_id)
values ('<UUID_DEL_USUARIO>');
```

La aplicación estará disponible en:

- Panel administrativo: `http://localhost:5173/admin`
- Menú de cliente: `http://localhost:5173/menu/<token-del-cliente>`

Para ejecutar las pruebas SQL, con Supabase CLI configurada:

```bash
npm run db:reset
npm run db:lint
npm run db:test
```

El workflow de GitHub ejecuta esos checks junto con `npm run build` en cada push y pull request.

Antes de publicar una versión:

```bash
supabase migration list
supabase db lint --linked
supabase db push --dry-run
npm run build
```

## Flujo de uso semanal

1. Crear el menú de la semana desde `/admin/nueva-semana`.
2. Compartir el flyer y el link personal de cada cliente.
3. Cada cliente entra a su link y selecciona sus viandas.
4. Los pedidos aparecen automáticamente en el panel administrativo.
5. El panel muestra los totales, montos y raciones necesarias.
6. Si un cliente cancela un día, puede modificar su elección desde el mismo link.
7. La información queda disponible en el historial para futuras consultas.
