import { useState, useRef } from 'react';
import { useStore } from '../store';
import { Save, LogOut, ChevronLeft, Building2, User, ImagePlus, Trash2 } from 'lucide-react';

function resizeImage(file, maxW = 500, maxH = 250) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const CONDICION_IVA = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final'];

export default function SettingsScreen({ onNavigate, onLogout }) {
  const mayorista    = useStore(state => state.mayorista);
  const setMayorista = useStore(state => state.setMayorista);
  const [form, setForm]               = useState({
    nombre:       mayorista.nombre       || '',
    cuit:         mayorista.cuit         || '',
    direccion:    mayorista.direccion    || '',
    telefono:     mayorista.telefono     || '',
    email:        mayorista.email        || '',
    condicionIVA: mayorista.condicionIVA || '',
  });
  const [saved, setSaved]             = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoPreview, setLogoPreview] = useState(() => localStorage.getItem('mayorista-logo') || '');
  const fileInputRef = useRef(null);

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await resizeImage(file);
    setLogoPreview(base64);
    localStorage.setItem('mayorista-logo', base64);
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    localStorage.removeItem('mayorista-logo');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = (e) => {
    e.preventDefault();
    setMayorista(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl">Ajustes</h1>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Datos del mayorista y sesión</p>
        </div>
      </header>

      {/* Datos del mayorista */}
      <form onSubmit={handleSave}>
        <div className="glass-panel p-4 mb-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Building2 size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>Datos del Mayorista</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              className="input-glass"
              placeholder="Nombre / Razón Social"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
            />
            <input
              className="input-glass"
              placeholder="CUIT (ej: 20-12345678-9)"
              value={form.cuit}
              onChange={e => setForm({ ...form, cuit: e.target.value })}
            />
            <select
              className="input-glass"
              value={form.condicionIVA}
              onChange={e => setForm({ ...form, condicionIVA: e.target.value })}
              style={{ appearance: 'none', WebkitAppearance: 'none' }}
            >
              <option value="">Condición IVA</option>
              {CONDICION_IVA.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="input-glass"
              placeholder="Dirección"
              value={form.direccion}
              onChange={e => setForm({ ...form, direccion: e.target.value })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input
                className="input-glass"
                placeholder="Teléfono"
                value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
              />
              <input
                className="input-glass"
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              marginTop: '1rem', width: '100%', padding: '0.85rem',
              borderRadius: '14px', border: 'none',
              background: saved
                ? 'hsl(150,80%,35%)'
                : 'linear-gradient(135deg, hsl(270,100%,55%), hsl(240,100%,60%))',
              color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              transition: 'background 0.3s'
            }}
          >
            <Save size={18} /> {saved ? '¡Guardado!' : 'Guardar datos'}
          </button>
        </div>
      </form>

      {/* Logo del mayorista */}
      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <ImagePlus size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>Logo del Mayorista</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Opcional — aparece en el membrete del PDF</p>
          </div>
        </div>

        {logoPreview ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              padding: '12px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-color)',
              maxWidth: '100%'
            }}>
              <img
                src={logoPreview}
                alt="Logo"
                style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain', borderRadius: '6px', display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', width: '100%' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface-glass)', color: 'var(--text-main)',
                  fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <ImagePlus size={16} /> Cambiar
              </button>
              <button
                onClick={handleRemoveLogo}
                style={{
                  padding: '0.65rem 1rem', borderRadius: '12px',
                  border: '1px solid hsla(0,80%,55%,0.4)',
                  background: 'hsla(0,80%,55%,0.1)', color: 'hsl(0,80%,65%)',
                  fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Trash2 size={16} /> Quitar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', padding: '1.5rem',
              borderRadius: '14px',
              border: '2px dashed var(--border-color)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
              color: 'var(--text-muted)', transition: 'border-color 0.2s'
            }}
          >
            <ImagePlus size={28} style={{ opacity: 0.5 }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Subir logo</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>JPG, PNG o SVG</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleLogoChange}
        />
      </div>

      {/* Cerrar sesión */}
      <div className="glass-panel p-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <User size={20} style={{ color: 'var(--text-muted)' }} />
          <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>Sesión</h2>
        </div>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          Cerrar sesión vuelve a la pantalla de inicio de la app.
        </p>

        {confirmLogout ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontWeight: 600, textAlign: 'center', marginBottom: '0.25rem' }}>¿Confirmar cerrar sesión?</p>
            <button
              onClick={onLogout}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: '14px', border: 'none',
                background: 'hsl(0,80%,55%)', color: '#fff',
                fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
              }}
            >
              Sí, cerrar sesión
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: '14px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface-glass)', color: 'var(--text-main)',
                fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            style={{
              width: '100%', padding: '0.85rem', borderRadius: '14px',
              border: '1px solid hsl(0,80%,55%)',
              background: 'hsla(0,80%,55%,0.1)', color: 'hsl(0,80%,65%)',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
            }}
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}
