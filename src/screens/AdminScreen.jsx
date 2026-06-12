import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Plus, Search, ChevronLeft, Upload, Sparkles, CheckCircle, XCircle, Loader, Trash2 } from 'lucide-react';
import ImportCatalog from '../components/ImportCatalog';
import { searchProducts } from '../utils/search';
import { isAIEnabled, testAIConnection } from '../services/gemini';

export default function AdminScreen({ onNavigate }) {
  const products = useStore(state => state.products);
  const addProduct = useStore(state => state.addProduct);
  const clearProducts = useStore(state => state.clearProducts);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [form, setForm] = useState({ code: '', name: '', price: '', brand: '', presentation: '', weight: '', description: '' });

  const filtered = useMemo(() => searchProducts(products, search), [search, products]);
  const aiEnabled = isAIEnabled();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.code) return alert("Código, Nombre y Precio son obligatorios");
    addProduct({ ...form, price: Number(form.price), synonyms: [], category: 'General' });
    setShowForm(false);
    setForm({ code: '', name: '', price: '', brand: '', presentation: '', weight: '', description: '' });
  };

  const handleTestAI = async () => {
    setTestingAI(true);
    setTestResult(null);
    try {
      await testAIConnection();
      setTestResult('ok');
    } catch {
      setTestResult('error');
    } finally {
      setTestingAI(false);
    }
  };

  return (
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn" style={{ padding: '0.5rem' }} onClick={() => onNavigate('home')}>
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl">Administración</h1>
          <p className="text-muted">{products.length} artículos en catálogo</p>
        </div>
      </header>

      {/* Sección IA */}
      <div className="glass-panel p-4 mb-4">
        <div className="flex-between mb-2">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: 'hsl(270,100%,70%)' }} />
            <h2 className="font-semibold" style={{ marginBottom: 0 }}>Inteligencia Artificial</h2>
          </div>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.65rem',
            borderRadius: '999px',
            background: aiEnabled ? 'hsl(150,100%,40%,0.12)' : 'hsl(0,0%,50%,0.12)',
            color: aiEnabled ? 'hsl(150,100%,50%)' : 'var(--text-muted)',
            border: `1px solid ${aiEnabled ? 'hsl(150,100%,40%,0.3)' : 'var(--border-color)'}`
          }}>
            {aiEnabled ? 'Activa' : 'Desactivada'}
          </span>
        </div>

        <p className="text-sm text-muted mb-3">
          Con la IA activada, el sistema entiende frases como "azucar chango 500g 77 unidades", "poneme doce harinas tres ceros", o cualquier forma de hablar en español.
        </p>

        {aiEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="btn text-sm flex-center gap-2"
              onClick={handleTestAI}
              disabled={testingAI}
              style={{ padding: '0.5rem 1rem' }}
            >
              {testingAI
                ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Probando...</>
                : '✏️ Probar conexión'}
            </button>
            {testResult === 'ok' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'hsl(150,100%,50%)', fontSize: '0.85rem' }}>
                <CheckCircle size={16} /> Conexión OK
              </span>
            )}
            {testResult === 'error' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--danger)', fontSize: '0.85rem' }}>
                <XCircle size={16} /> Error de conexión
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted" style={{ fontFamily: 'monospace', background: 'var(--bg-surface)', padding: '0.5rem', borderRadius: '6px' }}>
            Configurar VITE_GEMINI_KEY en el entorno para activar.
          </p>
        )}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="glass-panel p-4 mb-4 animate-slide-up">
          <h2 className="text-lg mb-4 text-primary">Nuevo Producto</h2>
          <div className="flex flex-col gap-3">
            <input className="input-glass" placeholder="Código (ej. P009)" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required />
            <input className="input-glass" placeholder="Nombre completo" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            <input className="input-glass" type="number" placeholder="Precio ($)" value={form.price} onChange={e => setForm({...form, price: e.target.value})} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input-glass" placeholder="Marca" value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} />
              <input className="input-glass" placeholder="Peso/Vol (1kg)" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn w-full" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary w-full">Guardar</button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="mb-4 relative" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: '1rem', left: '1rem', color: 'var(--text-muted)' }}><Search size={20} /></div>
            <input type="text" placeholder="Buscar por código o nombre..." className="input-glass" style={{ paddingLeft: '3rem' }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button className="btn btn-primary flex-1 flex-center gap-2" onClick={() => { setShowForm(true); setShowImport(false); setConfirmClear(false); }}>
              <Plus size={20} /> Nuevo
            </button>
            <button className="btn flex-1 flex-center gap-2" onClick={() => { setShowImport(v => !v); setShowForm(false); setConfirmClear(false); }}>
              <Upload size={20} /> Importar
            </button>
            {products.length > 0 && (
              <button
                className="btn flex-center gap-1"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '0 0.85rem' }}
                onClick={() => { setConfirmClear(v => !v); setShowImport(false); setShowForm(false); }}
                title="Borrar catálogo"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          {confirmClear && (
            <div className="glass-panel p-4 mb-4 animate-slide-up" style={{ borderColor: 'var(--danger)' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>¿Borrar todo el catálogo?</p>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Se eliminarán los <strong style={{ color: 'var(--danger)' }}>{products.length} productos</strong> cargados. El pedido actual no se modifica.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn w-full" onClick={() => setConfirmClear(false)}>Cancelar</button>
                <button
                  className="btn w-full flex-center gap-2"
                  style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                  onClick={() => { clearProducts(); setConfirmClear(false); }}
                >
                  <Trash2 size={16} /> Borrar todo
                </button>
              </div>
            </div>
          )}

          {showImport && <ImportCatalog onClose={() => setShowImport(false)} />}

          <div className="flex flex-col gap-3">
            {filtered.map(product => (
              <div key={product.id} className="glass-panel p-3 flex-between">
                <div>
                  <h3 className="font-semibold">{product.name}</h3>
                  <p className="text-sm text-muted">{product.code} | {product.brand}</p>
                </div>
                <div className="font-bold text-primary text-lg">${product.price.toLocaleString('es-AR')}</div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-muted p-4">No se encontraron productos.</p>}
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
