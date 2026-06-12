# Cloud Functions — Mayolista Multi-Tenant

## Setup Inicial

```bash
npm install -g firebase-tools
cd mayolista-real
firebase init functions
# Selecciona: JavaScript, ESLint, npm install

cd functions
npm install firebase-admin
```

## functions/index.js

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// ============================================================
// 1. CREAR NUEVA EMPRESA (Mayorista)
// ============================================================
exports.createEmpresa = functions.https.onCall(async (data, context) => {
  // Validar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Debes estar autenticado"
    );
  }

  const uid = context.auth.uid;
  const { nombre, cuit, email, telefono, condicionIVA, logo } = data;

  // Validar datos
  if (!nombre || nombre.length < 2) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Nombre inválido"
    );
  }
  if (!cuit || cuit.length < 8) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "CUIT inválido"
    );
  }

  // Generar código único para empresa
  const codigo = `${nombre.toUpperCase().slice(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // Crear documento de empresa
    const empresaRef = db.collection("empresas").doc();
    await empresaRef.set({
      nombre,
      cuit,
      email,
      telefono,
      condicionIVA: condicionIVA || "RESPONSABLE_INSCRIPTO",
      logo: logo || "",
      codigo: codigo,
      ownerId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      estado: "ACTIVA",
      plan: "GRATUITO"
    });

    // Vincular usuario a empresa
    await db.collection("usuarios").doc(uid).set({
      empresaId: empresaRef.id,
      email: context.auth.token.email,
      rol: "ADMIN",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      empresaId: empresaRef.id,
      codigo: codigo,
      message: "Empresa creada exitosamente"
    };
  } catch (error) {
    console.error("Error creando empresa:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Error al crear empresa: " + error.message
    );
  }
});

// ============================================================
// 2. GENERAR CÓDIGO DE VENDEDOR (Compartible)
// ============================================================
exports.generateVendorCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "No autenticado"
    );
  }

  const uid = context.auth.uid;
  const { empresaId, vendedorNombre } = data;

  try {
    // Validar que el usuario pertenece a esta empresa
    const userDoc = await db.collection("usuarios").doc(uid).get();
    if (!userDoc.exists || userDoc.data().empresaId !== empresaId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes acceso a esta empresa"
      );
    }

    // Generar código único
    const codigoVendedor = `${vendedorNombre.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const pinVendedor = Math.floor(1000 + Math.random() * 9000).toString();

    // Guardar vendedor
    const vendedorRef = db.collection("empresas").doc(empresaId).collection("vendedores").doc();
    await vendedorRef.set({
      nombre: vendedorNombre,
      codigo: codigoVendedor,
      pin: pinVendedor, // Hashear en producción: bcrypt
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      estado: "ACTIVO"
    });

    return {
      success: true,
      codigo: codigoVendedor,
      pin: pinVendedor,
      mensaje: "⚠️ COMPARTE ESTO CON TU VENDEDOR (una sola vez)"
    };
  } catch (error) {
    console.error("Error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ============================================================
// 3. VALIDAR VENDEDOR (Login seguro)
// ============================================================
exports.validateVendor = functions.https.onCall(async (data, context) => {
  const { codigo, pin } = data;

  if (!codigo || !pin) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Código y PIN requeridos"
    );
  }

  try {
    // Buscar vendedor
    const snapshot = await db.collectionGroup("vendedores")
      .where("codigo", "==", codigo)
      .get();

    if (snapshot.empty) {
      throw new functions.https.HttpsError("not-found", "Vendedor no encontrado");
    }

    const vendedorDoc = snapshot.docs[0];
    const vendedor = vendedorDoc.data();

    // Validar PIN
    if (vendedor.pin !== pin) { // En producción: bcrypt.compare()
      throw new functions.https.HttpsError("permission-denied", "PIN incorrecto");
    }

    // Obtener empresaId desde la ruta
    const empresaId = vendedorDoc.ref.parent.parent.id;

    return {
      success: true,
      vendedorId: vendedorDoc.id,
      vendedorNombre: vendedor.nombre,
      empresaId: empresaId,
      mensaje: "Bienvenido"
    };
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
});

// ============================================================
// 4. GUARDAR ORDEN (Backend, valida empresa + timestamp)
// ============================================================
exports.saveOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado");
  }

  const { empresaId, cliente, items, total } = data;

  // Validar empresa
  const userDoc = await db.collection("usuarios").doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data().empresaId !== empresaId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Acceso denegado"
    );
  }

  try {
    // Guardar orden (NUNCA se puede borrar — audit trail)
    const ordenRef = db.collection("empresas").doc(empresaId).collection("ordenes").doc();
    await ordenRef.set({
      cliente,
      items,
      total,
      empresaId, // Para queries
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      ordenId: ordenRef.id,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});
```

## Deploy

```bash
# Primero deploy de rules
firebase deploy --only firestore:rules

# Después deploy de functions
firebase deploy --only functions
```

## Uso desde React

```javascript
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();

// Crear empresa
const createEmpresa = httpsCallable(functions, 'createEmpresa');
const result = await createEmpresa({
  nombre: "Mi Mayorista",
  cuit: "20123456789",
  email: "admin@ejemplo.com"
});

// Generar código vendedor
const generateVendor = httpsCallable(functions, 'generateVendorCode');
const { data } = await generateVendor({
  empresaId: "empresa123",
  vendedorNombre: "Juan"
});
console.log("Código:", data.codigo, "PIN:", data.pin);

// Validar vendedor (login)
const validateVendor = httpsCallable(functions, 'validateVendor');
const { data: vendedor } = await validateVendor({
  codigo: "JUAN-123456",
  pin: "1234"
});
```

## ⚠️ IMPORTANTE: Hashing de PINs

En producción, NUNCA guardes PINs en texto plano:

```javascript
npm install bcryptjs

const bcrypt = require("bcryptjs");

// Al crear vendedor
const saltRounds = 10;
const hashedPin = await bcrypt.hash(pinVendedor, saltRounds);
await vendedorRef.set({
  ...datos,
  pin: hashedPin
});

// Al validar
const pinValido = await bcrypt.compare(pinIngresado, vendedor.pin);
```

---

**Esta arquitectura asegura:**
- ✅ Credenciales no en frontend
- ✅ Validaciones en servidor
- ✅ Multi-tenant: cada empresa aislada
- ✅ Audit trail: órdenes nunca se borran
- ✅ Tokens serverTimestamp: evita manipulación de fechas
