import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload
} from 'firebase/auth';
import {
  getFirestore,
  doc, setDoc, getDoc, updateDoc,
  collection, getDocs, deleteDoc, addDoc, writeBatch,
  query, onSnapshot, where, limit,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';
export const db   = getFirestore(app);

// ============================================================
// AUTENTICACIÓN
// ============================================================

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado. Verificá tu conexión.')), ms))
  ]);
}

export async function loginAdmin(email, password) {
  try {
    const userCredential = await withTimeout(signInWithEmailAndPassword(auth, email, password));
    const uid = userCredential.user.uid;

    if (!userCredential.user.emailVerified) {
      await sendEmailVerification(userCredential.user).catch(() => {});
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    const userDoc = await withTimeout(getDoc(doc(db, 'usuarios', uid)));
    if (!userDoc.exists() || userDoc.data().rol !== 'ADMIN') {
      throw new Error('No tenés cuenta de administrador registrada.');
    }

    const empresaId = userDoc.data().empresaId;
    const empresaDoc = await withTimeout(getDoc(doc(db, 'empresas', empresaId)));
    const empresaCodigo = empresaDoc.exists() ? empresaDoc.data().codigo : null;

    if (empresaDoc.exists() && empresaDoc.data().estado === 'PENDIENTE_VALIDACION') {
      await updateDoc(doc(db, 'empresas', empresaId), { estado: 'ACTIVA', updatedAt: serverTimestamp() });
    }

    const sessionId = generateSessionId();
    const currentSessions = userDoc.data().sessions || [];
    const updatedSessions = [...currentSessions.slice(-1), sessionId]; // máximo 2
    await updateDoc(doc(db, 'usuarios', uid), { sessions: updatedSessions });

    return {
      uid,
      email: userCredential.user.email,
      empresaId,
      empresaCodigo,
      rol: 'admin',
      vendedorNombre: 'Admin',
      vendedorSessionId: sessionId,
      success: true
    };
  } catch (error) {
    throw new Error(`Error de login: ${error.message}`);
  }
}

export async function registerAdmin(email, password, mayorista, products) {
  try {
    // 1. Crear usuario en Firebase Auth (o recuperar si ya existe)
    let uid;
    let pendingVerification = true;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      uid = userCredential.user.uid;
      await sendEmailVerification(userCredential.user).catch(() => {});
    } catch (authError) {
      if (authError.code === 'auth/email-already-in-use') {
        // La cuenta de Auth existe pero puede que Firestore esté incompleto — intentar reparar
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
        const existingDoc = await getDoc(doc(db, 'usuarios', uid));
        if (existingDoc.exists()) {
          throw new Error('Este correo ya tiene una empresa registrada. Usá "Ingresar" para entrar.');
        }
        // Si no tiene doc en Firestore, continúa y lo crea abajo
        if (!userCredential.user.emailVerified) {
          await sendEmailVerification(userCredential.user).catch(() => {});
        } else {
          pendingVerification = false;
        }
      } else {
        throw authError;
      }
    }

    // 2. Generar código de empresa
    const nombreStr = mayorista.nombre || 'Mi Empresa';
    const codigo = `${nombreStr.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Crear documento de empresa
    const empresaRef = doc(collection(db, 'empresas'));
    const empresaId = empresaRef.id;

    await setDoc(empresaRef, {
      nombre: nombreStr,
      cuit: mayorista.cuit || '',
      email: email,
      telefono: mayorista.telefono || '',
      condicionIVA: mayorista.condicionIVA || '',
      logo: localStorage.getItem('mayorista-logo') || '',
      codigo: codigo,
      codigoClientes: generarCodigoClientes(),
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      estado: "PENDIENTE_VALIDACION",
      plan: "GRATUITO"
    });

    const adminSessionId = generateSessionId();

    // 4. Crear documento de usuario
    await setDoc(doc(db, 'usuarios', uid), {
      empresaId: empresaId,
      email: email,
      rol: "ADMIN",
      sessions: [adminSessionId],
      createdAt: serverTimestamp()
    });

    // 5. Agregar productos
    if (products && products.length > 0) {
      const productosRef = collection(db, 'empresas', empresaId, 'productos');
      const BATCH_SIZE = 400; // Un poco menos de 500 para mayor seguridad
      
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = products.slice(i, i + BATCH_SIZE);
        
        chunk.forEach(product => {
          batch.set(doc(productosRef), {
            ...product,
            empresaId,
            createdAt: serverTimestamp()
          });
        });
        
        await batch.commit();
      }
    }

    return {
      uid,
      empresaId,
      codigo,
      vendedorSessionId: adminSessionId,
      success: true,
      pendingVerification
    };
  } catch (error) {
    throw new Error(`Error en registro: ${error.message}`);
  }
}

export async function logout() {
  await signOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email' || error.code === 'auth/invalid-credential') {
      throw new Error('No encontramos una cuenta con ese correo electrónico.');
    }
    throw new Error('No se pudo enviar el correo. Verificá tu conexión e intentá nuevamente.');
  }
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión activa para reenviar la verificación.');
  await sendEmailVerification(user);
}

export async function checkEmailVerified() {
  const user = auth.currentUser;
  if (!user) return false;
  await reload(user);
  return auth.currentUser.emailVerified;
}

// ============================================================
// LOGIN VENDEDOR
// ============================================================

export async function registerVendor(email, password, joinCode, vendorName) {
  let createdUser = null;
  try {
    // 1. Crear usuario primero para tener sesión autenticada
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = userCredential.user;
    const uid = createdUser.uid;
    await sendEmailVerification(createdUser).catch(() => {});

    // 2. Buscar empresa por código (ahora estamos autenticados, las reglas Firestore lo permiten)
    const empresasQuery = query(collection(db, 'empresas'), where("codigo", "==", joinCode.toUpperCase()), limit(1));
    const empresasSnapshot = await getDocs(empresasQuery);

    if (empresasSnapshot.empty) {
      await createdUser.delete();
      throw new Error("Código de empresa no válido");
    }

    const empresaDoc = empresasSnapshot.docs[0];
    const empresaId = empresaDoc.id;

    // 3. Crear documento de usuario global
    await setDoc(doc(db, 'usuarios', uid), {
      empresaId: empresaId,
      email: email,
      rol: "VENDEDOR",
      createdAt: serverTimestamp()
    });

    const sessionId = generateSessionId();

    // 4. Registrar al vendedor en la empresa
    await setDoc(doc(db, 'empresas', empresaId, 'vendedores', uid), {
      nombre: vendorName.trim(),
      email: email,
      estado: "ACTIVO",
      sessionId,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });

    return {
      empresaId,
      empresaData: { codigo: joinCode.toUpperCase() },
      isAdmin: false,
      rol: 'vendedor',
      vendedorId: uid,
      vendedorNombre: vendorName.trim(),
      vendedorSessionId: sessionId,
      pendingVerification: true
    };
  } catch(e) {
    // Si el usuario fue creado pero algo falló después, limpiarlo para no dejar cuenta huérfana
    if (createdUser && e.message !== "Código de empresa no válido") {
      try { await createdUser.delete(); } catch {}
    }
    throw new Error(e.message || "Error al registrar vendedor.");
  }
}

export async function loginVendor(email, password) {
  try {
    const userCredential = await withTimeout(signInWithEmailAndPassword(auth, email, password));
    const uid = userCredential.user.uid;

    if (!userCredential.user.emailVerified) {
      await sendEmailVerification(userCredential.user).catch(() => {});
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    const userDoc = await withTimeout(getDoc(doc(db, 'usuarios', uid)));
    if (!userDoc.exists() || userDoc.data().rol !== "VENDEDOR") {
      await signOut(auth);
      throw new Error("No tenés cuenta de vendedor registrada.");
    }

    const empresaId = userDoc.data().empresaId;
    const empresaDoc = await withTimeout(getDoc(doc(db, 'empresas', empresaId)));
    if (!empresaDoc.exists()) throw new Error("La empresa ya no existe.");

    const vendorDoc = await withTimeout(getDoc(doc(db, 'empresas', empresaId, 'vendedores', uid)));
    const vendorName = vendorDoc.exists() ? vendorDoc.data().nombre : "Vendedor";

    const sessionId = generateSessionId();
    await updateDoc(doc(db, 'empresas', empresaId, 'vendedores', uid), { sessionId });

    return {
      empresaId,
      empresaData: { codigo: empresaDoc.data().codigo },
      isAdmin: false,
      rol: 'vendedor',
      vendedorId: uid,
      vendedorNombre: vendorName,
      vendedorSessionId: sessionId
    };
  } catch (error) {
    throw new Error(`Error de login: ${error.message}`);
  }
}

// ============================================================
// OPERACIONES DE EMPRESAS
// ============================================================

export async function getEmpresaData(empresaId) {
  const snap = await getDoc(doc(db, 'empresas', empresaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateEmpresaData(empresaId, updates) {
  await updateDoc(doc(db, 'empresas', empresaId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

export async function getAdminCode(empresaId) {
  const docSnap = await getDoc(doc(db, 'empresas', empresaId));
  if (docSnap.exists()) return docSnap.data().codigo;
  return null;
}

export async function renewCode(empresaId) {
  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  await updateDoc(doc(db, 'empresas', empresaId), {
    codigo: newCode,
    updatedAt: serverTimestamp()
  });
  return newCode;
}

// ============================================================
// PRODUCTOS
// ============================================================

function deduplicarProductos(docs) {
  const vistos = new Map();
  docs.forEach(p => {
    const key = p.code || p.codigo || p.id;
    const ts  = p.updatedAt?.toMillis?.() || p.createdAt?.toMillis?.() || 0;
    const prev = vistos.get(key);
    const tsPrev = prev?.updatedAt?.toMillis?.() || prev?.createdAt?.toMillis?.() || 0;
    if (!prev || ts > tsPrev) vistos.set(key, p);
  });
  return Array.from(vistos.values());
}

export async function getProductos(empresaId) {
  const snap = await getDocs(collection(db, 'empresas', empresaId, 'productos'));
  return deduplicarProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function listenProductos(empresaId, cb) {
  return onSnapshot(collection(db, 'empresas', empresaId, 'productos'), snap => {
    cb(deduplicarProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
}

export async function addProducto(empresaId, producto) {
  return await addDoc(collection(db, 'empresas', empresaId, 'productos'), {
    ...producto,
    empresaId,
    createdAt: serverTimestamp()
  });
}

export async function deleteProducto(empresaId, productoId) {
  await deleteDoc(doc(db, 'empresas', empresaId, 'productos', productoId));
}

function toDocId(str) {
  return String(str || '')
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
    .replace(/^_+/, '')   // Firestore reserva IDs que empiezan con "__"
    .slice(0, 500);
}

const BATCH_TIMEOUT_MS = 25000;
function commitBatch(batch) {
  return Promise.race([
    batch.commit(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sin respuesta de Firestore. Verificá tu conexión.')), BATCH_TIMEOUT_MS)
    )
  ]);
}

export async function syncProductos(empresaId, products, onProgress) {
  const productosRef = collection(db, 'empresas', empresaId, 'productos');
  const BATCH_SIZE = 400;

  // Subir todos los productos (random IDs, igual que el registro inicial)
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    products.slice(i, i + BATCH_SIZE).forEach(product => {
      batch.set(doc(productosRef), { ...product, empresaId, updatedAt: serverTimestamp() });
    });
    await commitBatch(batch);
    onProgress?.(Math.min(i + BATCH_SIZE, products.length), products.length);
  }
}

export async function clearProductosFirebase(empresaId, onProgress) {
  const colRef = collection(db, 'empresas', empresaId, 'productos');
  const BATCH_SIZE = 400;
  let deletedCount = 0;
  
  while (true) {
    const q = query(colRef, limit(BATCH_SIZE));
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      batch.delete(d.ref);
    });
    await batch.commit();
    
    deletedCount += snap.docs.length;
    onProgress?.(deletedCount);

    if (snap.docs.length < BATCH_SIZE) break;
  }
}

// ============================================================
// CLIENTES
// ============================================================

export async function addClientToFirebase(empresaId, client) {
  await setDoc(doc(db, 'empresas', empresaId, 'clientes', client.id), {
    ...client,
    empresaId,
    createdAt: serverTimestamp()
  });
}

export async function deleteClientFromFirebase(empresaId, clientId) {
  await updateDoc(doc(db, 'empresas', empresaId, 'clientes', clientId), { deleted: true });
}

export function listenClientes(empresaId, cb) {
  return onSnapshot(collection(db, 'empresas', empresaId, 'clientes'), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted));
  });
}

// ============================================================
// ÓRDENES
// ============================================================

export async function saveOrderToFirebase(empresaId, vendedorId, vendedorNombre, order) {
  const ordenRef = collection(db, 'empresas', empresaId, 'ordenes');
  await addDoc(ordenRef, {
    cliente: order.client,
    items: order.items,
    total: order.total,
    orderDiscount: order.orderDiscount || null,
    codigoDescuento: order.codigoDescuento || null,
    metodoEntrada: order.metodoEntrada || 'manual',
    vendedorId: vendedorId,
    vendedorNombre: vendedorNombre || 'Vendedor Anónimo',
    empresaId: empresaId,
    estado: 'pendiente',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { success: true };
}

export async function markOrderSeen(empresaId, ordenId) {
  await updateDoc(doc(db, 'empresas', empresaId, 'ordenes', ordenId), {
    estado: 'visto',
    updatedAt: serverTimestamp()
  });
}

export async function deleteOrder(empresaId, ordenId) {
  await updateDoc(doc(db, 'empresas', empresaId, 'ordenes', ordenId), {
    estado: 'cancelada',
    updatedAt: serverTimestamp()
  });
}

export function listenOrdenes(empresaId, cb) {
  return onSnapshot(
    query(collection(db, 'empresas', empresaId, 'ordenes')),
    snap => {
      cb(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.estado !== 'cancelada')
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      );
    }
  );
}

export const listenPedidos = listenOrdenes;

// ============================================================
// VENDEDORES
// ============================================================

export function listenVendedores(empresaId, cb) {
  return onSnapshot(collection(db, 'empresas', empresaId, 'vendedores'), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function deleteVendedor(empresaId, vendedorId) {
  await deleteDoc(doc(db, 'empresas', empresaId, 'vendedores', vendedorId));
}

export async function setVendorBlocked(empresaId, vendedorId, bloqueado) {
  await updateDoc(doc(db, 'empresas', empresaId, 'vendedores', vendedorId), {
    bloqueado,
    updatedAt: serverTimestamp()
  });
}

export async function updateLastSeen(empresaId, vendedorId) {
  try {
    await updateDoc(doc(db, 'empresas', empresaId, 'vendedores', vendedorId), {
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    console.warn('No se pudo actualizar lastSeen:', error);
  }
}

export async function registrarSesionInicio(empresaId, vendedorId, vendedorNombre) {
  try {
    const sessionRef = doc(collection(db, 'empresas', empresaId, 'sesiones'));
    await setDoc(sessionRef, {
      vendedorId,
      vendedorNombre: vendedorNombre || '',
      loginAt: serverTimestamp(),
      logoutAt: null,
      duracionMinutos: null,
      empresaId
    });
    return sessionRef.id;
  } catch {}
}

export async function registrarSesionFin(empresaId, sesionId, loginAt) {
  if (!sesionId) return;
  try {
    const duracionMinutos = loginAt
      ? Math.round((Date.now() - loginAt) / 60000)
      : null;
    await updateDoc(doc(db, 'empresas', empresaId, 'sesiones', sesionId), {
      logoutAt: serverTimestamp(),
      duracionMinutos
    });
  } catch {}
}

export function listenVendedorBlocked(empresaId, vendedorId, cb) {
  return onSnapshot(doc(db, 'empresas', empresaId, 'vendedores', vendedorId), snap => {
    if (!snap.exists()) return;
    cb(snap.data().bloqueado || false);
  });
}

export function listenVendedorSession(empresaId, vendedorId, localSessionId, onKicked) {
  return onSnapshot(doc(db, 'empresas', empresaId, 'vendedores', vendedorId), snap => {
    if (!snap.exists()) return;
    const remoteSessionId = snap.data().sessionId;
    if (remoteSessionId && remoteSessionId !== localSessionId) {
      onKicked();
    }
  });
}

// Re-registra el sessionId del admin en Firestore (máximo 2 sesiones simultáneas).
// Se llama al cargar la app para que un sessionId guardado en localStorage
// vuelva a quedar válido aunque se haya iniciado sesión en otro dispositivo mientras tanto.
export async function refreshAdminSession(uid, sessionId) {
  try {
    const userDoc = await getDoc(doc(db, 'usuarios', uid));
    if (!userDoc.exists()) return;
    const current = userDoc.data().sessions || [];
    if (current.includes(sessionId)) return; // ya está registrado
    const updated = [...current.slice(-1), sessionId]; // máximo 2
    await updateDoc(doc(db, 'usuarios', uid), { sessions: updated });
  } catch {}
}

export function listenAdminSession(uid, localSessionId, onKicked) {
  return onSnapshot(doc(db, 'usuarios', uid), snap => {
    if (!snap.exists()) return;
    const sessions = snap.data().sessions || [];
    if (sessions.length > 0 && !sessions.includes(localSessionId)) {
      onKicked();
    }
  });
}

// Utilidad temporal
export async function getDeviceId() {
  let deviceId = localStorage.getItem('mayolista_device_id');
  if (!deviceId) {
    deviceId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('mayolista_device_id', deviceId);
  }
  return deviceId;
}

// ============================================================
// CLIENTES CON CUENTA (rol CLIENTE)
// ============================================================

function generateCodigoCliente(nombre) {
  const base = (nombre || 'CLI').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'CLI';
  return `CLI-${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generarCodigoClientes() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CL-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function regenerarCodigoClientes(empresaId) {
  const nuevo = generarCodigoClientes();
  await updateDoc(doc(db, 'empresas', empresaId), { codigoClientes: nuevo });
  return nuevo;
}

async function _completarRegistroCliente(uid, currentUser, email, password, joinCode, clienteData) {
  const q = query(collection(db, 'empresas'), where('codigoClientes', '==', joinCode.toUpperCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Código de clientes no válido. Pedíselo al mayorista.');

  const empresaId = snap.docs[0].id;
  const clientesRef = collection(db, 'empresas', empresaId, 'clientes');

  let clienteId = null;
  let clienteExistente = null;
  const porCuit = clienteData.cuit
    ? await getDocs(query(clientesRef, where('cuit', '==', clienteData.cuit), limit(1)))
    : { empty: true };
  if (!porCuit.empty) {
    clienteExistente = { id: porCuit.docs[0].id, ...porCuit.docs[0].data() };
    clienteId = porCuit.docs[0].id;
  } else {
    const porEmail = clienteData.email
      ? await getDocs(query(clientesRef, where('email', '==', clienteData.email.toLowerCase()), limit(1)))
      : { empty: true };
    if (!porEmail.empty) {
      clienteExistente = { id: porEmail.docs[0].id, ...porEmail.docs[0].data() };
      clienteId = porEmail.docs[0].id;
    }
  }

  const codigoCliente = clienteExistente?.codigoCliente || generateCodigoCliente(clienteData.name);

  if (clienteId) {
    await updateDoc(doc(db, 'empresas', empresaId, 'clientes', clienteId), {
      uid, codigoCliente,
      email: clienteData.email || clienteExistente.email || '',
      updatedAt: serverTimestamp()
    });
  } else {
    const newRef = doc(clientesRef);
    clienteId = newRef.id;
    await setDoc(newRef, {
      ...clienteData, email: clienteData.email || '',
      uid, codigoCliente, empresaId, createdAt: serverTimestamp()
    });
  }

  await setDoc(doc(db, 'usuarios', uid), {
    empresaId, email, rol: 'CLIENTE', clienteId, createdAt: serverTimestamp()
  });

  return { empresaId, clienteId, codigoCliente, uid, success: true };
}

export async function registerCliente(email, password, joinCode, clienteData, onPaso = () => {}) {
  let createdUser = null;
  try {
    // PASO 1: Verificar código ANTES de crear la cuenta (ahora empresas es lectura pública)
    onPaso('⏳ Paso 1/3: Verificando código de clientes...');
    const q = query(collection(db, 'empresas'), where('codigoClientes', '==', joinCode.toUpperCase()), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('Código de clientes no válido. Verificá el código que te dio el mayorista.');
    }
    const empresaId = snap.docs[0].id;

    // PASO 2: Crear cuenta en Firebase Auth
    onPaso('⏳ Paso 2/3: Creando cuenta...');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      createdUser = userCredential.user;
      await sendEmailVerification(createdUser).catch(() => {});
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-in-use') {
        // Intentar retomar un registro incompleto anterior
        const cred = await signInWithEmailAndPassword(auth, email, password).catch(() => {
          throw new Error('Este email ya tiene una cuenta. Usá "Ya tengo cuenta" para ingresar.');
        });
        const userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid));
        if (userDoc.exists() && userDoc.data().rol === 'CLIENTE') {
          throw new Error('Este email ya está registrado. Usá "Ya tengo cuenta" para ingresar.');
        }
        createdUser = cred.user; // retomar cuenta sin datos de Firestore
      } else if (authErr.code === 'auth/weak-password') {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      } else if (authErr.code === 'auth/invalid-email') {
        throw new Error('El email no tiene un formato válido.');
      } else {
        throw new Error('Error al crear cuenta: ' + (authErr.code || authErr.message));
      }
    }

    const uid = createdUser.uid;
    const codigoCliente = generateCodigoCliente(clienteData.name);

    // PASO 3: Guardar datos en Firestore
    onPaso('⏳ Paso 3/3: Guardando datos...');

    // Primero el doc de usuario (necesario para que las reglas de Firestore funcionen)
    await setDoc(doc(db, 'usuarios', uid), {
      empresaId, email, rol: 'CLIENTE', clienteId: null, createdAt: serverTimestamp()
    });

    // Luego crear el documento de cliente
    const clientesRef = collection(db, 'empresas', empresaId, 'clientes');
    const newRef = doc(clientesRef);
    const clienteId = newRef.id;
    await setDoc(newRef, {
      ...clienteData, email: clienteData.email || '',
      uid, codigoCliente, empresaId, createdAt: serverTimestamp()
    });

    // Actualizar el doc de usuario con el clienteId real
    await updateDoc(doc(db, 'usuarios', uid), { clienteId });

    const clienteInfo = { id: clienteId, ...clienteData, codigoCliente, uid };
    return { empresaId, clienteId, codigoCliente, uid, clienteInfo, success: true, pendingVerification: false };
  } catch (e) {
    // Si creamos un auth user pero los datos de Firestore fallaron, limpiar
    if (createdUser) {
      const hadDoc = await getDoc(doc(db, 'usuarios', createdUser.uid))
        .then(d => d.exists()).catch(() => false);
      if (!hadDoc) await createdUser.delete().catch(() => {});
    }
    throw e;
  }
}

export async function loginCliente(email, password) {
  try {
    const userCredential = await withTimeout(signInWithEmailAndPassword(auth, email, password));
    const uid = userCredential.user.uid;

    const userDoc = await withTimeout(getDoc(doc(db, 'usuarios', uid)));
    if (!userDoc.exists()) {
      await signOut(auth);
      throw new Error('Tu registro quedó incompleto. Volvé a registrarte con los mismos datos.');
    }
    if (userDoc.data().rol !== 'CLIENTE') {
      await signOut(auth);
      throw new Error('Este email no corresponde a una cuenta de cliente.');
    }

    const { empresaId, clienteId } = userDoc.data();
    const clienteDoc = await withTimeout(getDoc(doc(db, 'empresas', empresaId, 'clientes', clienteId)));
    const clienteInfo = clienteDoc.exists() ? { id: clienteId, ...clienteDoc.data() } : { id: clienteId, name: email };

    return { empresaId, clienteId, clienteInfo, uid, success: true };
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-login-credentials')) {
      throw new Error('Email o contraseña incorrectos.');
    }
    throw new Error(msg || 'Error al iniciar sesión.');
  }
}

