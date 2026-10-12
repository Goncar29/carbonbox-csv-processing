# CarbonBox — Frontend

Next.js 16 (App Router) + TypeScript + React Query + Axios + Tailwind CSS 4.

```bash
npm install
npm run dev        # http://localhost:3000 (requiere la API en http://localhost:3001)
npm run build      # build de producción (también valida tipos)
npm run typecheck
```

La URL de la API se configura con `NEXT_PUBLIC_API_URL` (por defecto `http://localhost:3001/api/v1`) en `.env.local`.

## Estructura

```
src/
├── app/                                  # Rutas (páginas finas)
│   ├── page.tsx                          # Dashboard
│   └── uploads/{page,new/page,[id]/page}.tsx
├── features/document-processing/
│   ├── api/uploadsApi.ts                 # Hooks de React Query + query keys
│   ├── components/                       # UploadForm, UploadList, UploadDetail, ProcessingStatus, ResultsTable, UploadsSummary
│   └── types/upload.types.ts             # Contratos de la API
├── shared/
│   ├── components/                       # Layout, LoadingSpinner, ErrorAlert, Providers
│   └── lib/                              # api-client (Axios), query-client, format
└── styles/globals.css
```

## Polling

`useUpload(id)` usa `refetchInterval`: devuelve `3000` mientras el estado no sea `COMPLETED` ni `FAILED`, y `false` cuando llega a un estado final, lo que detiene el polling sin intervalos manuales. Los resultados (`/uploads/:id/results`) se piden solo cuando el upload está `COMPLETED`.
