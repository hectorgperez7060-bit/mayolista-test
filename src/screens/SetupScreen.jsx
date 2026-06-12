import { useState, useEffect, useRef } from 'react';
import { Building2, Users, Loader, ArrowRight, KeyRound, Eye, EyeOff, ShoppingBag, CheckCircle2, Circle } from 'lucide-react';
import { useStore } from '../store';
import {
  loginAdmin, registerAdmin,
  registerVendor, loginVendor,
  registerCliente, loginCliente,
  resetPassword, resendVerificationEmail, checkEmailVerified,
  logout as firebaseLogout
} from '../services/firebase';

function getPasswordRules(pwd) {
  return {
    length: pwd.length >= 8,
    upper:  /[A-Z]/.test(pwd),
    lower:  /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
  };
}

function isPasswordValid(pwd) {
  const r = getPasswordRules(pwd);
  return r.length && r.upper && r.lower && r.number;
}

function isEmailFormatValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function PasswordChecklist({ password }) {
  const rules = getPasswordRules(password);
  const items = [
    { key: 'length', label: 'Al menos 8 caracteres' },
    { key: 'upper',  label: 'Al menos una mayúscula' },
    { key: 'lower',  label: 'Al menos una minúscula' },
    { key: 'number', label: 'Al menos un número' },
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.35rem',
      padding: '0.75rem', background: 'var(--bg-surface-glass)',
      borderRadius: '12px', border: '1px solid var(--border-color)'
    }}>
      {items.map(({ key, label }) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.8rem',
          color: rules[key] ? 'hsl(150,80%,55%)' : 'var(--text-muted)',
          transition: 'color 0.2s'
        }}>
          {rules[key]
            ? <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
            : <Circle      size={14} style={{ flexShrink: 0 }} />}
          {label}
        </div>
      ))}
    </div>
  );
}