// ============================================================
// OFERTAS DEL DÍA
// ============================================================

export async function saveOferta(empresaId, oferta) {
  if (oferta.id) {
    await updateDoc(doc(db, 'empresas', empresaId, 'ofertas', oferta.id), {
      ...oferta,
      updatedAt: serverTimestamp()
    });
    return oferta.id;
  }
  const ref = await addDoc(collection(db, 'empresas', empresaId, 'ofertas'), {
    ...oferta,
    activa: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteOferta(empresaId, ofertaId) {
  await deleteDoc(doc(db, 'empresas', empresaId, 'ofertas', ofertaId));
}

export function listenOfertas(empresaId, cb) {
  return onSnapshot(
    collection(db, 'empresas', empresaId, 'ofertas'),
    snap => { cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.activa !== false)); },
    () => { cb([]); }
  );
}

// ============================================================
// CÓDIGOS DE DESCUENTO
// ============================================================

export async function generateCodigoDescuento(empresaId, porcentaje, targetClienteId = null) {
  const codigo = 'DCTO-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const ref = await addDoc(collection(db, 'empresas', empresaId, 'codigosDescuento'), {
    codigo,
    porcentaje,
    targetClienteId,
    usados: [],
    createdAt: serverTimestamp()
  });
  return { id: ref.id, codigo };
}

