// Script para limpiar usuarios cliente con registro incompleto
// Uso: node scripts/cleanup-clientes.js
// Requiere: GOOGLE_APPLICATION_CREDENTIALS apuntando al serviceAccount.json
//           o estar logueado con: firebase login (usa Application Default Credentials)

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Buscar service account en la carpeta raíz o functions
let serviceAccount;
try {
  serviceAccount = require('../serviceAccount.json');
} catch {
  try {
    serviceAccount = require('../functions/serviceAccount.json');
  } catch {
    serviceAccount = null;
  }
}

if (!getApps().length) {
  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Usa Application Default Credentials (firebase login)
    initializeApp({ projectId: 'mayolista2' });
  }
}

const authAdmin = getAuth();
const db = getFirestore();

async function cleanup() {
  console.log('Buscando usuarios con registro incompleto...\n');

  // Listar todos los usuarios de Firebase Auth
  let allUsers = [];
  let pageToken;
  do {
    const result = await authAdmin.listUsers(1000, pageToken);
    allUsers = allUsers.concat(result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`Total usuarios en Auth: ${allUsers.length}`);

  const toDelete = [];
  for (const user of allUsers) {
    try {
      const doc = await db.collection('usuarios').doc(user.uid).get();
      if (!doc.exists) {
        toDelete.push(user);
        console.log(`  Sin datos Firestore: ${user.email} (${user.uid})`);
      } else if (doc.data().rol === 'CLIENTE') {
        // Verificar que tenga clienteId válido
        const { empresaId, clienteId } = doc.data();
        if (!clienteId || !empresaId) {
          toDelete.push(user);
          console.log(`  Cliente sin clienteId: ${user.email}`);
        }
      }
    } catch (e) {
      console.log(`  Error verificando ${user.email}: ${e.message}`);
    }
  }

  if (toDelete.length === 0) {
    console.log('\nNo hay usuarios para limpiar.');
    return;
  }

  console.log(`\nEliminar ${toDelete.length} usuario(s) con registro incompleto:`);
  toDelete.forEach(u => console.log(`  - ${u.email}`));

  // Confirmar antes de borrar
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  readline.question('\n¿Confirmar borrado? (s/n): ', async (ans) => {
    readline.close();
    if (ans.toLowerCase() !== 's') { console.log('Cancelado.'); return; }

    for (const user of toDelete) {
      try {
        // Borrar de Auth
        await authAdmin.deleteUser(user.uid);
        // Borrar de Firestore usuarios si existe
        try { await db.collection('usuarios').doc(user.uid).delete(); } catch {}
        console.log(`  Borrado: ${user.email}`);
      } catch (e) {
        console.log(`  Error borrando ${user.email}: ${e.message}`);
      }
    }
    console.log('\nLimpieza completada.');
  });
}

cleanup().catch(console.error);
