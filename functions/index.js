const functions = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const https = require("https");

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
      "Debes estar autenticado para crear una empresa"
    );
  }

  const uid = context.auth.uid;
  const { nombre, cuit, email, telefono, condicionIVA, logo } = data;

  // Validar datos de entrada
  if (!nombre || nombre.length < 2) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Nombre inválido (mínimo 2 caracteres)"
    );
  }
  if (!cuit || cuit.length < 8) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "CUIT inválido (mínimo 8 dígitos)"
    );
  }
  if (!email || !email.includes("@")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Email inválido"
    );
  }

  // Generar código único para empresa
  const codigo = `${nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // 1. Crear documento de empresa
    const empresaRef = db.collection("empresas").doc();
    await empresaRef.set({
      nombre: nombre.trim(),
      cuit: cuit.trim(),
      email: email.trim(),
      telefono: telefono?.trim() || "",
      condicionIVA: condicionIVA || "RESPONSABLE_INSCRIPTO",
      logo: logo || "",
      codigo: codigo,
      ownerId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      estado: "ACTIVA",
      plan: "GRATUITO"
    });

    // 2. Vincular usuario a empresa (relación)
    await db.collection("usuarios").doc(uid).set({
      empresaId: empresaRef.id,
      email: context.auth.token.email,
      rol: "ADMIN",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✓ Empresa creada: ${empresaRef.id} (${nombre})`);

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
// 2. GENERAR CÓDIGO DE VENDEDOR (Compartible seguro)
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

  // Validar entrada
  if (!empresaId || !vendedorNombre) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan datos: empresaId y vendedorNombre"
    );
  }

  try {
    // 1. Validar que el usuario pertenece a esta empresa
    const userDoc = await db.collection("usuarios").doc(uid).get();
    if (!userDoc.exists || userDoc.data().empresaId !== empresaId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes acceso a esta empresa"
      );
    }

    // 2. Generar código y PIN únicos
    const codigoVendedor = `${vendedorNombre.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const pinVendedor = Math.floor(1000 + Math.random() * 9000).toString();

    // 3. Hash del PIN con bcrypt (seguridad)
    const hashedPin = await bcrypt.hash(pinVendedor, 10);

    // 4. Guardar vendedor
    const vendedorRef = db.collection("empresas").doc(empresaId).collection("vendedores").doc();
    await vendedorRef.set({
      nombre: vendedorNombre.trim(),
      codigo: codigoVendedor,
      pin: hashedPin, // ← Hasheado, no texto plano
      estado: "ACTIVO",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✓ Vendedor generado: ${codigoVendedor}`);

    // ⚠️ IMPORTANTE: Devolver el PIN SIN hashear (una sola vez)
    // El admin debe compartirlo con el vendedor ahora
    return {
      success: true,
      vendedorId: vendedorRef.id,
      codigo: codigoVendedor,
      pin: pinVendedor, // ← SOLO ESTA VEZ, después NO se puede recuperar
      mensaje: "⚠️ COMPARTE ESTO CON TU VENDEDOR (código + PIN). Una vez cerrada esta pantalla, no se puede recuperar."
    };
  } catch (error) {
    console.error("Error generando código vendedor:", error);
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
    // 1. Buscar vendedor por código
    const snapshot = await db.collectionGroup("vendedores")
      .where("codigo", "==", codigo.toUpperCase())
      .get();

    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        "Código de vendedor no encontrado"
      );
    }

    const vendedorDoc = snapshot.docs[0];
    const vendedor = vendedorDoc.data();

    // 2. Validar PIN con bcrypt
    const pinValido = await bcrypt.compare(pin.toString(), vendedor.pin);
    if (!pinValido) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "PIN incorrecto"
      );
    }

    // 3. Validar estado
    if (vendedor.estado !== "ACTIVO") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Vendedor desactivado"
      );
    }

    // 4. Obtener empresaId desde la ruta del documento
    const empresaId = vendedorDoc.ref.parent.parent.id;

    // 5. Registrar último acceso
    await vendedorDoc.ref.update({
      ultimoAcceso: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      vendedorId: vendedorDoc.id,
      vendedorNombre: vendedor.nombre,
      empresaId: empresaId,
      mensaje: "✓ Bienvenido"
    };
  } catch (error) {
    console.error("Error validando vendedor:", error.message);
    throw error;
  }
});

