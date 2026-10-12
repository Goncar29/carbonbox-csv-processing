# CarbonBox — Procesamiento Asíncrono de Documentos CSV

> Estado: **completo** (6 de 6 etapas). Backend, worker asíncrono, frontend, Docker y diagrama de AWS.
> Seguimiento detallado: [`odd/tasks/carbonbox-document-processing.md`](odd/tasks/carbonbox-document-processing.md).

## 1. Descripción

Sistema full stack que permite subir archivos CSV con datos de actividad, procesarlos de forma **asíncrona** mediante colas de mensajes (AWS SQS) y almacenamiento de objetos (AWS S3), y visualizar los resultados cuando el procesamiento termina. En desarrollo local, SQS y S3 se emulan con **LocalStack**.

```
Frontend ──POST CSV──► API ──► S3 (archivo)
                        ├────► PostgreSQL (Upload: PENDING)
                        └────► SQS (mensaje) ──► Worker ──► valida filas ──► PostgreSQL (ActivityData)
                                                         └──► Upload: COMPLETED | FAILED
Frontend ◄──polling cada 3s── API
```

## 2. Requisitos previos

| Herramienta | Versión usada |
|-------------|---------------|
| Node.js | 24.x |
| Docker Desktop (con Docker Compose v2) | 29.x |

## 3. Instalación y ejecución

```bash
# 1. Infraestructura (desde la raíz): PostgreSQL + LocalStack (S3 + SQS)
docker compose up -d --wait

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm test             # tests unitarios y de API
npm run dev          # API en http://localhost:3001

# 3. Worker (otra terminal, desde backend/)
npm run worker

# 4. Frontend (otra terminal, desde la raíz)
cd frontend
npm install
npm run dev          # http://localhost:3000
```

El frontend apunta por defecto a `http://localhost:3001/api/v1`; para otra URL, definir `NEXT_PUBLIC_API_URL` en `frontend/.env.local`.

### Imagen Docker del backend

`backend/Dockerfile` genera **una sola imagen** para la API y el worker (en AWS son dos servicios ECS con distinto comando):

```bash
cd backend
docker build -t carbonbox-backend .
# API (comando por defecto) y worker (comando sobrescrito). HOST=0.0.0.0 para aceptar conexiones desde fuera del contenedor;
# host.docker.internal reemplaza a localhost para llegar a Postgres y LocalStack del host.
docker run --env-file .env -e HOST=0.0.0.0 -e AWS_ENDPOINT=http://host.docker.internal:4566 -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5433/document_processing -p 3001:3001 carbonbox-backend
docker run --env-file .env -e AWS_ENDPOINT=http://host.docker.internal:4566 -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5433/document_processing carbonbox-backend node dist/workers/index.js
```

### Servicios locales

| Servicio | URL / Puerto | Notas |
|----------|--------------|-------|
| PostgreSQL | `localhost:5433` | Puerto 5433 en el host para no chocar con un PostgreSQL nativo en 5432 |
| LocalStack | `http://localhost:4566` | Bucket `carbonbox-uploads`, colas `file-processing-queue` y `file-processing-dlq` |

Los recursos de AWS se crean automáticamente al iniciar LocalStack mediante `infra/localstack/init/ready.d/init-aws.sh`.

### API REST

| Método | Endpoint | Respuesta |
|--------|----------|-----------|
| POST | `/api/v1/uploads` (form-data, campo `file`) | `202` `{ id, status, fileName, createdAt }` |
| GET | `/api/v1/uploads/:id` | `{ id, status, fileName, totalRows, processedRows, failedRows, errorMessage, createdAt, updatedAt }` |
| GET | `/api/v1/uploads?page=1&limit=10` | `{ data: [...], total, page, limit }` |
| GET | `/api/v1/uploads/:id/results` | `{ data: [{ category, amount, unit, date }] }` |
| GET | `/api/v1/uploads/summary` | `{ total, pending, processing, completed, failed }` (agregado para el dashboard) |
| GET | `/health` | `{ status: "ok" }` |

