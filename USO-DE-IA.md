# Uso de Inteligencia Artificial en esta Prueba

> Documento vivo: se actualiza al cerrar cada etapa del plan (`odd/tasks/carbonbox-document-processing.md`).

## Herramientas Utilizadas

- [x] Claude Code (asistente principal, en terminal)
- [ ] GitHub Copilot
- [ ] ChatGPT
- [ ] Cursor AI
- [ ] Otra: ____

## Forma de Trabajo con la IA

- **Yo dirijo, la IA ejecuta.** Antes de escribir código le pedí a Claude Code que leyera el enunciado y me confirmara las reglas de negocio (modelos Prisma, formato CSV, validaciones, estados y endpoints), con la instrucción explícita de **no inventar campos**.
- **Trabajo por etapas (T0–T6)** con un documento de seguimiento (`odd/tasks/...`) que guarda los requisitos citados textualmente, las tareas y un registro de decisiones. Cada etapa termina en un commit atómico. Esto permite retomar el trabajo aunque se pierda el contexto de la conversación con la IA.
- **Las decisiones las tomé yo**, con la IA proponiendo opciones y sus trade-offs:
  - Polling mientras el estado **no** sea `COMPLETED` ni `FAILED` (el enunciado dice "mientras status = PROCESSING"; tomado literal, un upload en `PENDING` nunca se refrescaría).
  - LocalStack (SQS + S3 reales emulados) en lugar de un mock en memoria, porque suma puntos en mensajería y habilita la DLQ.
  - Fijar versiones concretas de LocalStack y Prisma.

## ¿Qué Generé con IA?

### Infraestructura (T1)
- [x] `docker-compose.yml` con PostgreSQL y LocalStack
- [x] Script de inicialización de LocalStack (bucket S3, cola SQS y Dead Letter Queue)
- [x] Schema de Prisma (a partir del schema mínimo del enunciado, sin campos adicionales)
- [x] `.gitignore` y `.gitattributes`

### Backend
- [ ] _(etapas T2–T4)_

### Frontend
- [ ] _(etapa T5)_

## ¿Qué Modifiqué o Corregí?

1. **Imagen de LocalStack:**
   - El enunciado propone `localstack/localstack:latest`.
   - Al investigar, la IA encontró que desde marzo de 2026 las imágenes nuevas exigen una cuenta y un token. Le pedí fijar una versión concreta: se verificó en vivo que `4.14.0` arranca sin token.

2. **Versión de Prisma:**
   - Un `npm install prisma` habría instalado una release candidate (`8.0.0-rc`), porque el tag `latest` de npm apunta a ella.
   - Se fijó `6.19.3` con `--save-exact`.

3. **Conflicto de puerto y datos mezclados (error real durante la etapa T1):**
   - La primera migración falló con `P1000: Authentication failed`.
   - Causa 1: en mi máquina hay un PostgreSQL nativo de Windows escuchando en el puerto 5432, y Prisma se conectaba a ese en lugar de al contenedor.
   - Causa 2: el volumen de Docker reutilizaba datos de un intento anterior de esta prueba.
   - Solución: puerto `5433` en el host y nombre de proyecto explícito en Docker Compose (`name: carbonbox`) para usar volúmenes nuevos, sin borrar nada.

4. **Finales de línea en Windows:**
   - Se agregó `.gitattributes` para forzar `LF` en los `.sh`: con `CRLF` el script de inicialización fallaría dentro del contenedor Linux.

## ¿Qué Aprendí?

_Sección para completar con mis propias palabras al cierre de cada etapa._

1. **LocalStack:**
   - _..._
2. **Docker Compose (volúmenes y nombres de proyecto):**
   - _..._

## Limitaciones Encontradas con IA

1. **Información desactualizada por defecto:**
   - Las versiones "recomendadas" (`latest`) no siempre son las adecuadas: hubo que verificar en npm, Docker Hub y la documentación oficial antes de fijarlas.
2. **El entorno local no es visible para la IA hasta que algo falla:**
   - El conflicto con el PostgreSQL nativo solo apareció al ejecutar la migración; se diagnosticó revisando qué procesos escuchaban en el puerto 5432.

## Tiempo Invertido

| Etapa | Estimado | Real |
|-------|----------|------|
| T0 — Repositorio y plan | 10 min | ~10 min |
| T1 — Infraestructura | 30 min | ~20 min |
| T2 — Backend core | 50 min | |
| T3 — API | 40 min | |
| T4 — Procesamiento asíncrono | 50 min | |
| T5 — Frontend | 60 min | |
| T6 — Documentación final | 20 min | |
| **Total** | **4 h** | |
