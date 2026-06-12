import { useState, useEffect, useRef } from 'react';
import { Home, Users, Search, ShoppingCart, Share2, Copy, Check, X, QrCode, Settings, LayoutGrid, History } from 'lucide-react';
import HomeScreen from './screens/HomeScreen';
import ClientsScreen from './screens/ClientsScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProcessOrderScreen from './screens/ProcessOrderScreen';
import SummaryScreen from './screens/SummaryScreen';
import AdminScreen from './screens/AdminScreen';
import SettingsScreen from './screens/SettingsScreen';
import LandingScreen from './screens/LandingScreen';
import IntroScreen from './screens/IntroScreen';
import SetupScreen from './screens/SetupScreen';
import AdminPanelScreen from './screens/AdminPanelScreen';
import ClienteHomeScreen from './screens/ClienteHomeScreen';
import { useStore } from './store';
import { auth, getDeviceId, getProductos, getEmpresaData, updateLastSeen, listenVendedorBlocked, listenVendedorSession, listenAdminSession, refreshAdminSession, listenClientes, addClientToFirebase, listenProductos, registrarSesionInicio, registrarSesionFin, listenOfertas } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

function AppLogo({ size = 32 }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon3-512.png`}
      alt="Mayolista"
      width={size} height={size}
      draggable={false}
      onContextMenu={e => e.preventDefault()}
      style={{ display: 'block', borderRadius: '50%', flexShrink: 0 }}
    />
  );
}

const APP_URL = 'https://hectorgperez7060-bit.github.io/mayolista/';
const QR_URL  = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(APP_URL)}&color=863bff&bgcolor=0d0d1a&margin=10`;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [screenHistory, setScreenHistory] = useState([]);
  const afterClientSelectRef             = useRef('order');

  const navigate = (screen) => {
    setScreenHistory(h => [...h, currentScreen]);
    setCurrentScreen(screen);
  };
  const goBack = () => {
    setScreenHistory(h => {
      const prev = h[h.length - 1];
      if (prev !== undefined) setCurrentScreen(prev);
      return h.slice(0, -1);
    });
  };
  const [showShare, setShowShare]         = useState(false);
  const [showIntro, setShowIntro]         = useState(() => !sessionStorage.getItem('intro-done'));
  const [isBlocked, setIsBlocked]         = useState(false);
  const [sessionKicked, setSessionKicked] = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [swWaiting, setSwWaiting]         = useState(false);
  const blockedUnsubRef  = useRef(null);
  const sessionUnsubRef  = useRef(null);
  const clientsUnsubRef  = useRef(null);
  const productsUnsubRef = useRef(null);
  const ofertasUnsubRef  = useRef(null);
  const sesionFirebaseId = useRef(null);
  const sesionLoginAt    = useRef(null);

  const isLoggedIn       = useStore(s => s.isLoggedIn);
  const login            = useStore(s => s.login);
  const logout           = useStore(s => s.logout);
  const order            = useStore(s => s.currentOrder);
  const empresaId           = useStore(s => s.empresaId);
  const rol                 = useStore(s => s.rol);
  const vendedorId          = useStore(s => s.vendedorId);
  const vendedorSessionId   = useStore(s => s.vendedorSessionId);
  const setMayorista     = useStore(s => s.setMayorista);
  const clearEmpresaInfo = useStore(s => s.clearEmpresaInfo);
  const setOfertas       = useStore(s => s.setOfertas);
  const itemsCount    = order.items.reduce((acc, item) => acc + item.quantity, 0);

  // Detector de actualización disponible (solo para desarrollador)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      if (reg.waiting) setSwWaiting(true);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) setSwWaiting(true);
        });
      });
    });
  }, []);

  // onAuthStateChanged se dispara cuando Firebase terminó de restaurar la sesión desde
  // IndexedDB — garantiza que user.emailVerified es el valor real, sin problemas de timing.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Sin usuario real → limpiar sesión local si quedó persistida
      if (!user || user.isAnonymous) {
        if (localStorage.getItem('mayolista-session')) {
          localStorage.removeItem('mayolista-session');
          useStore.getState().logout();
          useStore.getState().clearEmpresaInfo();
        }
        return;
      }
      // ADMIN y VENDEDOR con email no verificado → forzar logout
      if (!user.emailVerified) {
        const currentRol = useStore.getState().rol;
        if (['admin', 'vendedor'].includes(currentRol)) {
          localStorage.removeItem('mayolista-session');
          useStore.getState().logout();
          useStore.getState().clearEmpresaInfo();
        }
      }
    });
    return () => unsub();
  }, []);

  // Remove mock data on first load
  useEffect(() => {
    const isMockProduct = id => ['101','102','103','104','105','106','107','108'].includes(id);
    const isMockClient  = id => ['C1','C2','C3','C4'].includes(id);
    useStore.setState(state => {
      const newProducts = state.products.filter(p => !isMockProduct(p.id));
      const newClients  = state.clients.filter(c => !isMockClient(c.id));
      if (newProducts.length !== state.products.length || newClients.length !== state.clients.length) {
        return { products: newProducts, clients: newClients };
      }
      return state;
    });
  }, []);

  // Firebase sync on app start
  useEffect(() => {
    if (!isLoggedIn || !empresaId || !vendedorId) return;

    clientsUnsubRef.current?.();
    clientsUnsubRef.current = listenClientes(empresaId, (firebaseClients) => {
      const deletedIds = new Set(useStore.getState().deletedClientIds);
      const filtered = firebaseClients.filter(c => !deletedIds.has(c.id));
      const local = useStore.getState().clients;
      const fbIds = new Set(filtered.map(c => c.id));
      const localOnly = local.filter(c => !fbIds.has(c.id) && !deletedIds.has(c.id));
      localOnly.forEach(c => addClientToFirebase(empresaId, c).catch(() => {}));
      useStore.setState({ clients: [...filtered, ...localOnly] });
    });

    (async () => {
      try {
        await getDeviceId();
        if (rol !== 'cliente') {
          await updateLastSeen(empresaId, vendedorId);
          sesionLoginAt.current = Date.now();
          const vendedorNombreActual = useStore.getState().vendedorNombre;
          sesionFirebaseId.current = await registrarSesionInicio(empresaId, vendedorId, vendedorNombreActual);
        }

        if (rol === 'vendedor') {
          setSyncing(true);
          const [products, empresaData] = await Promise.all([
            getProductos(empresaId),
            getEmpresaData(empresaId)
          ]);

          if (products.length > 0) useStore.setState({ products });

          if (empresaData) {
            const { logo, ...rest } = empresaData;
            setMayorista(rest);
            if (logo) localStorage.setItem('mayorista-logo', logo);
            else localStorage.removeItem('mayorista-logo');
          }
          setSyncing(false);

          // Real-time block listener
          blockedUnsubRef.current?.();
          blockedUnsubRef.current = listenVendedorBlocked(empresaId, vendedorId, setIsBlocked);

          // Sesión única por vendedor
          sessionUnsubRef.current?.();
          if (vendedorSessionId) {
            sessionUnsubRef.current = listenVendedorSession(empresaId, vendedorId, vendedorSessionId, () => {
              setSessionKicked(true);
            });
          }

          // Real-time products listener
          productsUnsubRef.current?.();
          productsUnsubRef.current = listenProductos(empresaId, (firebaseProducts) => {
            useStore.setState({ products: firebaseProducts });
          });
        }

        // Cliente: cargar productos y empresaData en tiempo real
        if (rol === 'cliente') {
          setSyncing(true);
          const [products, empresaData] = await Promise.all([
            getProductos(empresaId),
            getEmpresaData(empresaId)
          ]);
          if (products.length > 0) useStore.setState({ products });
          if (empresaData) {
            const { logo, ...rest } = empresaData;
            setMayorista(rest);
          }
          setSyncing(false);
          productsUnsubRef.current?.();
          productsUnsubRef.current = listenProductos(empresaId, (fp) => {
            useStore.setState({ products: fp });
          });
        }

        // Admin: cargar datos de empresa (incluye codigoClientes)
        if (rol === 'admin') {
          const empresaData = await getEmpresaData(empresaId);
          if (empresaData) {
            const { logo, ...rest } = empresaData;
            setMayorista(rest);
          }
        }

        // Máximo 2 sesiones para admin; re-registra el sessionId por si era stale
        if (rol === 'admin' && vendedorSessionId) {
          await refreshAdminSession(vendedorId, vendedorSessionId);
          sessionUnsubRef.current?.();
          sessionUnsubRef.current = listenAdminSession(vendedorId, vendedorSessionId, () => {
            setSessionKicked(true);
          });
        }
      } catch {
        setSyncing(false);
      }
    })();

    // Ofertas del día — siempre para clientes, también disponibles para admin/vendedor
    ofertasUnsubRef.current?.();
    ofertasUnsubRef.current = listenOfertas(empresaId, (ofs) => {
      setOfertas(ofs);
    });

    return () => {
      blockedUnsubRef.current?.();
      sessionUnsubRef.current?.();
      clientsUnsubRef.current?.();
      productsUnsubRef.current?.();
      ofertasUnsubRef.current?.();
    };
  }, [isLoggedIn, empresaId]);

  if (showIntro) {
    return <IntroScreen onDone={() => {
      sessionStorage.setItem('intro-done', '1');
      setShowIntro(false);
    }} />;
  }

  if (!isLoggedIn) {
    return <LandingScreen onEnter={() => {
      localStorage.setItem('mayolista-entered', '1');
      localStorage.setItem('mayolista-session', '1');
      login();
    }} />;
  }

  if (!empresaId) {
    return <SetupScreen />;
  }

  const handleLogout = () => {
    if (empresaId && sesionFirebaseId.current) {
      registrarSesionFin(empresaId, sesionFirebaseId.current, sesionLoginAt.current);
    }
    localStorage.removeItem('mayolista-session');
    logout();
    clearEmpresaInfo();
  };

  if (isBlocked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>Acceso desactivado</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '280px' }}>
          Tu acceso fue desactivado por el mayorista. Contactalo para más información.
        </p>
      </div>
    );
  }

  if (sessionKicked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>📱</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>Sesión cerrada</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '280px', marginBottom: '1.5rem' }}>
          Tu cuenta fue iniciada en otro dispositivo. Solo podés usar una sesión a la vez.
        </p>
        <button onClick={handleLogout} style={{
          padding: '0.85rem 2rem', borderRadius: '14px', border: 'none',
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
        }}>
          Volver al inicio
        </button>
      </div>
    );
  }

  const renderScreen = () => {
    if (rol === 'cliente') {
      switch (currentScreen) {
        case 'home':    return <ClienteHomeScreen onNavigate={navigate} onBack={goBack} />;
        case 'order':   return <ProcessOrderScreen onNavigate={navigate} onBack={goBack} readonlyDiscounts />;
        case 'summary': return <SummaryScreen onNavigate={navigate} onBack={goBack} readonlyDiscounts />;
        case 'history': return <HistoryScreen onNavigate={navigate} onBack={goBack} />;
        case 'settings':return <SettingsScreen onNavigate={navigate} onBack={goBack} onLogout={handleLogout} />;
        default:        return <ClienteHomeScreen onNavigate={navigate} onBack={goBack} />;
      }
    }
    switch (currentScreen) {
      case 'home':       return <HomeScreen onNavigate={navigate} onBack={goBack} />;
      case 'clients':    return <ClientsScreen onNavigate={(screen) => {
        if (screen === 'order') {
          const returnTo = afterClientSelectRef.current;
          afterClientSelectRef.current = 'order';
          setScreenHistory(h => [...h, currentScreen]);
          setCurrentScreen(returnTo);
        } else {
          navigate(screen);
        }
      }} onBack={goBack} />;
      case 'history':    return <HistoryScreen onNavigate={navigate} onBack={goBack} />;
      case 'order':      return <ProcessOrderScreen onNavigate={navigate} onBack={goBack} />;
      case 'summary':    return <SummaryScreen onNavigate={navigate} onBack={goBack} />;
      case 'admin':      return <AdminScreen onNavigate={navigate} onBack={goBack} />;
      case 'settings':   return <SettingsScreen onNavigate={navigate} onBack={goBack} onLogout={handleLogout} />;
      case 'adminPanel': return <AdminPanelScreen onNavigate={navigate} onBack={goBack} />;
      default:           return <HomeScreen onNavigate={navigate} onBack={goBack} />;
    }
  };

  const esDev = auth.currentUser?.email === 'hector.g.perez7060@gmail.com';

  return (
    <div className="app-layout">
      {swWaiting && esDev && (
        <div style={{ position: 'fixed', bottom: '5rem', right: '1rem', zIndex: 9999 }}>
          <button onClick={() => {
            navigator.serviceWorker.ready.then(reg => {
              if (reg.waiting) reg.waiting.postMessage('skipWaiting');
            });
          }} style={{
            padding: '0.65rem 1.2rem', borderRadius: '12px', border: 'none',
            background: 'hsl(35,100%,50%)', color: '#fff', fontWeight: 700,
            fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
          }}>
            Nueva versión — Actualizar
          </button>
        </div>
      )}
      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar desktop-only">
        <div style={{ padding: '1.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
          <AppLogo size={40} />
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)', display: 'block' }}>Mayolista</span>
            {syncing && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>sincronizando...</span>}
          </div>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <SidebarButton icon={<Home size={20} />} label="Inicio" active={currentScreen === 'home'} onClick={() => setCurrentScreen('home')} />
          <SidebarButton icon={<Users size={20} />} label="Clientes" active={currentScreen === 'clients'} onClick={() => setCurrentScreen('clients')} />
          <SidebarButton icon={<Search size={20} />} label="Procesar" active={currentScreen === 'order'} onClick={() => setCurrentScreen('order')} />
          <SidebarButton icon={<ShoppingCart size={20} />} label="Resumen" active={currentScreen === 'summary'} onClick={() => setCurrentScreen('summary')} badge={itemsCount} />
          {rol === 'admin' && (
            <SidebarButton icon={<LayoutGrid size={20} />} label="Empresa" active={currentScreen === 'adminPanel'} onClick={() => setCurrentScreen('adminPanel')} />
          )}
        </div>
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setCurrentScreen('settings')} style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-glass)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Settings size={20} /></button>
          <button onClick={() => setShowShare(true)} style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-glass)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Share2 size={20} /></button>
        </div>
      </aside>

      <div className="main-content">
        <div className="mobile-only">
          <AppHeader onShare={() => setShowShare(true)} onSettings={() => setCurrentScreen('settings')} syncing={syncing} />
        </div>
        
        {renderScreen()}
        
        <nav className="glass-panel mobile-only" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxWidth: '600px', margin: '0 auto',
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          zIndex: 50
        }}>
          <div className="flex-between p-2">
            {rol === 'cliente' ? (
              <>
                <NavButton icon={<Home size={22} />}         label="Inicio"   active={currentScreen === 'home'}    onClick={() => setCurrentScreen('home')} />
                <NavButton icon={<Search size={22} />}       label="Pedido"   active={currentScreen === 'order'}   onClick={() => setCurrentScreen('order')} />
                <NavButton icon={<ShoppingCart size={22} />} label="Resumen"  active={currentScreen === 'summary'} onClick={() => setCurrentScreen('summary')} badge={itemsCount} />
                <NavButton icon={<History size={22} />}      label="Historial" active={currentScreen === 'history'} onClick={() => setCurrentScreen('history')} />
              </>
            ) : (
              <>
                <NavButton icon={<Home size={22} />}          label="Inicio"   active={currentScreen === 'home'}       onClick={() => setCurrentScreen('home')} />
                <NavButton icon={<Users size={22} />}         label="Clientes" active={currentScreen === 'clients'}    onClick={() => setCurrentScreen('clients')} />
                <NavButton icon={<Search size={22} />}        label="Procesar" active={currentScreen === 'order'}      onClick={() => setCurrentScreen('order')} />
                <NavButton icon={<ShoppingCart size={22} />}  label="Resumen"  active={currentScreen === 'summary'}   onClick={() => setCurrentScreen('summary')} badge={itemsCount} />
                {rol === 'admin' && (
                  <NavButton icon={<LayoutGrid size={22} />}  label="Empresa"  active={currentScreen === 'adminPanel'} onClick={() => setCurrentScreen('adminPanel')} />
                )}
              </>
            )}
          </div>
        </nav>
      </div>

      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
    </div>
  );
}

