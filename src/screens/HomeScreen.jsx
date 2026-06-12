import { useStore } from '../store';
import { UserPlus, Users, Tag, ClipboardList, ChevronRight } from 'lucide-react';

const ALL_ACTIONS = [
  {
    icon: UserPlus,
    label: 'Darme de alta como distribuidor',
    sub: 'Completá tus datos de mayorista',
    screen: 'settings',
    color: '#6d28d9',
    bg: 'rgba(109,40,217,0.15)',
    border: 'rgba(109,40,217,0.3)',
    adminOnly: true,
  },
  {
    icon: Users,
    label: 'Dar de alta un cliente',
    sub: 'Agregá un nuevo cliente a tu lista',
    screen: 'clients',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.15)',
    border: 'rgba(37,99,235,0.3)',
    adminOnly: false,
  },
  {
    icon: Tag,
    label: 'Cargar lista de precios',
    sub: 'Importá o cargá tu catálogo',
    screen: 'admin',
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.15)',
    border: 'rgba(8,145,178,0.3)',
    adminOnly: true,
  },
  {
    icon: ClipboardList,
    label: 'Historial de pedidos',
    sub: 'Ver todos los pedidos anteriores',
    screen: 'history',
    color: '#059669',
    bg: 'rgba(5,150,105,0.15)',
    border: 'rgba(5,150,105,0.3)',
    adminOnly: false,
  },
];

export default function HomeScreen({ onNavigate }) {
  const rol = useStore(state => state.rol);
  const isAdmin = rol === 'admin';
  const ACTIONS = ALL_ACTIONS.filter(a => !a.adminOnly || isAdmin);

  return (
    <div className="p-4">
      <header className="mb-6 mt-2">
        <h1 className="text-2xl text-primary">App Mayorista</h1>
      </header>

      {/* Acciones principales */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ACTIONS.map(({ icon: Icon, label, sub, screen, color, bg, border }) => (
          <button
            key={screen}
            onClick={() => onNavigate(screen)}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              width: '100%', padding: '1rem 1rem 1rem 1rem',
              background: 'var(--bg-surface-glass)',
              border: `1px solid var(--border-color)`,
              borderRadius: '14px', cursor: 'pointer',
              color: 'var(--text-main)', textAlign: 'left',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = border; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface-glass)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
          >
            {/* Icono */}
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: bg, border: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Icon size={22} style={{ color }} />
            </div>

            {/* Texto */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.3 }}>{label}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '2px' }}>{sub}</p>
            </div>

            {/* Flecha */}
            <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