// ============================================================
// 4. GUARDAR ORDEN (Backend seguro)
// ============================================================
exports.saveOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "No autenticado"
    );
  }

  const { empresaId, cliente, items, total } = data;

  // Validar entrada
  if (!empresaId || !cliente || !items || items.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan datos de la orden"
    );
  }

  try {
    const uid = context.auth.uid;
    let tienePermiso = false;

    // 1. Verificar si es el dueño (Admin)
    const userDoc = await db.collection("usuarios").doc(uid).get();
    if (userDoc.exists && userDoc.data().empresaId === empresaId) {
      tienePermiso = true;
    }

    // 2. Si no es dueño, verificar si es un Vendedor registrado
    if (!tienePermiso) {
      const vendedorDoc = await db.collection("empresas").doc(empresaId).collection("vendedores").doc(uid).get();
      if (vendedorDoc.exists && vendedorDoc.data().estado !== "BLOQUEADO") {
        tienePermiso = true;
      }
    }

    if (!tienePermiso) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes acceso a esta empresa o tu cuenta de vendedor fue bloqueada"
      );
    }

    // 3. Guardar orden con timestamp del servidor (no manipulable)
    const ordenRef = db.collection("empresas").doc(empresaId).collection("ordenes").doc();
    await ordenRef.set({
      cliente: cliente,
      items: items,
      total: total,
      vendedorId: uid, // Registrar quién hizo la orden
      empresaId: empresaId, // Para queries futuras
      estado: "pendiente",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✓ Orden guardada: ${ordenRef.id} (${empresaId})`);

    return {
      success: true,
      ordenId: ordenRef.id,
      timestamp: new Date().toISOString(),
      message: "Orden guardada exitosamente"
    };
  } catch (error) {
    console.error("Error guardando orden:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ============================================================
// 5. ACTUALIZAR EMPRESA
// ============================================================
exports.updateEmpresa = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado");
  }

  const { empresaId, updates } = data;

  try {
    // Validar permisos
    const userDoc = await db.collection("usuarios").doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data().empresaId !== empresaId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes acceso a esta empresa"
      );
    }

    // Actualizar (solo campos permitidos)
    const camposPermitidos = ["nombre", "email", "telefono", "condicionIVA", "logo"];
    const actualizaciones = {};
    
    for (const campo of camposPermitidos) {
      if (campo in updates) {
        actualizaciones[campo] = updates[campo];
      }
    }

    actualizaciones.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("empresas").doc(empresaId).update(actualizaciones);

    return { success: true, message: "Empresa actualizada" };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ============================================================
// 6. LOGOUT (Registrar salida)
// ============================================================
exports.logout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado");
  }

  try {
    // Registro de auditoría (opcional)
    console.log(`✓ Logout: ${context.auth.uid}`);
    return { success: true, message: "Sesión cerrada" };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ============================================================
// GEMINI PROXY — la clave nunca sale al browser
// ============================================================
exports.geminiProxy = functions.https.onCall(async (data, context) => {
  const GEMINI_KEY = process.env.GEMINI_KEY || functions.config().gemini?.key;

  if (!GEMINI_KEY) {
    throw new functions.https.HttpsError("failed-precondition", "Gemini no configurado");
  }

  const { action, payload } = data;

  if (!action || !payload) {
    throw new functions.https.HttpsError("invalid-argument", "Faltan datos");
  }

  let prompt;

  if (action === "parseOrder") {
    const { text } = payload;
    prompt = `Sos un asistente de pedidos mayoristas en Argentina.
Tu tarea: convertir texto libre en español a un JSON array de objetos con "producto" y "cantidad".

REGLAS:
- Convertí números escritos: uno=1, dos=2, tres=3, cuatro=4, cinco=5, seis=6, siete=7, ocho=8, nueve=9, diez=10, once=11, doce=12, trece=13, catorce=14, quince=15, veinte=20, veinticinco=25, treinta=30, cuarenta=40, cincuenta=50
- La cantidad puede estar al inicio o al final
- Si no hay cantidad, usá 1
- El campo "producto" debe incluir nombre, marca y presentación/peso si los hay
- Ignorá palabras como: poneme, dame, quiero, necesito, agregame, mandame
- Devolvé SOLO el JSON array, sin explicación ni bloques de código

Ejemplo entrada: "doce coca cola 2.25\\nponeme 5 yerba playadito 500g"
Ejemplo salida: [{"producto":"coca cola 2.25","cantidad":12},{"producto":"yerba playadito 500g","cantidad":5}]

Texto:
${text}`;
  } else if (action === "matchProduct") {
    const { externalDescription, candidates } = payload;
    const list = candidates
      .map((p, i) => `${i}: ${[p.name, p.brand, p.weight, p.presentation].filter(Boolean).join(" ")}`)
      .join("\n");
    prompt = `Sos un asistente de productos mayoristas en Argentina.
Se escaneó un código de barras. El producto identificado externamente es:
"${externalDescription}"

Del siguiente catálogo, elegí el producto MÁS SIMILAR considerando nombre, marca y presentación.
Pensá en equivalencias reales: "gaseosa cola sin azúcar 2.25l" es lo mismo que "Coca Zero 2.25".
Respondé SOLO con el número índice de la mejor opción (0, 1, 2, etc.).

Catálogo:
${list}

Respondé solo con un número entero:`;
  } else {
    throw new functions.https.HttpsError("invalid-argument", "Acción desconocida");
  }

  const maxTokens = action === "matchProduct" ? 10 : 1000;
  const temperature = action === "matchProduct" ? 0 : 0.1;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  });

  const result = await new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let raw = "";
      res.on("data", chunk => raw += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`Gemini ${res.statusCode}`));
        resolve(JSON.parse(raw));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { text };
});

// ============================================================
// 7. UNIRSE COMO VENDEDOR (Con código de empresa)
// ============================================================
exports.joinEmpresaByCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes estar autenticado anónimamente primero");
  }

  const { codigoEmpresa, vendorName } = data;
  const uid = context.auth.uid;

  if (!codigoEmpresa || !vendorName) {
    throw new functions.https.HttpsError("invalid-argument", "Faltan datos");
  }

  try {
    // 1. Buscar la empresa por el código
    const empresasSnapshot = await db.collection("empresas").where("codigo", "==", codigoEmpresa.toUpperCase()).limit(1).get();
    
    if (empresasSnapshot.empty) {
      throw new functions.https.HttpsError("not-found", "Código de empresa no válido");
    }

    const empresaDoc = empresasSnapshot.docs[0];
    const empresaId = empresaDoc.id;

    // 2. Registrar al vendedor en la subcolección de la empresa
    const vendedorRef = db.collection("empresas").doc(empresaId).collection("vendedores").doc(uid);
    await vendedorRef.set({
      nombre: vendorName.trim(),
      estado: "ACTIVO",
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✓ Vendedor ${uid} unido a empresa ${empresaId}`);

    return {
      success: true,
      empresaId: empresaId,
      vendedorId: uid,
      mensaje: "Conectado exitosamente"
    };
  } catch (error) {
    console.error("Error uniéndose a empresa:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