export async function validateCodigoDescuento(empresaId, codigo, clienteId) {
  const q = query(collection(db, 'empresas', empresaId, 'codigosDescuento'), where('codigo', '==', codigo.toUpperCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Código de descuento inválido.');

  const data = snap.docs[0].data();
  const docId = snap.docs[0].id;

  if (data.targetClienteId && data.targetClienteId !== clienteId) {
    throw new Error('Este código no es válido para tu cuenta.');
  }
  if ((data.usados || []).includes(clienteId)) {
    throw new Error('Ya usaste este código de descuento.');
  }

  return { docId, porcentaje: data.porcentaje, codigo: data.codigo };
}

export async function markCodigoUsado(empresaId, docId, clienteId) {
  const ref = doc(db, 'empresas', empresaId, 'codigosDescuento', docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const usados = snap.data().usados || [];
  await updateDoc(ref, { usados: [...usados, clienteId] });
}

export async function deleteCodigoDescuento(empresaId, docId) {
  await deleteDoc(doc(db, 'empresas', empresaId, 'codigosDescuento', docId));
}

export function listenCodigosDescuento(empresaId, cb) {
  return onSnapshot(
    collection(db, 'empresas', empresaId, 'codigosDescuento'),
    snap => { cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));},
    () => { cb([]); }
  );
}

// ============================================================
// IMPORTACIÓN MASIVA DE CLIENTES (EXCEL)
// ============================================================

export async function syncClientesFromExcel(empresaId, clientesList, onProgress) {
  const clientesRef = collection(db, 'empresas', empresaId, 'clientes');
  const BATCH_SIZE = 400;

  const existingSnap = await getDocs(clientesRef);
  const existingByCuit = new Map();
  const existingByCodigoCliente = new Map();
  existingSnap.docs.forEach(d => {
    const data = d.data();
    if (data.cuit) existingByCuit.set(String(data.cuit).trim(), d.id);
    if (data.codigoCliente) existingByCodigoCliente.set(data.codigoCliente, d.id);
  });

  for (let i = 0; i < clientesList.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    clientesList.slice(i, i + BATCH_SIZE).forEach(c => {
      let docId = null;
      if (c.id) {
        docId = c.id;
      } else if (c.cuit && existingByCuit.has(String(c.cuit).trim())) {
        docId = existingByCuit.get(String(c.cuit).trim());
      } else if (c.codigoCliente && existingByCodigoCliente.has(c.codigoCliente)) {
        docId = existingByCodigoCliente.get(c.codigoCliente);
      } else {
        docId = generateCodigoCliente(c.name || c.nombre || '').replace(/[^a-zA-Z0-9\-]/g, '_');
        // use a proper firebase generated id
        docId = doc(clientesRef).id;
      }

      const nombre = c.name || c.nombre || '';
      const clienteData = {
        name: nombre,
        cuit: String(c.cuit || '').trim(),
        condicionIVA: c.condicionIVA || c.condicion_iva || '',
        address: c.address || c.direccion || '',
        localidad: c.localidad || '',
        zona: c.zona || '',
        phone: c.phone || c.telefono || '',
        email: (c.email || '').toLowerCase().trim(),
        codigoCliente: c.codigoCliente || generateCodigoCliente(nombre),
        empresaId,
        updatedAt: serverTimestamp()
      };
      batch.set(doc(db, 'empresas', empresaId, 'clientes', docId), clienteData, { merge: true });
    });
    await commitBatch(batch);
    onProgress?.(Math.min(i + BATCH_SIZE, clientesList.length), clientesList.length);
  }
}
