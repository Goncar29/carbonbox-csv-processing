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

### Backend — núcleo (T2)
- [x] Configuración de TypeScript y Jest
- [x] `Either`, `ValueObject`, `Entity`, `AggregateRoot` y errores de dominio tipados
- [x] Dominio: `Upload`, `ActivityData`, `UploadStatus`, `FileName` (tests escritos primero, TDD)
- [x] Interfaces de repositorio, repositorios Prisma, mappers y contenedor Awilix

### Backend — API (T3)
- [x] Configuración con convict
- [x] Commands, queries y handlers (CQRS), controllers, rutas y manejador de errores centralizado
- [x] Adaptadores de S3 y SQS, endpoint de resumen para el dashboard
- [x] Tests de API con `fastify.inject` (escritos antes de la implementación)

### Backend — procesamiento asíncrono (T4)
- [x] Parser CSV con validaciones y reporte de errores por fila y columna (29 tests escritos antes)
- [x] `ProcessFileCommandHandler` idempotente y transacción de Prisma
- [x] Consumidor SQS y worker con backoff exponencial
- [x] Verificación independiente con un subagente que no escribió el código (ver más abajo)

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

5. **Versión de TypeScript:**
   - `typescript@latest` es la versión 7 (reescrita en Go). Antes de instalar se verificó que `ts-jest` solo soporta `<7`, por lo que se fijó `5.9.3`.

6. **Estructura propuesta vs. criterio propio:**
   - La estructura del enunciado incluye `ICommandBus.ts`. Decidí no implementarlo: con Awilix cada handler se inyecta directamente y un bus no aportaba valor con 5 handlers (documentado en el README).

7. **Verificación más allá de los tipos:**
   - Además de los 49 tests unitarios, los repositorios se probaron contra PostgreSQL real con un script temporal (crear, transicionar estados, guardar filas, paginar y limpiar).

8. **Ubicación de las interfaces de mensajería:**
   - La estructura sugerida pone `IMessagePublisher` en `shared/infrastructure`. Al revisarlo, la capa de aplicación quedaba dependiendo de infraestructura, lo que contradice la regla de dependencias del propio enunciado. Se movieron a `shared/application` como puertos.

9. **Tests que fallaban por una dependencia ESM (error real durante la etapa T3):**
   - Los 16 tests de API fallaron con `Must use import to load ES Module: .../cookie/dist/index.js`.
   - No era un error de nuestro código: `fastify.inject` usa `light-my-request`, que hace `require()` de `cookie`, que ahora se publica solo como ESM.
   - Se verificó en la documentación oficial de Jest que en Node ≥ 24.9 se soporta `require(esm)` habilitando `--experimental-vm-modules`, y se dejó en el script `npm test` de forma compatible con Windows.

10. **Errores de negocio vs. errores inesperados en HTTP:**
    - Un único manejador traduce `ValidationError` → 400, `NotFoundError` → 404, `ConflictError` → 409. Los errores inesperados devuelven un 500 genérico para no exponer detalles internos (por ejemplo, IPs de la base de datos) y se registran en el log.

11. **Decisiones de negocio que la IA no tomó sola (T4):**
    - La IA presentó 4 decisiones abiertas con su recomendación y yo decidí: worker idempotente, transacción única, `COMPLETED` con detalle de errores por fila y columna (reutilizando `errorMessage` para no inventar campos) y un endpoint de resumen para el dashboard.

12. **Un test que falló a propósito:**
    - Al exigir un reporte cuando hay filas fallidas, un test anterior (completar con `failedRows: 2` sin reporte) empezó a fallar. No era un bug: el test avisaba que cambié una regla existente. Como el cambio era intencional, se actualizó el test.

13. **Tipos de una librería que no reflejan la realidad:**
    - Los tipos de `csv-parse` no contemplan que la opción `info: true` cambia la forma del resultado. Se verificó en vivo la forma real antes de hacer la conversión de tipos, y se dejó el motivo en un comentario.

## ¿Qué Aprendí?

_Sección para completar con mis propias palabras al cierre de cada etapa._

1. **LocalStack + SQS:**
   - Al comenzar la prueba no sabía que LocalStack existía.
   - Aprendí que es un emulador de AWS que se ejecuta localmente (en un contenedor Docker) y expone las mismas APIs que los servicios reales, en este caso S3 (almacenamiento) y SQS (el servicio de colas de mensajería de AWS).
   - Esto permite desarrollar y probar el flujo asíncrono sin una cuenta de AWS ni costos: el mismo código funcionará contra AWS real cambiando solo el endpoint y las credenciales.

2. **Either:**
   - Entendí que Either es una forma de no depender de `try/catch` ni de valores como `null` para indicar un error: se usa `Right` para decir que algo salió bien y `Left` para decir que algo falló.
   - Precisión que incorporé: Either es para los errores *esperables* de negocio y, a diferencia de `null`, trae el motivo del error tipado. Los fallos inesperados (por ejemplo, la base de datos caída) se siguen lanzando y los atrapa el manejador central.

3. **CQRS:**
   - Es un patrón arquitectónico que ayuda a separar responsabilidades.
   - Precisión que incorporé: separa específicamente la *escritura* (commands, cambian estado) de la *lectura* (queries, nunca cambian estado). Aquí se aplica a nivel de código, con una misma base de datos.

4. **Aggregate Root:**
   - Viene de DDD y funciona como punto de defensa de la entrada desde el exterior.
   - Precisión que incorporé: es la frontera de consistencia; protege las invariantes (por ejemplo, no se puede completar un upload que nunca empezó a procesarse).

5. **Reintento explícito en el Aggregate Root:**
   - Entendí que si se agregaba `PROCESSING` a la tabla de transiciones, cualquier código podría llamar a `startProcessing()` dos veces y nadie se daría cuenta. Con un método con nombre propio (`restartProcessing()`), el reintento queda explícito e intencional.

6. **Tests en verde no siempre significan que todo sale bien:**
   - Hay que analizarlos dependiendo del caso.
   - Ejemplo en este proyecto: los tests de API usan repositorios en memoria, así que prueban HTTP, controllers y handlers, pero no Prisma, S3 ni SQS. Por eso también se probó contra la infraestructura real (PostgreSQL + LocalStack). Un test solo prueba lo que afirma.

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
| T2 — Backend core | 50 min | ~35 min |
| T3 — API | 40 min | ~40 min |
| T4 — Procesamiento asíncrono | 50 min | ~55 min |
| T5 — Frontend | 60 min | |
| T6 — Documentación final | 20 min | |
| **Total** | **4 h** | |
