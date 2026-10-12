# CarbonBox — Async CSV Document Processing

Objective: full stack system to upload activity CSVs, process them asynchronously (LocalStack SQS + S3) and show results. Source of truth: `PRUEBA-TECNICA-FULLSTACK.md`.
Branch: `feat/document-processing` · Delivery: `ask-on-risk` (atomic work-unit commits) · Test runner: Jest (backend, to be set up in T2) · Time budget: 4h.

## Specs

- **S1 — Prisma schema (no extra fields).** Exactly as in the spec:
  `Upload { id, fileName, fileUrl, status (String: PENDING, PROCESSING, COMPLETED, FAILED), userId, totalRows?, processedRows?, failedRows?, errorMessage?, createdAt, updatedAt, activityData[] }`
  `ActivityData { id, uploadId, category, amount Float, unit, date DateTime, createdAt, upload }`.
- **S2 — CSV format.** Header `category,amount,unit,date`. Validations (verbatim):
  "Todas las columnas son obligatorias" · "`amount` debe ser un número positivo" · "`date` debe ser una fecha válida en formato YYYY-MM-DD" · "`category` no puede estar vacío" · "`unit` no puede estar vacío".
- **S3 — Statuses.** `UploadStatus` value object: PENDING → PROCESSING → COMPLETED | FAILED.
- **S4 — Endpoints.**
  `POST /api/v1/uploads` (FormData file) → `{ id, status, fileName, createdAt }`
  `GET /api/v1/uploads/:id` → `{ id, status, fileName, totalRows, processedRows, errorMessage, ... }` (the `...` is filled ONLY with schema fields)
  `GET /api/v1/uploads?page=1&limit=10` → `{ data: [...], total, page, limit }`
  `GET /api/v1/uploads/:id/results` → `{ data: [{ category, amount, unit, date }, ...] }`
- **S5 — Architecture.** Fastify + Prisma + PostgreSQL (Docker). Bounded context `document-processing`, DDD + Clean Architecture + CQRS (CreateUpload, ProcessFile commands; GetUploadById, ListUploads, GetUploadResults queries). "Todos los handlers deben retornar `Either<Error, Result>`", "No usar `try/catch` en controllers", centralized error middleware, Awilix DI. No auth: `userId = "user-123"`.
- **S6 — Async processing.** LocalStack SQS + S3 (user decision L2). Worker `npm run worker`: consume, download, parse, validate each row, save valid rows, update status, delete message.
- **S7 — Frontend.** Next.js 14+ App Router, React Query, Axios, Tailwind. Pages `/`, `/uploads`, `/uploads/new`, `/uploads/[id]`. Badges PENDING yellow, PROCESSING blue, COMPLETED green, FAILED red; pagination 10; drag & drop / .csv only; redirect to detail after upload.
  Polling every 3s **while status is not COMPLETED nor FAILED** (user decision L2; spec literally says "mientras status = PROCESSING").
- **S8 — Infra & deliverables.** docker-compose (postgres + localstack), env per environment, Dockerfile, AWS diagram (VPC, ALB, ECS Fargate API+Worker, RDS Multi-AZ, S3, SQS+DLQ, CloudWatch, Secrets Manager), `README.md`, `USO-DE-IA.md`, `sample-data.csv` (≥50 rows).

## Tasks

| ID | Specs | Stage (budget) | Route | Status | Commit |
|----|-------|----------------|-------|--------|--------|
| T0 | — | Repo init + ODD doc (10m) | inline | done | (see Log) |
| T1 | S1, S8 | Infra: docker-compose postgres+localstack, bucket/queue init, Prisma schema + migration (30m) | inline | pending | |
| T2 | S3, S5 | Backend core: shared (Either, CQRS, AggregateRoot), domain, Prisma repos, Awilix, Jest (50m) | inline | pending | |
| T3 | S4, S5 | API: Fastify routes, controllers, query/command handlers, error middleware (40m) | inline | pending | |
| T4 | S2, S6 | Async: S3 storage, SQS publisher/consumer, CSV parser (TDD), ProcessFile handler, worker (50m) | inline | pending | |
| T5 | S7 | Frontend: Next.js pages, React Query hooks, polling (60m) | inline | pending | |
| T6 | S8 | Docs: README, USO-DE-IA.md, AWS diagram, sample-data.csv, Dockerfile (20m) | inline | pending | |

## Log

- **L1 (2026-10-12, user, verbatim):** "Lee detenidamente el archivo PRUEBA-TECNICA-FULLSTACK.md que está en la raíz del proyecto. Eres mi asistente técnico para esta prueba de CarbonBox. Debes seguir estrictamente las reglas de negocio descritas: modelos Prisma (Upload y ActivityData), formato CSV obligatorio (category,amount,unit,date), validaciones estrictas (amount positivo, fecha YYYY-MM-DD), estados (PENDING, PROCESSING, COMPLETED, FAILED), y endpoints requeridos. Bajo ninguna circunstancia inventes campos ajenos. Confírmame que leíste y entendiste las reglas antes de escribir código"
- **L2 (2026-10-12, user, verbatim):** "1- iniciaremos con git init e ir documentando 2- vamos a hacer polling mientras no este en completed ni failed 3- usaremos localstack sqs + s3 ya que suma mas puntos 4- usaremos ODD para trabajar en este proyecto por etapas, cada etapa se documenta, me explicaras, dar sugerencias y recomendacion de que y porque y siempre teniendo en cuenta el limite de ventana de contexto y establecido en 4 horas de trabajo"
- **L3 (decision):** Home dir `C:/Users/carlo` is itself a git repo; project gets its own nested repo (`git init -b main`) so history stays isolated.
- **L4 (decision):** Each stage = one work-unit commit (Conventional Commits, no AI attribution per user rule). Stages are sized so a fresh session can resume from this document + `git log`, protecting the context window.
- **Next:** T1 — infra.
