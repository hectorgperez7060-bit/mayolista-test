# Mayolista 2 — Guía de Arranque

## Qué es este proyecto

Versión mejorada de Mayolista. Misma app por fuera, arquitectura completamente distinta por dentro:

- **React + Vite** (en lugar de HTML/JS)
- **Firebase** como base de datos y autenticación
- **Multi-tenant real**: cada mayorista tiene su propio espacio aislado
- **Vendedores con código + PIN** (en lugar de solo nombre)
- **Datos aislados a nivel servidor** (Firestore Rules)

---

## Paso 1 — Abrir en VS Code

Abrí la carpeta `mayolista.2` en VS Code.

---

## Paso 2 — Crear claves nuevas (OBLIGATORIO)

Las claves del proyecto anterior están comprometidas. Generá nuevas:

### Firebase
1. Entrá a https://console.firebase.google.com
2. Creá un nuevo proyecto o usá el existente "mayolista"
3. Configuración del proyecto → Tus apps → Web → Registrar app
4. Copiá las credenciales

### Gemini
1. Entrá a https://aistudio.google.com
2. Get API Key → Create API Key
3. Copiá la clave

---

## Paso 3 — Crear el archivo .env

Creá el archivo `.env` en la raíz de `mayolista.2` con este contenido:

```
VITE_FIREBASE_API_KEY=TU_CLAVE_AQUI
VITE_FIREBASE_AUTH_DOMAIN=TU_PROYECTO.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=TU_PROYECTO
VITE_FIREBASE_STORAGE_BUCKET=TU_PROYECTO.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=TU_ID
VITE_FIREBASE_APP_ID=TU_APP_ID
VITE_GEMINI_KEY=TU_CLAVE_GEMINI
```

NUNCA subas este archivo a internet (ya está en .gitignore).

---

## Paso 4 — Instalar dependencias

Abrí la terminal en VS Code (Ctrl+`) y escribí:

```
npm install
```

---

## Paso 5 — Probar que funciona

```
npm run dev
```

Abrí http://localhost:5173 en el navegador.

---

## Lo que ya tiene este proyecto

- Multi-tenant (múltiples mayoristas independientes)
- Login mayorista: email + contraseña
- Login vendedor: código de empresa + nombre
- Captura de pedidos con voz + IA
- Escáner de códigos de barras
- Gestión de catálogo (Excel)
- Gestión de clientes
- Historial de pedidos
- Export: WhatsApp, PDF con logo, Excel
- Bloqueo de vendedores en tiempo real
- Panel de administración completo

## Lo que falta agregar (de la versión anterior)

- Historial agrupado por cliente con encabezado visual
- Export Excel completo del historial total
- Clientes con campos: CUIT, dirección, localidad, tel, email (obligatorios)
- Roles de super-admin por email (vos y Jorge)

---

## Estructura del proyecto

```
src/
├── screens/          ← Pantallas principales
├── components/       ← Componentes reutilizables
├── services/         ← Firebase, Gemini
├── store.js          ← Estado global (Zustand)
└── App.jsx           ← Enrutador principal
```
