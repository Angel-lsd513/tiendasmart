# TiendaSmart

Gestión inteligente para tiendas de abarrotes: ventas, inventario, precios, compras, finanzas y control visual de anaqueles con IA.

## Desarrollo

```bash
npm install
npm run dev
```

## Variables de entorno

Crea un `.env.local` con:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Y configura `ANTHROPIC_API_KEY` en el entorno de despliegue (Vercel) para el endpoint `/api/claude`.

## Build

```bash
npm run build
```

## Despliegue

Desplegado en Vercel: [tiendasmart-app.vercel.app](https://tiendasmart-app.vercel.app)
