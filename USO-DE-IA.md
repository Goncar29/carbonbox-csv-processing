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

### Frontend (T5)
- [x] Páginas del App Router (`/`, `/uploads`, `/uploads/new`, `/uploads/[id]`) con la estructura de carpetas del enunciado
- [x] Hooks de React Query (`uploadsApi.ts`) con polling por `refetchInterval` y cliente Axios configurado
- [x] Formulario con drag & drop, validación `.csv` y barra de progreso de subida
- [x] Estilos con Tailwind CSS 4 y badges de color por estado

### Documentación y despliegue (T6)
- [x] `sample-data.csv` (60 filas) y `docs/sample-data-with-errors.csv`
- [x] `backend/Dockerfile` multi-stage (una imagen para API y worker), verificado con `docker build` y `docker run`
- [x] Diagrama de AWS en Mermaid (`docs/arquitectura-aws.md`), exportado a `docs/arquitectura-aws.png`
- [x] README final (sección "Cómo probarlo")

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

14. **Dos bugs de concurrencia que los tests no veían (hallados por el verificador independiente):**
    - **B1:** si la transacción fallaba en el último intento, el upload quedaba en `PROCESSING` para siempre (el frontend hacía polling infinito). Causa: el agregado ya estaba en `COMPLETED` en memoria y `COMPLETED → FAILED` no es válido. El repositorio en memoria de los tests compartía el mismo objeto y lo escondía. Corrección: el fake guarda copias y el worker recarga el upload antes de marcarlo `FAILED`.
    - **B2:** dos workers con el mismo mensaje duplicaban las filas. Corrección: bloqueo de fila (`SELECT ... FOR UPDATE`) y escrituras condicionadas al estado. Probado con un test de integración contra PostgreSQL real.
    - Decidí corregir ambos (aunque B2 solo aparece con varios workers) porque el diagrama de AWS escala el worker en ECS. Una observación menor (A5: un worker con una copia vieja podía hacer retroceder un instante un upload terminado a `PROCESSING`) se corrigió después con el mismo enfoque: un update condicional, con su test escrito antes.

15. **Comando de Docker incompleto:** la primera versión del comando `docker run` del README no funcionaba (la API escuchaba solo en localhost dentro del contenedor). Se detectó al probarlo y se agregó `HOST=0.0.0.0`.

16. **Estimación de tiempo equivocada:** la IA había anotado "~3 h usadas" en su memoria; al medirlo con los timestamps de git eran ~2 h. La tabla de tiempos se recalculó con git.

## ¿Qué Aprendí?

Ordenado por etapa. Escrito con mis palabras mientras trabajaba y leía documentación.

### T1 — Infraestructura

1. **LocalStack + SQS:**
   - Al comenzar la prueba no sabía que LocalStack existía.
   - Aprendí que es un emulador de AWS que se ejecuta localmente (en un contenedor Docker) y expone las mismas APIs que los servicios reales, en este caso S3 (almacenamiento) y SQS (el servicio de colas de mensajería de AWS).
   - Esto permite desarrollar y probar el flujo asíncrono sin una cuenta de AWS ni costos: el mismo código funcionará contra AWS real cambiando solo el endpoint y las credenciales.

### T2 — Núcleo del backend

2. **Either:**
   - Entendí que Either es una forma de no depender de `try/catch` ni de valores como `null` para indicar un error: se usa `Right` para decir que algo salió bien y `Left` para decir que algo falló.
   - Precisión que incorporé: Either es para los errores *esperables* de negocio y, a diferencia de `null`, trae el motivo del error tipado. Los fallos inesperados (por ejemplo, la base de datos caída) se siguen lanzando y los atrapa el manejador central.

3. **CQRS:**
   - Es un patrón arquitectónico que ayuda a separar responsabilidades.
   - Precisión que incorporé: separa específicamente la *escritura* (commands, cambian estado) de la *lectura* (queries, nunca cambian estado). Aquí se aplica a nivel de código, con una misma base de datos.

4. **Aggregate Root:**
   - Viene de DDD y funciona como punto de defensa de la entrada desde el exterior.
   - Precisión que incorporé: es la frontera de consistencia; protege las invariantes (por ejemplo, no se puede completar un upload que nunca empezó a procesarse).

