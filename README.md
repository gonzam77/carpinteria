# Carpinteria

Aplicacion web full stack para cargar pedidos de corte de placas, administrar usuarios y exportar pedidos a Excel en el formato requerido por fabrica.

## Arquitectura

- `frontend`: React + TypeScript + Material UI + Vite.
- `backend`: Node.js + Express + TypeScript + Prisma + JWT + ExcelJS.
- `db`: PostgreSQL.
- `docker-compose.yml`: entorno integrado con base, API y web.

## Funcionalidades

- Autenticacion JWT para administracion y Google Login para carpinteros.
- Administrador: usuarios, todas las solicitudes, estadisticas, estados y exportacion.
- Carpintero: solicita cortes desde link publico, carga datos personales, revisa resumen y consulta sus solicitudes.
- Formulario de pedido con multiples piezas, tabla editable, duplicar fila, eliminar fila y validaciones.
- Exportacion XLSX con columnas exactas y regla `Canto` para cantos activos.
- Busqueda, filtros por fecha, historial de cambios y auditoria base.

## Ejecutar con Docker

```bash
cp .env.example .env
docker compose up --build
```

Luego abrir:

- Web: `http://127.0.0.1:5173`
- API: `http://localhost:4000/health`

Para cargar datos de ejemplo en Docker:

```bash
```bash
docker compose exec api npm run prisma:seed:prod
```


## Reset de la base de datos y migraciones (MODO DESARROLLO)

```bash --Eliminar volumen
docker compose down -v 
```
```bash --Eliminar migraciones
rm -rf prisma/migrations
```
```bash --Crear migracion inicial
npx prisma migrate dev --name init
```
```bash --Recrear base de datos(Borra base - Ejecuta migraciones - Ejecuta seed)
npx prsima migrate reset
```


Para habilitar Google Login, crear un OAuth Client ID web en Google Cloud y configurar en `.env`:

```bash
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
```

Origen autorizado recomendado para desarrollo: `http://127.0.0.1:5173`.

## Ejecutar localmente

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d db
npm --prefix backend run prisma:migrate
npm --prefix backend run prisma:seed
npm run dev:backend
npm run dev:frontend
```

Credenciales iniciales:

- Admin: `admin@carpinteria.local` / `admin123`
- Carpintero: `carpintero@carpinteria.local` / `carp123`

## Endpoints REST

- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/orders/export?ids=id1,id2`
- `GET /api/orders/:id`
- `PUT /api/orders/:id`
- `PATCH /api/orders/:id/status`
- `DELETE /api/orders/:id`
- `GET /api/stats`

## Formato Excel

La exportacion respeta este orden:

`codigo barra`, `Material`, `largo`, `ancho`, `cantidad`, `canto largo 1`, `canto largo 2`, `canto ancho 1`, `canto ancho 2`, `codigo barra centro p`, `Remark`, `numero cliente`, `nombre cliente`, `nombre producto`.

Si un canto esta activo escribe `Canto`; si no, deja la celda vacia.
# carpinteria