export default function SetupScreen() {
  const [mode, setMode]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const [joinCode, setJoinCode]     = useState('');
  const [vendorName, setVendorName] = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [isLogin, setIsLogin]       = useState(true);

  const [clienteNombre,    setClienteNombre]    = useState('');
  const [clienteCuit,      setClienteCuit]      = useState('');
  const [clienteDireccion, setClienteDireccion] = useState('');
  const [clienteLocalidad, setClienteLocalidad] = useState('');
  const [clienteTelefono,  setClienteTelefono]  = useState('');

  // Email verification pending
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail,        setPendingEmail]        = useState('');
  const [resendCooldown,      setResendCooldown]      = useState(0);
  const cooldownRef = useRef(null);

  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail,        setForgotEmail]        = useState('');
  const [forgotSent,         setForgotSent]         = useState(false);
  const [forgotLoading,      setForgotLoading]      = useState(false);
  const [forgotError,        setForgotError]        = useState('');

  const mayorista      = useStore(s => s.mayorista);
  const products       = useStore(s => s.products);
  const setEmpresaInfo = useStore(s => s.setEmpresaInfo);
  const setClienteInfo = useStore(s => s.setClienteInfo);
  const login          = useStore(s => s.login);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // Derived validation
  const passwordValid    = isPasswordValid(password);
  const confirmMismatch  = !isLogin && confirmPassword.length > 0 && password !== confirmPassword;
  const registerDisabled = !isLogin && (!passwordValid || confirmMismatch);

  // ──────────────────────────────────────────────────────────────
  // Cooldown helper
  // ──────────────────────────────────────────────────────────────
  const startCooldown = () => {
    setResendCooldown(60);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ──────────────────────────────────────────────────────────────
  // Verification screen handlers
  // ──────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      await resendVerificationEmail();
      setError('✅ Correo reenviado. Revisá tu bandeja de entrada.');
      startCooldown();
    } catch {
      setError('No se pudo reenviar. Intentá nuevamente en unos minutos.');
    }
    setLoading(false);
  };

  const handleCheckVerified = async () => {
    setLoading(true);
    setError('');
    try {
      const verified = await checkEmailVerified();
      if (!verified) {
        setError('Aún no verificaste tu correo. Hacé click en el enlace que te enviamos.');
        setLoading(false);
        return;
      }
      // Email verificado — iniciar sesión
      if (mode === 'admin') {
        const res = await loginAdmin(email.trim(), password);
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: res.empresaCodigo,
          rol: res.rol, vendedorId: res.uid,
          vendedorNombre: res.vendedorNombre, vendedorSessionId: res.vendedorSessionId
        });
      } else if (mode === 'join') {
        const res = await loginVendor(email.trim(), password);
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: res.empresaData.codigo,
          rol: res.rol, vendedorId: res.vendedorId, vendedorNombre: res.vendedorNombre
        });
      } else if (mode === 'cliente') {
        const res = await loginCliente(email.trim(), password);
        setClienteInfo(res.clienteInfo);
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: null, rol: 'cliente',
          vendedorId: res.uid, vendedorNombre: res.clienteInfo?.name || 'Cliente', vendedorSessionId: null
        });
        localStorage.setItem('mayolista-session', '1');
        login();
      }
      setPendingVerification(false);
    } catch (e) {
      setError(e.message?.replace('Error de login:', '').trim() || 'Error al verificar. Intentá nuevamente.');
    }
    setLoading(false);
  };

  const handleBackFromVerification = async () => {
    await firebaseLogout().catch(() => {});
    setPendingVerification(false);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  // ──────────────────────────────────────────────────────────────
  // Forgot password handler
  // ──────────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { setForgotError('Ingresá tu correo electrónico.'); return; }
    if (!isEmailFormatValid(forgotEmail)) { setForgotError('El correo no tiene un formato válido.'); return; }
    setForgotLoading(true);
    setForgotError('');
    try {
      await resetPassword(forgotEmail.trim());
      setForgotSent(true);
    } catch (e) {
      setForgotError(e.message || 'No se pudo enviar el correo. Verificá la dirección ingresada.');
    }
    setForgotLoading(false);
  };

  // ──────────────────────────────────────────────────────────────
  // Email validation on submit
  // ──────────────────────────────────────────────────────────────
  const validateEmail = (val) => {
    if (!val.trim()) { setError('Ingresá tu correo electrónico.'); return false; }
    if (!isEmailFormatValid(val)) { setError('El correo no tiene un formato válido. Ejemplo: nombre@dominio.com'); return false; }
    return true;
  };

  // ──────────────────────────────────────────────────────────────
  // Auth handlers
  // ──────────────────────────────────────────────────────────────
  const enterVerification = (emailVal) => {
    setPendingVerification(true);
    setPendingEmail(emailVal);
    startCooldown();
  };

  const handleAdminAuth = async () => {
    if (!validateEmail(email)) return;
    if (!password.trim()) { setError('Ingresá tu contraseña.'); return; }
    if (!isLogin && !passwordValid)      { setError('La contraseña no cumple los requisitos de seguridad.'); return; }
    if (!isLogin && password !== confirmPassword) { setError('Las contraseñas no coinciden. Verificá que estén escritas igual.'); return; }

    setLoading(true); setError('');
    try {
      if (isLogin) {
        const res = await loginAdmin(email.trim(), password.trim());
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: res.empresaCodigo,
          rol: res.rol, vendedorId: res.uid,
          vendedorNombre: res.vendedorNombre, vendedorSessionId: res.vendedorSessionId
        });
      } else {
        const res = await registerAdmin(email.trim(), password.trim(), mayorista, products);
        if (res.pendingVerification) {
          enterVerification(email.trim());
        } else {
          setEmpresaInfo({
            empresaId: res.empresaId, empresaCodigo: res.codigo,
            rol: 'admin', vendedorId: res.uid,
            vendedorNombre: 'Admin', vendedorSessionId: res.vendedorSessionId
          });
        }
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('EMAIL_NOT_VERIFIED')) {
        enterVerification(email.trim());
      } else if (msg.includes('email-already-in-use')) {
        setError('Este correo ya tiene una cuenta. Usá "¿Ya tenés cuenta? Ingresá aquí" para iniciar sesión.');
      } else {
        setError(msg.replace('Error en registro:', '').replace('Error de login:', '').trim() || 'Error de autenticación. Verificá tus datos.');
      }
    }
    setLoading(false);
  };

  const handleVendorAuth = async () => {
    if (!validateEmail(email)) return;
    if (!password.trim()) { setError('Ingresá tu contraseña.'); return; }
    if (!isLogin && !passwordValid)      { setError('La contraseña no cumple los requisitos de seguridad.'); return; }
    if (!isLogin && password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!isLogin && (!joinCode.trim() || !vendorName.trim())) { setError('Ingresá tu nombre y el código de empresa.'); return; }

    setLoading(true); setError('');
    try {
      if (isLogin) {
        const res = await loginVendor(email.trim(), password.trim());
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: res.empresaData.codigo,
          rol: res.rol, vendedorId: res.vendedorId, vendedorNombre: res.vendedorNombre
        });
      } else {
        const res = await registerVendor(email.trim(), password.trim(), joinCode.trim(), vendorName.trim());
        if (res.pendingVerification) {
          enterVerification(email.trim());
        } else {
          setEmpresaInfo({
            empresaId: res.empresaId, empresaCodigo: res.empresaData.codigo,
            rol: res.rol, vendedorId: res.vendedorId, vendedorNombre: res.vendedorNombre
          });
        }
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('EMAIL_NOT_VERIFIED')) {
        enterVerification(email.trim());
      } else {
        setError(msg || 'Error de autenticación.');
      }
    }
    setLoading(false);
  };

  const handleClienteAuth = async () => {
    if (!validateEmail(email)) return;
    if (!password.trim()) { setError('Ingresá tu contraseña.'); return; }
    if (!isLogin && !passwordValid)      { setError('La contraseña no cumple los requisitos de seguridad.'); return; }
    if (!isLogin && password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (!isLogin && (!joinCode.trim() || !clienteNombre.trim() || !clienteCuit.trim())) {
      setError('Completá todos los campos obligatorios (*).'); return;
    }

    setLoading(true); setError('');
    try {
      if (isLogin) {
        setError('⏳ Verificando cuenta...');
        const res = await loginCliente(email.trim(), password.trim());
        setError('✅ Listo! Ingresando...');
        setClienteInfo(res.clienteInfo);
        setEmpresaInfo({
          empresaId: res.empresaId, empresaCodigo: null, rol: 'cliente',
          vendedorId: res.uid, vendedorNombre: res.clienteInfo?.name || 'Cliente', vendedorSessionId: null
        });
        localStorage.setItem('mayolista-session', '1');
        login();
      } else {
        setError('⏳ Paso 1/3: Creando cuenta...');
        const clienteData = {
          name: clienteNombre.trim(), cuit: clienteCuit.trim(),
          address: clienteDireccion.trim(), localidad: clienteLocalidad.trim(),
          phone: clienteTelefono.trim(), email: email.trim().toLowerCase()
        };
        const res = await registerCliente(
          email.trim(), password.trim(), joinCode.trim(), clienteData,
          (paso) => setError(paso)
        );
        if (res.pendingVerification) {
          enterVerification(email.trim());
        } else {
          res.clienteInfo = { id: res.clienteId, ...clienteData, codigoCliente: res.codigoCliente };
          setError('✅ Listo! Ingresando...');
          setClienteInfo(res.clienteInfo);
          setEmpresaInfo({
            empresaId: res.empresaId, empresaCodigo: null, rol: 'cliente',
            vendedorId: res.uid, vendedorNombre: clienteNombre.trim(), vendedorSessionId: null
          });
          localStorage.setItem('mayolista-session', '1');
          login();
        }
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg === 'EMAIL_NOT_VERIFIED') {
        enterVerification(email.trim());
      } else {
        console.error('[cliente auth error]', e);
        setError('❌ ' + (msg || 'Error desconocido'));
      }
    }
    setLoading(false);
  };

  // ──────────────────────────────────────────────────────────────
  // RENDER: Verificación de email pendiente
  // ──────────────────────────────────────────────────────────────
  if (pendingVerification) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>📧</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Verificá tu correo electrónico
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '320px', margin: '0 auto 0.4rem' }}>
            Te enviamos un correo a
          </p>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
            {pendingEmail}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '300px', margin: '0 auto 0.75rem' }}>
            Hacé click en el enlace de verificación para activar tu cuenta, luego volvé aquí.
          </p>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            background: 'hsla(35,100%,50%,0.1)', border: '1px solid hsla(35,100%,50%,0.3)',
            borderRadius: '12px', padding: '0.75rem 1rem', maxWidth: '320px', margin: '0 auto'
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
            <p style={{ fontSize: '0.82rem', color: 'hsl(35,100%,65%)', lineHeight: 1.5 }}>
              Si no ves el correo, <strong>revisá tu carpeta de Spam o Correo no deseado</strong> — a veces llega ahí.
            </p>
          </div>
        </div>

        {error && (
          <p style={{
            color: error.startsWith('✅') ? 'hsl(150,80%,55%)' : 'var(--danger)',
            fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem', fontWeight: 500
          }}>{error}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={handleCheckVerified} disabled={loading} style={{
            width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
            background: 'linear-gradient(135deg, hsl(150,80%,30%), hsl(150,80%,42%))',
            color: '#fff', fontWeight: 800, fontSize: '1rem',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            opacity: loading ? 0.8 : 1
          }}>
            {loading
              ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...</>
              : <>Ya verifiqué — Ingresar <ArrowRight size={20} /></>}
          </button>

          <button
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
            style={{
              width: '100%', padding: '1rem', borderRadius: '16px',
              border: '1px solid var(--border-color)', background: 'var(--bg-surface-glass)',
              color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--text-main)',
              fontWeight: 600, fontSize: '0.95rem',
              cursor: (loading || resendCooldown > 0) ? 'default' : 'pointer'
            }}
          >
            {resendCooldown > 0
              ? `Reenviar correo (${resendCooldown}s)`
              : 'Reenviar correo de verificación'}
          </button>

          <button onClick={handleBackFromVerification} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.9rem'
          }}>
            ← Volver al inicio
          </button>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER: Recuperación de contraseña
  // ──────────────────────────────────────────────────────────────
  if (showForgotPassword) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
        <button
          onClick={() => { setShowForgotPassword(false); setForgotEmail(''); setForgotSent(false); setForgotError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start', marginBottom: '1.5rem', fontSize: '0.9rem' }}
        >
          ← Volver
        </button>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔑</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Recuperar contraseña</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Ingresá tu correo y te enviamos un enlace para restablecer tu contraseña.
          </p>
        </div>

        {forgotSent ? (
          <div style={{
            textAlign: 'center', padding: '1.5rem',
            background: 'hsla(150,80%,40%,0.1)', borderRadius: '16px',
            border: '1px solid hsla(150,80%,40%,0.3)'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>¡Correo enviado!</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Revisá tu bandeja de entrada en <strong>{forgotEmail}</strong> y seguí las instrucciones para restablecer tu contraseña.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <input
                type="email"
                className="input-glass"
                placeholder="Correo electrónico"
                value={forgotEmail}
                onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                style={{ fontSize: '1rem', padding: '0.85rem' }}
              />
            </div>
            {forgotError && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>{forgotError}</p>
            )}
            <button onClick={handleForgotPassword} disabled={forgotLoading} style={{
              width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
              background: 'linear-gradient(135deg, hsl(270,100%,55%), hsl(240,100%,60%))',
              color: '#fff', fontWeight: 800, fontSize: '1rem',
              cursor: forgotLoading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              opacity: forgotLoading ? 0.8 : 1
            }}>
              {forgotLoading
                ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</>
                : <>Enviar correo de recuperación <ArrowRight size={20} /></>}
            </button>
          </>
        )}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER: Selección de tipo de acceso para Cliente
  // ──────────────────────────────────────────────────────────────
  if (mode === 'cliente' && isLogin === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
      <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        ← Volver
      </button>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <ShoppingBag size={52} style={{ color: 'hsl(35,100%,55%)', margin: '0 auto 0.75rem' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Acceso Clientes</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>¿Qué querés hacer?</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button onClick={() => setIsLogin(false)} style={{
          padding: '1.25rem', borderRadius: '18px', border: 'none',
          background: 'linear-gradient(135deg, hsl(35,100%,45%), hsl(35,100%,58%))',
          color: '#fff', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer'
        }}>
          Registrarme por primera vez
        </button>
        <button onClick={() => setIsLogin(true)} style={{
          padding: '1.25rem', borderRadius: '18px',
          border: '2px solid var(--border-color)', background: 'var(--bg-surface-glass)',
          color: 'var(--text-main)', fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer'
        }}>
          Ya tengo cuenta — Ingresar
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ──────────────────────────────────────────────────────────────
  // RENDER: Formulario Cliente
  // ──────────────────────────────────────────────────────────────
  if (mode === 'cliente') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}>
      <button onClick={() => setIsLogin(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        ← Volver
      </button>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <ShoppingBag size={52} style={{ color: 'hsl(35,100%,55%)', margin: '0 auto 0.75rem' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {isLogin ? 'Ingresar como Cliente' : 'Registrarme como Cliente'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {isLogin ? 'Accedé a tu cuenta de compras' : 'Completá tus datos para registrarte'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input type="email" className="input-glass" placeholder="Correo electrónico"
          value={email} onChange={e => setEmail(e.target.value)}
          style={{ fontSize: '1rem', padding: '0.85rem' }} />

        <div style={{ position: 'relative' }}>
          <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Contraseña"
            value={password} onChange={e => setPassword(e.target.value)}
            style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', paddingRight: '2.5rem' }} />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {!isLogin && password.length > 0 && <PasswordChecklist password={password} />}

        {!isLogin && (
          <>
            <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Repetir contraseña"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', border: confirmMismatch ? '1.5px solid var(--danger)' : undefined }} />
            {confirmMismatch && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '-0.4rem' }}>Las contraseñas no coinciden.</p>
            )}
            <input className="input-glass" placeholder="Código de clientes (ej: CL-AB34XY)"
              value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              style={{ fontSize: '1rem', padding: '0.85rem', letterSpacing: '0.05em', fontWeight: 600 }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.25rem' }}>El mayorista te da este código. Campos obligatorios (*)</p>
            <input className="input-glass" placeholder="* Nombre completo o razón social"
              value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem' }} />
            <input className="input-glass" placeholder="* CUIT (sin guiones)"
              value={clienteCuit} onChange={e => setClienteCuit(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem' }} />
            <input className="input-glass" placeholder="Dirección"
              value={clienteDireccion} onChange={e => setClienteDireccion(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem' }} />
            <input className="input-glass" placeholder="Localidad"
              value={clienteLocalidad} onChange={e => setClienteLocalidad(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem' }} />
            <input className="input-glass" placeholder="Teléfono"
              value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem' }} />
          </>
        )}
      </div>

      {error && <p style={{
        color: error.startsWith('⏳') ? 'var(--text-muted)' : error.startsWith('✅') ? 'hsl(150,80%,55%)' : 'var(--danger)',
        fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem',
        fontWeight: error.startsWith('⏳') || error.startsWith('✅') ? 600 : 400
      }}>{error}</p>}

      <button onClick={handleClienteAuth} disabled={loading || registerDisabled} style={{
        width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
        background: 'linear-gradient(135deg, hsl(35,100%,45%), hsl(35,100%,55%))',
        color: '#fff', fontWeight: 800, fontSize: '1rem',
        cursor: (loading || registerDisabled) ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        opacity: (loading || registerDisabled) ? 0.5 : 1
      }}>
        {loading
          ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> {isLogin ? 'Ingresando...' : 'Registrando...'}</>
          : <>{isLogin ? 'Ingresar' : 'Registrarme'} <ArrowRight size={20} /></>}
      </button>

      {isLogin && (
        <button
          onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
        >
          ¿Olvidaste tu contraseña?
        </button>
      )}

      <button onClick={() => { setIsLogin(null); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.9rem' }}>
        ← Cambiar opción
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ──────────────────────────────────────────────────────────────
  // RENDER: Formulario Admin
  // ──────────────────────────────────────────────────────────────
  if (mode === 'admin') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
      <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        ← Volver
      </button>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <Building2 size={52} style={{ color: 'var(--primary)', margin: '0 auto 0.75rem' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {isLogin ? 'Ingresar como Dueño' : 'Crear mi Empresa'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {isLogin ? 'Accedé a tu panel de control' : 'Registrá tu correo y protege tu cuenta'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input type="email" className="input-glass" placeholder="Correo electrónico"
          value={email} onChange={e => setEmail(e.target.value)}
          style={{ fontSize: '1rem', padding: '0.85rem' }} />

        <div style={{ position: 'relative' }}>
          <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Contraseña"
            value={password} onChange={e => setPassword(e.target.value)}
            style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', paddingRight: '2.5rem' }} />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {!isLogin && password.length > 0 && <PasswordChecklist password={password} />}

        {!isLogin && (
          <>
            <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Repite la contraseña"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', border: confirmMismatch ? '1.5px solid var(--danger)' : undefined }} />
            {confirmMismatch && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '-0.4rem' }}>Las contraseñas no coinciden.</p>
            )}
          </>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}

      <button onClick={handleAdminAuth} disabled={loading || registerDisabled} style={{
        width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
        background: 'linear-gradient(135deg, hsl(270,100%,55%), hsl(240,100%,60%))',
        color: '#fff', fontWeight: 800, fontSize: '1rem',
        cursor: (loading || registerDisabled) ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        opacity: (loading || registerDisabled) ? 0.5 : 1
      }}>
        {loading
          ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> {isLogin ? 'Ingresando...' : 'Creando...'}</>
          : <>{isLogin ? 'Ingresar' : 'Crear Empresa'} <ArrowRight size={20} /></>}
      </button>

      {isLogin && (
        <button
          onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
        >
          ¿Olvidaste tu contraseña?
        </button>
      )}

      <button
        onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setConfirmPassword(''); }}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        {isLogin ? '¿No tenés cuenta? Creá tu empresa aquí' : '¿Ya tenés cuenta? Ingresá aquí'}
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ──────────────────────────────────────────────────────────────
  // RENDER: Formulario Vendedor
  // ──────────────────────────────────────────────────────────────
  if (mode === 'join') return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
      <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        ← Volver
      </button>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <KeyRound size={52} style={{ color: 'hsl(150,80%,50%)', margin: '0 auto 0.75rem' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {isLogin ? 'Ingresar como Vendedor' : 'Crear mi cuenta'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {isLogin ? 'Ingresá con tu correo y contraseña' : 'Registrate y conectate a tu mayorista'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input type="email" className="input-glass" placeholder="Correo electrónico"
          value={email} onChange={e => setEmail(e.target.value)}
          style={{ fontSize: '1rem', padding: '0.85rem' }} />

        <div style={{ position: 'relative' }}>
          <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Contraseña"
            value={password} onChange={e => setPassword(e.target.value)}
            style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', paddingRight: '2.5rem' }} />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {!isLogin && password.length > 0 && <PasswordChecklist password={password} />}

        {!isLogin && (
          <>
            <input type={showPassword ? 'text' : 'password'} className="input-glass" placeholder="Repite la contraseña"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem', width: '100%', border: confirmMismatch ? '1.5px solid var(--danger)' : undefined }} />
            {confirmMismatch && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '-0.4rem' }}>Las contraseñas no coinciden.</p>
            )}
            <input className="input-glass" placeholder="Tu nombre (ej: Juan López)"
              value={vendorName} onChange={e => setVendorName(e.target.value)}
              style={{ fontSize: '1rem', padding: '0.85rem', marginTop: '0.5rem' }} />
            <input className="input-glass" placeholder="Código del mayorista (ej: GARCIA-1234)"
              value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              style={{ fontSize: '1rem', padding: '0.85rem', letterSpacing: '0.05em', fontWeight: 600 }} />
          </>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}

      <button onClick={handleVendorAuth} disabled={loading || registerDisabled} style={{
        width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
        background: 'linear-gradient(135deg, hsl(150,80%,30%), hsl(150,80%,42%))',
        color: '#fff', fontWeight: 800, fontSize: '1rem',
        cursor: (loading || registerDisabled) ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        opacity: (loading || registerDisabled) ? 0.5 : 1
      }}>
        {loading
          ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> {isLogin ? 'Ingresando...' : 'Creando cuenta...'}</>
          : <>{isLogin ? 'Ingresar' : 'Conectarme al mayorista'} <ArrowRight size={20} /></>}
      </button>

      {isLogin && (
        <button
          onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
        >
          ¿Olvidaste tu contraseña?
        </button>
      )}

      <button
        onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setConfirmPassword(''); }}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '1rem', cursor: 'pointer', fontSize: '0.9rem' }}
      >
        {isLogin ? '¿No tenés cuenta? Registrate con el código' : '¿Ya tenés cuenta? Ingresá aquí'}
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ──────────────────────────────────────────────────────────────
  // RENDER: Selección de rol (pantalla inicial)
  // ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <img src={`${import.meta.env.BASE_URL}icon3-512.png`} alt="Mayolista" width={72} height={72}
          style={{ borderRadius: '50%', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '1.9rem', fontWeight: 900, marginBottom: '0.5rem' }}>Bienvenido</h1>
        <p style={{ color: 'var(--text-muted)' }}>¿Cómo querés usar Mayolista?</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button onClick={() => setMode('admin')} style={{
          width: '100%', padding: '1.25rem', borderRadius: '18px',
          border: '2px solid hsl(270,100%,55%)', background: 'hsla(270,100%,55%,0.08)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left'
        }}>
          <Building2 size={34} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>Soy el mayorista (Dueño)</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Crear empresa o Ingresar con mi correo electrónico para administrar.
            </p>
          </div>
        </button>
        <button onClick={() => setMode('join')} style={{
          width: '100%', padding: '1.25rem', borderRadius: '18px',
          border: '2px solid hsl(150,80%,40%)', background: 'hsla(150,80%,40%,0.08)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left'
        }}>
          <Users size={34} style={{ color: 'hsl(150,80%,50%)', flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>Soy vendedor</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Tengo un código de empresa — me conecto para tomar pedidos.
            </p>
          </div>
        </button>
        <button onClick={() => { setMode('cliente'); setIsLogin(null); setError(''); }} style={{
          width: '100%', padding: '1.25rem', borderRadius: '18px',
          border: '2px solid hsl(35,100%,50%)', background: 'hsla(35,100%,50%,0.08)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left'
        }}>
          <ShoppingBag size={34} style={{ color: 'hsl(35,100%,55%)', flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>Soy cliente</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Consulto ofertas, lista de precios y realizo mis pedidos.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