5. **Compilación vs. ejecución (TypeScript):**
   - **Antes:** pensaba que TypeScript, por ser tipado, protegía todo, también cuando el programa ya está corriendo.
   - **Ahora entiendo:** TypeScript transpila a JavaScript; por eso el desarrollador ve los errores de tipos antes de hacer el build, evitando que lleguen a producción. En ejecución, Node, con su motor V8, traduce el JS a lenguaje máquina sobre la marcha. Pero los tipos se borran al transpilar: no protegen los datos que llegan en ejecución.

6. **Tipado estructural de TypeScript:**
   - **Antes:** no sabía que TypeScript comparaba los tipos por su forma.
   - **Ahora entiendo:** TypeScript es estructural: compara tipos por sus propiedades y métodos, no por su nombre. Dos clases con la misma forma son intercambiables para el compilador, como dos llaves con el mismo dentado que abren la misma puerta aunque tengan etiquetas distintas.

### T3 — API

7. **Puertos y adaptadores:**
   - **Antes:** no entendía cómo funcionaba internamente, por detrás, la conexión entre la lógica y servicios como S3 o la base de datos.
   - **Ahora entiendo:** se basa en la arquitectura: el dominio y la lógica de negocio no hablan directamente con el mundo exterior. Lo hacen a través de los puertos, que son contratos (interfaces) definidos por el núcleo. Los adaptadores son las clases que implementan esos contratos usando los frameworks: Fastify en la entrada (HTTP), y Prisma y el SDK de AWS en la salida.

8. **Tests en verde no siempre significan que todo sale bien:**
   - Hay que analizarlos dependiendo del caso.
   - Ejemplo en este proyecto: los tests de API usan repositorios en memoria, así que prueban HTTP, controllers y handlers, pero no Prisma, S3 ni SQS. Por eso también se probó contra la infraestructura real (PostgreSQL + LocalStack). Un test solo prueba lo que afirma.

### T4 — Procesamiento asíncrono

9. **Reintento explícito en el Aggregate Root:**
   - Entendí que si se agregaba `PROCESSING` a la tabla de transiciones, cualquier código podría llamar a `startProcessing()` dos veces y nadie se daría cuenta. Con un método con nombre propio (`restartProcessing()`), el reintento queda explícito e intencional.

10. **Error de negocio vs. error técnico en la cola:**
   - **Antes:** no distinguía entre tipos de error: un fallo era un fallo.
   - **Ahora entiendo:** el error de negocio es cuando no se cumplen las reglas de negocio: si un CSV no cumple los requisitos, debe fallar, y reintentarlo no lo arregla. El error técnico, por ejemplo S3 caído, no es parte de la regla de negocio: ahí sí hay que intentar que se procese nuevamente.
   - **En el proyecto:** el worker solo borra el mensaje cuando el resultado es definitivo. Un CSV que no cumple el formato deja el upload en `FAILED` y el mensaje se borra (reintentarlo no lo arregla); las filas inválidas sueltas se reportan y el upload queda `COMPLETED`. Un error técnico (S3 o la base caídos) no borra el mensaje: SQS lo vuelve a entregar cuando vence el visibility timeout (60 s) y, tras 3 intentos, el worker marca el upload `FAILED` y SQS mueve el mensaje a la DLQ. La espera creciente (1 s, 2 s, 4 s… hasta 30 s) se usa solo cuando el worker no puede leer de la cola.

11. **Handler vs. servicio:**
   - **Antes:** pensaba que el handler hacía todo.
   - **Ahora entiendo:** funciona como en un restaurante: el mozo (handler) toma el pedido, lo lleva a la cocina y sirve el plato; el chef (servicio) decide cómo se cocina. Si cambia la receta, el mozo no se entera. En términos técnicos: el handler coordina el I/O (repositorios, S3, reintentos) y el servicio aplica la regla de negocio sin I/O, así que se testea solo con datos de entrada y salida.

12. **Entrega "al menos una vez", idempotencia y el bug de concurrencia:**
   - **Antes:** me lo imaginaba como funciona JavaScript: hace una sola cosa a la vez (por eso existe la asincronía) y termina una pila de trabajo antes de seguir con otra. Pensaba que un mensaje llegaba una sola vez.
   - **Ahora entiendo:** los workers son procesos separados e independientes, cada uno con su propio event loop; por eso dos workers pueden procesar el mismo mensaje al mismo tiempo. El modelo de "una cosa a la vez" de JavaScript protege dentro de un proceso, no entre procesos. Como SQS puede entregar un mensaje más de una vez, el procesamiento tiene que ser idempotente: repetirlo varias veces debe dar el mismo resultado que hacerlo una sola vez.

