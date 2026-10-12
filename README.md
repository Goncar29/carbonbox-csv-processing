# CarbonBox — Procesamiento Asíncrono de Documentos CSV

> Estado: **en construcción** (etapa T3 de 6 completada). Este README se actualiza al cerrar cada etapa.
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

# 3. Worker (otra terminal) — disponible desde la etapa T4
# npm run worker

# 4. Frontend (otra terminal) — disponible desde la etapa T5
# cd frontend && npm install && npm run dev
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

## 4. Arquitectura

Bounded context: **`document-processing`**. Las dependencias apuntan hacia adentro: `presentation → application → domain ← infrastructure`.

| Capa | Contenido | Depende de |
|------|-----------|------------|
| `domain` | Aggregate Root `Upload`, entidad `ActivityData`, Value Objects `UploadStatus` y `FileName`, interfaces de repositorio | Nada externo |
| `application` | Commands, Queries y sus handlers (CQRS) | `domain` |
| `infrastructure` | Repositorios Prisma + mappers, S3, SQS, contenedor Awilix | `domain`, librerías |
| `presentation` | Controllers y rutas Fastify | `application` |

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
| `GET /uploads/summary` | El dashboard necesita conteos por estado y ningún endpoint del enunciado los provee. Decisión del candidato; no agrega campos a la base. | Endpoint adicional al enunciado. |

## 6. Limitaciones conocidas

- **`.env.example` con los mismos valores que `.env`:** decisión consciente para esta prueba, para que quien evalúe pueda levantar el proyecto copiando el archivo. Las credenciales son las de desarrollo local (LocalStack acepta `test`/`test`). En un entorno real, `.env.example` solo tendría claves con valores ficticios y los secretos vivirían en AWS Secrets Manager.

- **Publicación no atómica en `POST /uploads`:** si SQS falla después de guardar en la base, el upload queda en `PENDING` sin mensaje. **Con más tiempo:** patrón *Transactional Outbox* (guardar el mensaje en la misma transacción y publicarlo desde un proceso aparte).
- **Sin `IHttpRequest` / `IHttpResponse`:** los controllers usan los tipos de Fastify directamente; la capa de presentación es, por definición, dependiente del framework.

_Se completa al cierre de cada etapa._

## 7. Cómo probarlo

_Se completa en la etapa T6 (incluye `sample-data.csv` con más de 50 filas)._
