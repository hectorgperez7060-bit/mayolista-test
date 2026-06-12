import { useState, useEffect } from 'react';
import { Download, ChevronRight } from 'lucide-react';

const APP_URL = 'https://hectorgperez7060-bit.github.io/mayolista/';

function MaylistaLogoIcon({ size = 64 }) {
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

/* ─── iOS step-by-step full screen wizard ────────────────────── */
function IOSWizard({ onSkip }) {
  const [step, setStep] = useState(0);
  const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  if (!isSafari) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'linear-gradient(180deg,#060d1f,#0a1628)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '2rem', textAlign: 'center', gap: '1.5rem'
      }}>
        <div style={{ fontSize: '5rem' }}>🧭</div>
        <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '1.6rem', lineHeight: 1.2 }}>
          Necesitás abrir esto<br/>en <span style={{ color: '#4da6ff' }}>Safari</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem', maxWidth: '280px' }}>
          Chrome no permite instalar apps en iPhone. Copiá el link y pegalo en Safari.
        </p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(APP_URL).catch(() => {});
            window.location.href = APP_URL;
          }}
          style={{
            width: '100%', maxWidth: '320px', padding: '1.1rem', borderRadius: '18px', border: 'none',
            background: 'linear-gradient(135deg,#1e50e0,#4a9eff)',
            color: '#fff', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer'
          }}
        >
          Abrir en Safari
        </button>
        <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', cursor: 'pointer' }}>
          Entrar sin instalar →
        </button>
      </div>
    );
  }

  const steps = [
    {
      paso: '1 de 3',
      titulo: 'Tocá el botón de compartir',
      subtitulo: 'El botón con la flechita está en la barra de abajo de Safari',
      visual: <SafariBarStep />,
    },
    {
      paso: '2 de 3',
      titulo: 'Buscá "Agregar a inicio"',
      subtitulo: 'Se abre un menú — deslizá un poco hacia abajo hasta ver esta opción',
      visual: <ShareSheetStep />,
    },
    {
      paso: '3 de 3',
      titulo: 'Tocá "Agregar"',
      subtitulo: 'Está en la esquina superior derecha de la pantalla',
      visual: <AddDialogStep />,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <>
      <style>{`
        @keyframes iosPulse {
          0%,100% { transform: scale(1);   box-shadow: 0 0 0 0   rgba(0,122,255,0.8); }
          50%      { transform: scale(1.1); box-shadow: 0 0 0 18px rgba(0,122,255,0); }
        }
        @keyframes iosSlideUp {
          from { transform: translateY(30px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes iosBounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(8px); }
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: '#0a0a0f',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem 0.5rem',
          paddingTop: 'max(1rem, env(safe-area-inset-top))'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === step ? '24px' : '8px', height: '8px',
                borderRadius: '4px',
                background: i === step ? '#007AFF' : i < step ? 'rgba(0,122,255,0.4)' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s ease'
              }} />
            ))}
          </div>
          <button
            onClick={onSkip}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '999px',
              color: 'rgba(255,255,255,0.5)', padding: '0.3rem 0.8rem',
              fontSize: '0.82rem', cursor: 'pointer'
            }}
          >
            Saltar
          </button>
        </div>

        {/* Step label */}
        <div style={{ padding: '1.25rem 1.5rem 0' }}>
          <p style={{ color: '#007AFF', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Paso {current.paso}
          </p>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '1.65rem', lineHeight: 1.2, marginBottom: '0.5rem' }}>
            {current.titulo}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            {current.subtitulo}
          </p>
        </div>

        {/* Visual */}
        <div
          key={step}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            animation: 'iosSlideUp 0.35s ease'
          }}
        >
          {current.visual}
        </div>

        {/* Action button */}
        <div style={{
          padding: '1rem 1.5rem',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))'
        }}>
          <button
            onClick={() => isLast ? onSkip() : setStep(s => s + 1)}
            style={{
              width: '100%', padding: '1.1rem', borderRadius: '18px', border: 'none',
              background: 'linear-gradient(135deg,#0055d4,#007AFF)',
              color: '#fff', fontWeight: 800, fontSize: '1.15rem',
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(0,122,255,0.45)'
            }}
          >
            {isLast ? '¡Ya lo agregué! →' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </>
  );
}

/* Step 1 — Safari bottom bar with share button pulsing */
function SafariBarStep() {
  return (
    <div style={{
      width: '100%', maxWidth: '360px',
      display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center'
    }}>
      {/* iPhone frame */}
      <div style={{
        width: '260px',
        background: '#1c1c1e',
        borderRadius: '28px',
        border: '2px solid rgba(255,255,255,0.12)',
        overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,0.8)'
      }}>
        {/* Status bar */}
        <div style={{ background: '#1c1c1e', padding: '10px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>9:41</span>
          <div style={{ width: '30px', height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px' }} />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[12,10,8].map((h,i) => <div key={i} style={{ width: '3px', height: h, background: 'rgba(255,255,255,0.7)', borderRadius: '1px' }} />)}
            <div style={{ width: '14px', height: '7px', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '2px', marginLeft: '2px' }}>
              <div style={{ width: '8px', height: '5px', background: 'rgba(255,255,255,0.7)', borderRadius: '1px', margin: '0 0 0 1px' }} />
            </div>
          </div>
        </div>
        {/* Webpage area */}
        <div style={{ background: '#f2f2f7', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <MaylistaLogoIcon size={44} />
            <p style={{ color: '#1c1c1e', fontSize: '0.7rem', fontWeight: 700, marginTop: '6px' }}>Mayolista</p>
          </div>
        </div>
        {/* Safari address bar */}
        <div style={{ background: '#f2f2f7', padding: '6px 12px' }}>
          <div style={{ background: '#e5e5ea', borderRadius: '10px', padding: '5px 10px', fontSize: '0.62rem', color: '#8e8e93', textAlign: 'center' }}>
            hectorgperez7060-bit.github.io
          </div>
        </div>
        {/* Safari bottom bar */}
        <div style={{ background: '#f2f2f7', padding: '8px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {['←', '→'].map((icon, i) => (
            <div key={i} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.25)', fontSize: '1rem' }}>
              {icon}
            </div>
          ))}
          {/* THE SHARE BUTTON — pulsing */}
          <div style={{ animation: 'iosPulse 1.4s ease-in-out infinite', borderRadius: '8px' }}>
            <div style={{
              width: '38px', height: '38px',
              background: 'rgba(0,122,255,0.18)',
              border: '2px solid #007AFF',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2v11M5 7l5-5 5 5" stroke="#007AFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="2" y="13" width="16" height="6" rx="2.5" stroke="#007AFF" strokeWidth="1.8" fill="none"/>
              </svg>
            </div>
          </div>
          {['⊡', '⋯'].map((icon, i) => (
            <div key={i} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.35)', fontSize: '1.1rem' }}>
              {icon}
            </div>
          ))}
        </div>
      </div>
      {/* Arrow */}
      <div style={{ animation: 'iosBounce 1s ease-in-out infinite', textAlign: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4v20M6 12l8 10 8-10" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p style={{ color: '#007AFF', fontWeight: 700, fontSize: '0.85rem', marginTop: '4px' }}>Tocá este botón</p>
      </div>
    </div>
  );
}

/* Step 2 — iOS share sheet with "Agregar a pantalla de inicio" */
function ShareSheetStep() {
  return (
    <div style={{ width: '100%', maxWidth: '340px' }}>
      <div style={{
        background: '#1c1c1e',
        borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'hidden'
      }}>
        {/* Handle */}
        <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
        </div>
        {/* App icons row */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: '16px', overflowX: 'hidden' }}>
          {[
            { label: 'Mensaje', color: '#34c759', icon: '💬' },
            { label: 'Mail',    color: '#007AFF', icon: '✉️' },
            { label: 'WhatsApp', color: '#25d366', icon: '📱' },
            { label: 'Más',     color: '#8e8e93', icon: '…' },
          ].map(({ label, color, icon }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '52px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                {icon}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.62rem' }}>{label}</p>
            </div>
          ))}
        </div>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 16px' }} />
        {/* Options list */}
        {[
          { icon: '🔖', label: 'Añadir favorito' },
          { icon: '📋', label: 'Copiar' },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '1.2rem' }}>{icon}</span>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{label}</p>
          </div>
        ))}
        {/* HIGHLIGHTED OPTION */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '13px 20px',
          background: 'rgba(0,122,255,0.18)',
          border: '2px solid #007AFF',
          margin: '4px 8px',
          borderRadius: '12px',
          animation: 'iosPulse 1.6s ease-in-out infinite'
        }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: '#007AFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="3" width="14" height="14" rx="3" stroke="#fff" strokeWidth="1.8"/>
              <path d="M10 7v6M7 10h6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>Agregar a pantalla de inicio</p>
        </div>
        <div style={{ height: '12px', background: '#1c1c1e' }} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', textAlign: 'center', marginTop: '12px' }}>
        Tocá la opción resaltada en azul
      </p>
    </div>
  );
}

/* Step 3 — "Add to Home Screen" dialog */
function AddDialogStep() {
  return (
    <div style={{ width: '100%', maxWidth: '300px' }}>
      <div style={{
        background: '#2c2c2e',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.8)'
      }}>
        {/* Title bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
          <button style={{ background: 'none', border: 'none', color: '#636366', fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Agregar a inicio</span>
          {/* HIGHLIGHTED AGREGAR */}
          <button style={{
            background: 'none', border: 'none',
            color: '#007AFF', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
            animation: 'iosPulse 1.4s ease-in-out infinite',
            padding: '4px 8px', borderRadius: '8px'
          }}>
            Agregar
          </button>
        </div>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        {/* App preview */}
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <MaylistaLogoIcon size={72} />
          <div style={{
            background: '#3a3a3c', borderRadius: '8px',
            padding: '6px 12px', width: '100%', textAlign: 'center'
          }}>
            <p style={{ color: '#fff', fontSize: '0.9rem' }}>Mayolista</p>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center' }}>
            hectorgperez7060-bit.github.io
          </p>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '16px', animation: 'iosBounce 1s ease-in-out infinite' }}>
        <p style={{ color: '#007AFF', fontWeight: 700, fontSize: '0.9rem' }}>
          ↗ Tocá "Agregar" arriba a la derecha
        </p>
      </div>
    </div>
  );
}

/* ─── Main landing page ───────────────────────────────────────── */
export default function LandingScreen({ onEnter }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showIOSWizard, setShowIOSWizard] = useState(false);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setInstalled(true); setTimeout(onEnter, 800); });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDownload = async () => {
    if (installed) { onEnter(); return; }
    if (installPrompt) {
      setLoading(true);
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstallPrompt(null);
      setLoading(false);
      return;
    }
    if (isIOS) { setShowIOSWizard(true); return; }
    onEnter();
  };

  if (showIOSWizard) {
    return <IOSWizard onSkip={() => { setShowIOSWizard(false); onEnter(); }} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg,#060d1f 0%,#0a1628 40%,#0d1b3e 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1.5rem 3rem', overflow: 'hidden'
    }}>
      {/* Glow */}
      <div style={{
        position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',
        width: '500px', height: '400px',
        background: 'radial-gradient(ellipse,rgba(30,80,220,0.18) 0%,transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>

        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '26px',
            margin: '0 auto 1.25rem',
            background: 'linear-gradient(145deg,#0d2050,#0a1628)',
            border: '1.5px solid rgba(74,154,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 50px rgba(37,99,235,0.35),0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <MaylistaLogoIcon size={68} />
          </div>
          <h1 style={{
            fontSize: '2.6rem', fontWeight: 900, letterSpacing: '-1px', marginBottom: '0.4rem',
            background: 'linear-gradient(135deg,#fff 0%,#a5c8ff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>Mayolista</h1>
          <p style={{ color: 'rgba(165,200,255,0.75)', fontSize: '1rem' }}>
            Pedidos mayoristas, rápido y sin papeles
          </p>
        </div>

        {/* Feature pills */}
        <div style={{ width: '100%', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[
            { emoji: '✨', text: 'IA que entiende cómo hablás' },
            { emoji: '🎤', text: 'Dictado por voz' },
            { emoji: '📲', text: 'PDF y WhatsApp en un toque' },
          ].map(({ emoji, text }) => (
            <div key={text} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.65rem 1rem',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '12px', border: '1px solid rgba(74,154,255,0.1)'
            }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{emoji}</span>
              <p style={{ fontWeight: 500, color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Install / iOS button */}
        {installed ? (
          <div style={{
            width: '100%', padding: '1rem', borderRadius: '16px',
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
            textAlign: 'center', color: 'rgb(134,239,172)', fontWeight: 700, fontSize: '1rem'
          }}>
            ✓ ¡App instalada! Abrila desde tu pantalla de inicio.
          </div>
        ) : (
          <button
            onClick={handleDownload}
            disabled={loading}
            style={{
              width: '100%', padding: '1.1rem 1.5rem', borderRadius: '18px', border: 'none',
              background: isIOS
                ? 'linear-gradient(135deg,#0055d4,#007AFF)'
                : 'linear-gradient(135deg,#1e50e0,#2563eb,#4a9eff)',
              color: '#fff', fontWeight: 800, fontSize: '1.1rem',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
              boxShadow: '0 4px 24px rgba(37,99,235,0.5),0 0 0 1px rgba(255,255,255,0.1)',
              opacity: loading ? 0.8 : 1, marginBottom: '0.75rem'
            }}
          >
            <Download size={22} />
            {loading ? 'Instalando...' : isIOS ? 'Instalar en iPhone' : 'Descargar Mayolista'}
          </button>
        )}

        <button
          onClick={onEnter}
          style={{
            background: 'none', border: 'none', color: 'rgba(165,200,255,0.45)',
            fontSize: '0.88rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem'
          }}
        >
          Entrar sin instalar <ChevronRight size={15} />
        </button>

      </div>
    </div>
  );
}
