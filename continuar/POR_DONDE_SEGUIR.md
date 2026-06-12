# Mayolista 2.0 — Estado del proyecto y próximos pasos

## Estado actual (al 22/05/2026)

La app está deployada y funcionando en:
**https://hectorgperez7060-bit.github.io/mayolista/**

Backend: Firebase (proyecto `mayolista2`)
Plan Firebase: **Spark (gratuito)** — importante para decisiones futuras

---

## Lo que ya está hecho

- [x] Firestore Rules — multi-tenant, cada empresa aislada
- [x] .gitignore protege .env (claves no suben a GitHub)
- [x] `descuentoPedido` se persiste en Firestore al guardar orden
- [x] `metodoEntrada` registra cómo se cargó el pedido (voz-ia / texto-ia / voz / texto / escaner / manual)
- [x] `sesiones` — subcollección que registra login/logout de vendedores con duración
- [x] Campo `zona` en clientes — badge violeta en la tarjeta, buscable
- [x] Documento analytics HTML en `documentacion/analytics-mayolista-v2.html`

---

## TAREA PENDIENTE PRIORITARIA: Restringir clave Gemini por dominio

**Por qué**: La clave Gemini (`VITE_GEMINI_KEY`) queda visible en el bundle JS del browser.
**Solución** (gratis, 2 minutos, sin tocar código):

1. Ir a https://aistudio.google.com/app/apikey
2. Buscar la clave `AIzaSyAcFbz...`
3. Clic en Editar
4. En "Restricciones de aplicación" → elegir **Sitios web HTTP referentes**
5. Agregar: `https://hectorgperez7060-bit.github.io/*`
6. Guardar

Esto hace que si alguien copia la clave, no le funciona fuera del dominio.

**Por qué no usamos Cloud Functions**: Firebase plan Spark no permite deploy de Functions. Requiere plan Blaze (pago). Si en algún momento se pasa a Blaze, ahí sí conviene mover la clave al servidor.

---

## Mejoras pendientes (en orden de impacto)

### 1. ALTA PRIORIDAD — clienteId como referencia real en órdenes
Actualmente las órdenes guardan el objeto cliente completo (nombre, dirección, etc.) en lugar de solo el `clienteId`.
- Esto impide cruzar datos: "cuántos pedidos tiene el cliente X", "cuál fue su último pedido"
- Es el cambio de mayor impacto analítico: habilita ~60% de los KPIs del documento analytics
- **Cómo**: en `saveOrderToFirebase()` guardar `clienteId: order.client.id` además del objeto cliente

### 2. MEDIA PRIORIDAD — Editar cliente existente
Hoy el formulario de clientes solo permite crear, no editar.
Si un cliente cambia de dirección o teléfono, hay que borrarlo y recrearlo.

### 3. MEDIA PRIORIDAD — Contador de pedidos por cliente
Mostrar en la tarjeta del cliente cuántos pedidos tiene registrados.
Requiere hacer la consulta a Firestore al cargar la pantalla de clientes.

### 4. BAJA PRIORIDAD — Zona en órdenes
Cuando se guarda una orden, copiar la zona del cliente para poder filtrar ventas por zona en analytics.

### 5. BAJA PRIORIDAD — Plan Blaze
Si en algún momento se quiere escalar (múltiples empresas, más funciones de IA server-side, notificaciones push), hay que pasar a Blaze. El tier gratuito incluido es generoso: 2M invocaciones/mes.

---

## Arquitectura rápida

```
GitHub Pages          → Frontend React + Vite (HTML/JS/CSS estático)
Firebase Auth         → Login admin (email/password) + vendedor (código+PIN)
Firebase Firestore    → Base de datos NoSQL
  empresas/
    {empresaId}/
      productos/
      clientes/
      vendedores/
      ordenes/         ← incluye descuentoPedido, metodoEntrada
      sesiones/        ← login/logout de vendedores
  usuarios/            ← relación uid → empresaId + rol
Firebase Functions    ← NO deployadas (requiere plan Blaze)
Gemini AI             ← IA para parsear pedidos en lenguaje natural
```

## Roles
- **ADMIN**: hector.g.perez7060@gmail.com (notebook)
- **VENDEDOR**: tramielectric@gmail.com (celular, login con código+PIN)