function SidebarButton({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.85rem 1rem',
      background: active ? 'hsla(240, 100%, 65%, 0.1)' : 'transparent',
      border: 'none', borderRadius: '12px', cursor: 'pointer',
      color: active ? 'var(--primary)' : 'var(--text-main)',
      transition: 'var(--transition)', position: 'relative', textAlign: 'left'
    }}>
      {icon}
      <span style={{ fontSize: '0.95rem', fontWeight: active ? '600' : '500' }}>{label}</span>
      {badge > 0 && (
        <span className="flex-center" style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function AppHeader({ onShare, onSettings, syncing }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      maxWidth: '600px', margin: '0 auto', height: '44px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <AppLogo size={30} />
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Mayolista</span>
        {syncing && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>
            sincronizando...
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <button onClick={onSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.5rem', display: 'flex', alignItems: 'center', borderRadius: '8px' }}>
          <Settings size={20} />
        </button>
        <button onClick={onShare} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.5rem', display: 'flex', alignItems: 'center', borderRadius: '8px' }}>
          <Share2 size={20} />
        </button>
      </div>
    </div>
  );
}

function ShareModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Mayolista', text: 'App de pedidos mayoristas — rápida y fácil', url: APP_URL }); } catch {}
    } else { handleCopy(); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'hsla(0,0%,0%,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0', padding: '1.25rem 1.25rem 2rem', animation: 'slideUp 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AppLogo size={36} />
            <div>
              <p style={{ fontWeight: 700, fontSize: '1rem' }}>Compartir Mayolista</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Invitá a otros a usarla</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={handleShare} style={{ width: '100%', padding: '0.9rem', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, hsl(270,100%,55%), hsl(240,100%,60%))', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
            <Share2 size={20} /> Compartir por WhatsApp / Más
          </button>
          <button onClick={handleCopy} style={{ width: '100%', padding: '0.9rem', borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-glass)', color: copied ? 'hsl(150,100%,55%)' : 'var(--text-main)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', transition: 'color 0.2s' }}>
            {copied ? <><Check size={18} /> ¡Link copiado!</> : <><Copy size={18} /> Copiar link</>}
          </button>
          <button onClick={() => setShowQR(v => !v)} style={{ width: '100%', padding: '0.9rem', borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-glass)', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
            <QrCode size={18} /> {showQR ? 'Ocultar QR' : 'Mostrar código QR'}
          </button>
          {showQR && (
            <div style={{ textAlign: 'center', padding: '1rem', background: '#0d0d1a', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <img src={QR_URL} alt="QR Mayolista" draggable={false} onContextMenu={e => e.preventDefault()} style={{ width: '180px', height: '180px', borderRadius: '8px', pointerEvents: 'none' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Escaneá para abrir en otro celular</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', position: 'relative', color: active ? 'var(--primary)' : 'var(--text-muted)', transition: 'var(--transition)' }}>
      {icon}
      <span style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: active ? '600' : '400' }}>{label}</span>
      {badge > 0 && (
        <span className="flex-center" style={{ position: 'absolute', top: 0, right: '10%', background: 'var(--danger)', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', fontSize: '0.65rem', fontWeight: 'bold' }}>
          {badge}
        </span>
      )}
    </button>
  );
}