Errores con formato uniforme: `{ statusCode, error, message }` — `400` validación, `404` no encontrado, `409` transición de estado inválida, `413` archivo mayor a 10 MB, `500` error inesperado (mensaje genérico; el detalle solo va al log).

### Procesamiento del CSV

Formato obligatorio: `category,amount,unit,date` (se aceptan columnas en cualquier orden y mayúsculas; BOM, `\r\n`, comillas y espacios se manejan).

| Problema | Resultado del upload |
|----------|----------------------|
| Archivo vacío, sin filas de datos, columna faltante/duplicada/desconocida o CSV mal formado | `FAILED`, con el motivo en `errorMessage` |
| Filas puntuales inválidas (campo vacío, `amount` no positivo o no numérico, fecha inexistente o fuera de `YYYY-MM-DD`) | `COMPLETED`: se guardan las filas válidas y `errorMessage` lista cada error con fila y columna |

Ejemplo de `errorMessage` de un upload `COMPLETED` con filas inválidas (fila = línea del archivo, encabezado = línea 1; máximo 100 líneas):

```
Row 4, column amount: must be a positive number (value: "-5")
Row 5, column category: is required (value: "")
Row 5, column date: must be a valid date in YYYY-MM-DD format (value: "2024-02-30")
```

### Worker idempotente

SQS entrega cada mensaje **al menos una vez**, así que el worker tolera duplicados y caídas:

| Estado del upload al recibir el mensaje | Acción |
|-----------------------------------------|--------|
| `COMPLETED` o `FAILED` | Mensaje duplicado: se borra sin escribir nada |
| `PENDING` | `startProcessing()` → procesa |
| `PROCESSING` | Un intento anterior se cayó: `restartProcessing()` → reprocesa desde cero |
| Falla inesperada (S3/base caída) | No se borra el mensaje: SQS lo reintenta (visibility timeout 60 s) |
| Falla en el **último** intento (3/3) | El upload pasa a `FAILED` (el polling del frontend termina) y el mensaje va a la DLQ |
| Mensaje inválido (JSON roto) | No se borra: termina en la DLQ para inspección |

Las filas y el estado `COMPLETED` se guardan en **una transacción** de Prisma (borra filas de intentos previos → inserta → actualiza el upload): un reintento nunca duplica filas.

**Varios workers con el mismo mensaje** (SQS estándar puede entregarlo dos veces y en AWS el worker escala en ECS): la transacción toma un **bloqueo de fila** (`SELECT ... FOR UPDATE`) sobre el upload y solo escribe si sigue en `PROCESSING`. El segundo worker espera, ve el estado final y no escribe nada (`skipped`). El paso a `FAILED` usa un update condicional (`WHERE status = 'PROCESSING'`), así una falla tardía nunca pisa un `COMPLETED`; y el paso inicial a `PROCESSING` solo se guarda si el upload sigue en `PENDING` o `PROCESSING`, así un worker con una copia vieja nunca hace retroceder un upload terminado. Cubierto por un test de integración contra Postgres real (`TEST_DATABASE_URL=... npm test PrismaUploadRepository`).

Si SQS no responde, el worker reintenta con **backoff exponencial** (1 s, 2 s, 4 s… hasta 30 s).

## 4. Arquitectura

Bounded context: **`document-processing`**. Las dependencias apuntan hacia adentro: `presentation → application → domain ← infrastructure`.

| Capa | Contenido | Depende de |
|------|-----------|------------|
| `domain` | Aggregate Root `Upload`, entidad `ActivityData`, Value Objects `UploadStatus` y `FileName`, interfaces de repositorio | Nada externo |
| `application` | Commands, Queries y sus handlers (CQRS) | `domain` |
| `infrastructure` | Repositorios Prisma + mappers, S3, SQS, contenedor Awilix | `domain`, librerías |
| `presentation` | Controllers y rutas Fastify | `application` |

**Frontend** (`frontend/src`): misma idea de *screaming architecture* — `features/document-processing/{api,components,types}` y `shared/{components,lib}`. Las páginas de `app/` son finas (server components que solo leen `params`/`searchParams` y montan un componente); los componentes de la feature son client components con hooks de React Query.