13. **Tests unitarios con fakes vs. integración con infraestructura real:**
   - **Antes:** siempre creí que los tests son importantes, y que tenerlos en verde era señal de que todo estaba bien.
   - **Ahora entiendo:** los tests en verde no siempre significan que todo está bien. Los unitarios con repositorios en memoria son rápidos y prueban la lógica, pero un `Map` no tiene transacciones ni concurrencia, así que hay bugs que no pueden ver. También aprendí que hay que ver un test en rojo antes de confiar en él: si nunca falló, no sé si detecta el error. Como aplicación futura, también quiero sumar pruebas de carga y de seguridad (medir cuántos requests soporta el sistema y cómo responde ante ataques).

### T6 — Docker y despliegue

14. **Docker multi-stage y migraciones separadas:**
   - **Antes:** pensaba que una imagen llevaba una pequeña copia del código fuente que lo hacía funcionar rápido, pero al usarla se notaba el consumo de memoria de Docker.
   - **Ahora entiendo:** la imagen es una foto del disco (sistema base, Node, dependencias y código): ocupa espacio y es lo que se descarga. La memoria la consume el contenedor mientras corre (y, en Windows, la máquina virtual de Docker Desktop). Con multi-stage se compila en una etapa y a producción solo va el resultado, sin las herramientas de desarrollo. Y las migraciones van aparte, una sola vez, porque varias instancias migrando a la vez competirían por la misma base.

### Transversal — Trabajo con IA

15. **Fecha de corte de la IA:**
   - **Antes:** sabía en teoría que la IA tiene una fecha de corte, pero no lo había visto afectar un proyecto real.
   - **Ahora entiendo:** la IA sabe hasta el punto en que fue entrenada; si hoy sale una versión nueva de una tecnología, no la va a saber aplicar realmente, porque no fue entrenada con ella, y ni siquiera sabe que no la conoce. Por eso, por más que exista la mejor IA, debo seguir en constante estudio: la IA puede cometer errores, no puede decidir todo, porque no sabe lo que realmente quiero, y hay criterios que debo tomar yo. Por ejemplo, si una web carga imágenes, decidir que se sirvan en un formato más optimizado como WebP para evitar sobrecargar la web.

## Limitaciones Encontradas con IA

1. **Información desactualizada por defecto:**
   - Las versiones "recomendadas" (`latest`) no siempre son las adecuadas: hubo que verificar en npm, Docker Hub y la documentación oficial antes de fijarlas.
2. **El entorno local no es visible para la IA hasta que algo falla:**
   - El conflicto con el PostgreSQL nativo solo apareció al ejecutar la migración; se diagnosticó revisando qué procesos escuchaban en el puerto 5432.
3. **La sesión se cerró a mitad de una verificación:** el veredicto del verificador se perdió y hubo que relanzarlo. El documento de seguimiento y los commits permitieron retomar sin perder trabajo.
4. **Herramientas del entorno:** la extensión de Chrome no estaba conectada (la prueba visual del frontend quedó para hacerla a mano) y `curl` de Git Bash subía como vacío un archivo con un byte NUL, lo que al principio parecía un bug de la API.

## Tiempo Invertido

| Etapa | Estimado | Real |
|-------|----------|------|
| T0 — Lectura del enunciado, repositorio y plan | 10 min | ~15 min (antes del primer commit, 11:40) |
| T1 — Infraestructura | 30 min | ~28 min (11:40 → 12:08) |
| T2 — Backend core | 50 min | ~21 min (12:08 → 12:29) |
| T3 — API | 40 min | ~12 min (12:29 → 12:41) |
| T4 — Procesamiento asíncrono + corrección de B1/B2 | 50 min | ~32 min (12:41 → 12:59 y 13:13 → 13:27) |
| T5 — Frontend | 60 min | ~14 min (12:59 → 13:13, en paralelo con la verificación de T4) |
| T6 — Documentación final | 20 min | ~20 min (13:27 → ~13:47) |
| **Total** | **4 h** | **~2 h 20 min** |

Medido con los timestamps de los commits (`git log`). Incluye el tiempo de una sesión de IA que se cerró y hubo que retomar.
