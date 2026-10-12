# CarbonBox — Procesamiento Asíncrono de Documentos CSV

> Estado: **en construcción** (etapa T1 de 6 completada). Este README se actualiza al cerrar cada etapa.
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
# npm run dev        (disponible desde la etapa T3)

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

## 4. Arquitectura

_Se completa en las etapas T2–T4:_ bounded context `document-processing`, capas (domain, application, infrastructure, presentation), CQRS, Either pattern e inyección de dependencias con Awilix.

## 5. Decisiones técnicas

| Decisión | Motivo | Trade-off |
|----------|--------|-----------|
| LocalStack fijado en `4.14.0` | Desde `2026.03.0` todas las imágenes de LocalStack exigen `LOCALSTACK_AUTH_TOKEN`. `4.14.0` es la última versión community que arranca sin cuenta (verificado: `"edition": "community"`). | No recibe actualizaciones; suficiente para S3 y SQS en desarrollo. |
| Prisma fijado en `6.19.3` | El tag `latest` de npm apunta a una release candidate (`8.0.0-rc`). Prisma 6 usa el generador clásico sin driver adapters, lo que reduce configuración dentro del presupuesto de 4 horas. | No se usan las novedades de Prisma 7. |
| Schema Prisma en `src/document-processing/infrastructure/persistence/models/` | Respeta la estructura de carpetas propuesta por la prueba (persistencia como detalle de infraestructura). | Requiere configurar `prisma.schema` en `package.json`. |
| `@@index([uploadId])` en `ActivityData` | PostgreSQL no indexa claves foráneas automáticamente y `GET /uploads/:id/results` filtra por `uploadId`. | Es un índice, no un campo: el modelo mantiene exactamente los campos del enunciado. |
| Cola principal con Dead Letter Queue (`maxReceiveCount: 3`) | Un mensaje que falla 3 veces se aísla en la DLQ en lugar de reintentarse indefinidamente. | Requiere monitorear la DLQ. |
| IDs sin `@default` en Prisma | Los IDs se generan en la capa de dominio (el agregado nace con identidad). | — |

## 6. Limitaciones conocidas

- **`.env.example` con los mismos valores que `.env`:** decisión consciente para esta prueba, para que quien evalúe pueda levantar el proyecto copiando el archivo. Las credenciales son las de desarrollo local (LocalStack acepta `test`/`test`). En un entorno real, `.env.example` solo tendría claves con valores ficticios y los secretos vivirían en AWS Secrets Manager.

_Se completa al cierre de cada etapa._

## 7. Cómo probarlo

_Se completa en la etapa T6 (incluye `sample-data.csv` con más de 50 filas)._