| Ruta | Contenido |
|------|-----------|
| `/` | Dashboard: total, completados, en proceso (pendientes + procesando) y fallidos, con link a nuevo upload |
| `/uploads` | Tabla paginada (10 por página) con badges de color por estado y link al detalle |
| `/uploads/new` | Drag & drop o selector, solo `.csv`, barra de progreso de subida y redirección al detalle |
| `/uploads/[id]` | Datos del upload, barra mientras está `PENDING`/`PROCESSING`, polling cada 3 s, tabla de resultados al completar y lista de errores por fila/columna |

**Infraestructura en AWS:** diagrama en [`docs/arquitectura-aws.png`](docs/arquitectura-aws.png) (fuente Mermaid y explicación en [`docs/arquitectura-aws.md`](docs/arquitectura-aws.md)) (VPC con subnets públicas/privadas, ALB, ECS Fargate API + Worker, RDS Multi-AZ, S3, SQS + DLQ, CloudWatch, Secrets Manager).

### Patrones

- **Aggregate Root (`Upload`):** el estado solo cambia mediante `startProcessing()`, `complete()` y `fail()`, que aplican el ciclo de vida `PENDING → PROCESSING → COMPLETED | FAILED`. Nadie asigna `status` directamente, así que la regla vive en un único lugar.
- **Value Objects:** `UploadStatus` (estados válidos y transiciones permitidas) y `FileName` (no vacío, extensión `.csv`, sin separadores de ruta, máximo 255 caracteres). Son inmutables y se validan al crearse.
- **Either:** los errores de negocio esperables se devuelven como `Either.left(...)` con tipos `ValidationError` (400), `NotFoundError` (404) o `ConflictError` (409). Los fallos inesperados (base de datos caída, datos corruptos) se lanzan con `throw` y los captura el manejador de errores centralizado.
- **CQRS a nivel de código:** misma base de datos, caminos separados para escritura (commands) y lectura (queries).
- **Repository + Mapper:** el dominio define la interfaz (puerto); Prisma la implementa. Los mappers traducen filas de Prisma ↔ objetos de dominio, de modo que el dominio no conoce Prisma.
- **Inyección de dependencias (Awilix, modo `CLASSIC`):** inyecta por nombre de parámetro del constructor, así las clases no dependen de Awilix. `strict: true` hace fallar el arranque si falta una dependencia.

## 5. Decisiones técnicas

