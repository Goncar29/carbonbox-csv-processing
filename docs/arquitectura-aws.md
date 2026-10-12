# Arquitectura en AWS

Propuesta de despliegue productivo. En local, S3 y SQS se emulan con LocalStack y PostgreSQL corre en Docker; el código es el mismo, solo cambian las variables de entorno (`AWS_ENDPOINT` vacío en AWS).

```mermaid
flowchart TB
    user([Usuario / navegador])

    subgraph aws[AWS — región us-east-1]
        subgraph vpc[VPC 10.0.0.0/16 — 2 zonas de disponibilidad]
            subgraph public[Subnets públicas AZ-a / AZ-b]
                alb[Application Load Balancer<br/>HTTPS 443 · ACM<br/>SG-ALB: 443 desde Internet]
                nat[NAT Gateway<br/>salida de las tasks a Internet]
            end

            subgraph private_app[Subnets privadas de aplicación AZ-a / AZ-b]
                subgraph ecs[ECS Fargate cluster]
                    api[API Service<br/>Fastify · 2+ tasks<br/>SG-API: 3001 solo desde SG-ALB]
                    worker[Worker Service<br/>1..N tasks<br/>auto-scaling por mensajes en cola<br/>SG-Worker: sin entrada]
                end
            end

            subgraph private_data[Subnets privadas de datos AZ-a / AZ-b]
                rds[(RDS PostgreSQL<br/>Multi-AZ: primaria + standby<br/>SG-RDS: 5432 desde SG-API y SG-Worker)]
            end

            vpce[VPC Endpoints<br/>S3 gateway · SQS interface]
        end

        s3[(S3 carbonbox-uploads<br/>privado · cifrado SSE-S3<br/>lifecycle: Glacier a 90 días)]
        sqs[[SQS file-processing-queue<br/>visibility timeout 60 s]]
        dlq[[SQS file-processing-dlq<br/>maxReceiveCount 3]]
        secrets[Secrets Manager<br/>credenciales de RDS]
        cw[CloudWatch<br/>Logs · métricas · alarmas]
    end

    frontend[Frontend Next.js<br/>Vercel o S3 + CloudFront]

    user -->|HTTPS| frontend
    user -->|HTTPS /api/v1| alb
    alb --> api
    api -->|PutObject| vpce
    worker -->|GetObject| vpce
    vpce --> s3
    api -->|SendMessage| sqs
    sqs -->|ReceiveMessage| worker
    sqs -.->|3 fallos| dlq
    api --> rds
    worker -->|transacción + bloqueo de fila| rds
    api -. credenciales .-> secrets
    worker -. credenciales .-> secrets
    api -. logs .-> cw
    worker -. logs .-> cw
    sqs -. ApproximateNumberOfMessagesVisible .-> cw
    cw -. escala tasks .-> worker
    dlq -. alarma si > 0 .-> cw
```

## Cómo se conectan los componentes

| Componente | Rol | Por qué así |
|------------|-----|-------------|
| **VPC con 2 AZ** | Subnets públicas (ALB, NAT), privadas de aplicación (ECS) y privadas de datos (RDS) | Nada de la aplicación ni la base es accesible desde Internet; si cae una zona, la otra sigue atendiendo. |
| **Security groups encadenados** | ALB → API (3001) → RDS (5432); el worker no acepta conexiones entrantes | Cada capa solo acepta tráfico de la capa anterior (mínimo privilegio en red). |
| **ALB** | Termina HTTPS (certificado ACM) y reparte entre tasks de la API con health check en `/health` | Las tasks de Fargate cambian de IP; el ALB las registra solas. |
| **ECS Fargate — API** | 2+ tasks en AZ distintas | Alta disponibilidad sin administrar servidores. |
| **ECS Fargate — Worker** | Misma imagen, comando `node dist/workers/index.js`; escala con la métrica de mensajes visibles en SQS | El trabajo pesado no afecta la latencia de la API, y escala con la carga real. Es seguro escalar: el worker es idempotente y usa bloqueo de fila (ver README). |
| **RDS PostgreSQL Multi-AZ** | Standby sincrónico en otra AZ con failover automático | Los uploads y sus filas no se pierden si cae una zona. |
| **S3 privado** | Guarda el CSV original; *lifecycle* a Glacier a los 90 días | El archivo queda para auditoría o reproceso sin pagar almacenamiento caliente. |
| **SQS + DLQ** | Desacopla la subida del procesamiento; tras 3 fallos el mensaje va a la DLQ | La API responde `202` al instante; los mensajes envenenados se aíslan en vez de reintentarse para siempre. |
| **VPC Endpoints** | S3 (gateway) y SQS (interface) | El tráfico a S3/SQS no sale por el NAT: más barato y no pasa por Internet. |
| **Secrets Manager** | Credenciales de RDS inyectadas como variables de entorno en la task definition | Sin secretos en el código ni en la imagen; rotación automática. |
| **IAM task roles** | API: `s3:PutObject`, `sqs:SendMessage`. Worker: `s3:GetObject`, `sqs:ReceiveMessage/DeleteMessage` | Cada servicio solo puede hacer lo que necesita. Reemplaza las claves `test/test` de LocalStack. |
| **CloudWatch** | Logs JSON de pino, métricas de ECS/RDS/SQS, alarmas (DLQ > 0, CPU, errores 5xx del ALB) | Un mensaje en la DLQ es un upload que alguien tiene que mirar. |
| **ECR** (fuera del diagrama) | Registro de la imagen construida con `backend/Dockerfile` | Una imagen, dos servicios. Las migraciones corren como task puntual (`prisma migrate deploy`) antes de desplegar. |