| Decisión | Motivo | Trade-off |
|----------|--------|-----------|
| LocalStack fijado en `4.14.0` | Desde `2026.03.0` todas las imágenes de LocalStack exigen `LOCALSTACK_AUTH_TOKEN`. `4.14.0` es la última versión community que arranca sin cuenta (verificado: `"edition": "community"`). | No recibe actualizaciones; suficiente para S3 y SQS en desarrollo. |
| Prisma fijado en `6.19.3` | El tag `latest` de npm apunta a una release candidate (`8.0.0-rc`). Prisma 6 usa el generador clásico sin driver adapters, lo que reduce configuración dentro del presupuesto de 4 horas. | No se usan las novedades de Prisma 7. |
| Schema Prisma en `src/document-processing/infrastructure/persistence/models/` | Respeta la estructura de carpetas propuesta por la prueba (persistencia como detalle de infraestructura). | Requiere configurar `prisma.schema` en `package.json`. |
| `@@index([uploadId])` en `ActivityData` | PostgreSQL no indexa claves foráneas automáticamente y `GET /uploads/:id/results` filtra por `uploadId`. | Es un índice, no un campo: el modelo mantiene exactamente los campos del enunciado. |
| Cola principal con Dead Letter Queue (`maxReceiveCount: 3`) | Un mensaje que falla 3 veces se aísla en la DLQ en lugar de reintentarse indefinidamente. | Requiere monitorear la DLQ. |
| IDs sin `@default` en Prisma | Los IDs se generan en la capa de dominio (el agregado nace con identidad). | — |
| TypeScript fijado en `5.9.3` | `typescript@latest` es la 7.x (port a Go) y `ts-jest` declara `"typescript": ">=4.3 <7"`. | No se usa el compilador nativo más rápido. |
| Sin `ICommandBus` | Con 5 handlers, Awilix inyecta cada handler directamente en su controller; un bus agregaría indirección sin beneficio real. | Si crecieran los handlers o se necesitara middleware de commands (logging, transacciones), se agregaría un bus. |
| Jest + ts-jest | Tests escritos antes de la implementación (TDD). Los de API usan `fastify.inject` con repositorios en memoria: prueban HTTP real sin base de datos. | No reemplazan una prueba contra infraestructura real (hecha manualmente con LocalStack). |
| `npm test` con `--experimental-vm-modules` | `fastify.inject` depende de `cookie`, que ahora es solo ESM; Jest necesita ese flag para cargar ESM desde CommonJS (Node ≥ 24.9). Se usa `node ... jest.js` en vez de `NODE_OPTIONS=` para que funcione también en Windows. | Flag "experimental" de Node. |
| Interfaces `IMessagePublisher` / `IFileStorage` en `shared/application` | El enunciado las ubica en `shared/infrastructure`, pero las usa la capa de aplicación: si `application` importara de `infrastructure`, la dependencia apuntaría hacia afuera y rompería la regla de Clean Architecture. Son **puertos**; SQS y S3 son **adaptadores**. | Desvío consciente de la estructura sugerida. |
| `POST /uploads` responde `202 Accepted` | El upload queda registrado, pero el procesamiento ocurre después, de forma asíncrona. | — |
| Orden en `CreateUpload`: S3 → base de datos → SQS | El registro debe existir antes de que el worker reciba el mensaje. | Si SQS falla después de guardar, el upload queda en `PENDING` (ver limitaciones). |
| Configuración con convict | Esquema tipado con validación al arrancar; cada valor se sobrescribe por variable de entorno. Las variables se cargan con `--env-file` nativo de Node (sin `dotenv`). | — |
| `csv-parse` en lugar de `split(',')` | Maneja comillas con comas, `\r\n`, BOM de Excel y reporta el número de línea real de cada registro. | Una dependencia más. |
| `restartProcessing()` como método aparte | El reintento tras una caída es explícito; la tabla de transiciones sigue estricta y `startProcessing()` dos veces sigue fallando. | — |
| Errores de fila en `errorMessage` (texto, una línea por error) | Respeta el schema mínimo: no se agregan campos ni tablas. | Para filtrar errores por columna habría que parsear el texto; con más tiempo, una tabla `RowError`. |
| Polling con `refetchInterval` de React Query | La función recibe el último dato y devuelve `3000` o `false`: el polling se corta solo al llegar a `COMPLETED`/`FAILED`, sin `setInterval` ni limpieza manual. Sigue mientras el estado **no sea final** (también en `PENDING`), no solo en `PROCESSING` como dice el enunciado, para no quedar congelado si el worker aún no tomó el mensaje. | Una request cada 3 s por pestaña abierta; con muchos usuarios convendría WebSocket/SSE. |
| Resultados solo con `COMPLETED` | La query de `/results` usa `enabled`; no se piden filas que todavía no existen. | — |
| Barra de progreso indeterminada | El worker guarda los contadores al final (en la transacción), así que no hay un porcentaje real que mostrar durante `PROCESSING`. | Para progreso real habría que persistir avances parciales. |
| Tailwind CSS 4 sin `tailwind.config.ts` | Tailwind 4 se configura desde CSS (`@import 'tailwindcss'`) y se integra con `@tailwindcss/postcss`; el archivo de configuración que lista el enunciado ya no es necesario. | Desvío de la estructura sugerida, por versión. |
| Next.js 16 (App Router) | Cumple "Next.js 14+"; en 15+ `params` y `searchParams` son `Promise` y se esperan con `await`. | — |
| Diagrama de AWS en Mermaid, exportado a PNG | `docs/arquitectura-aws.png` es lo que pide la estructura del enunciado; la fuente Mermaid (`docs/arquitectura-aws.md`) se versiona como texto y se regenera con `npx @mermaid-js/mermaid-cli`. | Hay que regenerar el PNG si cambia la fuente. |
| Una imagen Docker para API y worker | Mismo código y dependencias; en ECS cambia solo el comando. Multi-stage: la imagen final no lleva TypeScript ni el CLI de Prisma. | Las migraciones van como task aparte del pipeline. |
| `GET /uploads/summary` | El dashboard necesita conteos por estado y ningún endpoint del enunciado los provee. Decisión del candidato; no agrega campos a la base. | Endpoint adicional al enunciado. |

## 6. Limitaciones conocidas

- **`.env.example` con los mismos valores que `.env`:** decisión consciente para esta prueba, para que quien evalúe pueda levantar el proyecto copiando el archivo. Las credenciales son las de desarrollo local (LocalStack acepta `test`/`test`). En un entorno real, `.env.example` solo tendría claves con valores ficticios y los secretos vivirían en AWS Secrets Manager.

- **Publicación no atómica en `POST /uploads`:** si SQS falla después de guardar en la base, el upload queda en `PENDING` sin mensaje. **Con más tiempo:** patrón *Transactional Outbox* (guardar el mensaje en la misma transacción y publicarlo desde un proceso aparte).
- **Sin `IHttpRequest` / `IHttpResponse`:** los controllers usan los tipos de Fastify directamente; la capa de presentación es, por definición, dependiente del framework.

- **Reporte de errores:** muestra hasta 100 errores y una línea final `...and N more errors`. Un `amount` que desborda a `Infinity` se reporta sin columna; años 0000–0099 se rechazan; un campo entre comillas que ocupa dos líneas se reporta en su última línea. Todos son casos fuera del dominio esperado.
- **Sin autenticación:** `userId` fijo `"user-123"`, como pide el enunciado.
- **Frontend sin tests automatizados:** verificado con `next build` + `tsc` y prueba manual del flujo completo; con más tiempo, tests de componentes con Testing Library y MSW.
- **Polling en lugar de push:** suficiente para la prueba; a escala, SSE o WebSocket.

## 7. Cómo probarlo

Con todo levantado (sección 3): **http://localhost:3000**.

1. **Archivo válido:** en *New upload*, arrastrar `sample-data.csv` (raíz del repo, 60 filas). La app redirige al detalle.
2. **Qué observar:** el badge pasa de `PENDING` (amarillo) a `PROCESSING` (azul) y a `COMPLETED` (verde) **sin recargar**. Un archivo de 60 filas se procesa en menos de un segundo, así que normalmente la primera consulta ya lo encuentra `COMPLETED` y el polling no llega a repetirse; para **ver** el polling usar el paso 6. Aparece la tabla con las 60 filas procesadas y los contadores `60 / 60`.
3. **Errores por fila:** subir `docs/sample-data-with-errors.csv`. Termina `COMPLETED` con 2 filas guardadas y 6 rechazadas, cada una con fila, columna y valor:
   ```
   Row 3, column amount: must be a positive number (value: "-20")
   Row 4, column category: is required (value: "")
   ...
   ```
4. **Archivo inválido:** subir un CSV sin la columna `amount` → `FAILED` (rojo) con el motivo. Un `.txt` se rechaza en el formulario y en la API (`400`).
5. **Lista y dashboard:** `/uploads` muestra todos los uploads paginados; `/` muestra los totales por estado.
6. **Asincronía y polling:** detener el worker (`Ctrl+C`) y subir un archivo: queda `PENDING` y en la pestaña *Network* (filtro `uploads`) aparece `GET /uploads/:id` **cada 3 s**. Volver a iniciar el worker: el upload pasa a `COMPLETED` sin recargar, se piden los resultados y **las consultas se detienen**. El polling se pausa si la pestaña no está visible (comportamiento por defecto de React Query) y se reanuda al volver.

Tests del backend: `npm test` (123 unitarios y de API). Test de integración del bloqueo de fila contra una base **descartable** ya migrada:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/<base_de_prueba> npm test -- PrismaUploadRepository
```
