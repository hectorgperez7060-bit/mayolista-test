import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Search, Plus, Minus, ShoppingCart } from 'lucide-react';

export default function OrderScreen({ onNavigate }) {
  const products = useStore(state => state.products);
  const { client, items, total } = useStore(state => state.currentOrder);
  const addItem = useStore(state => state.addItem);
  const [search, setSearch] = useState('');

  // Smart search with relevance matching, limits to 10 max
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products.slice(0, 10);
    const searchTerms = search.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(' ')
      .filter(w => w && !['de','del','la','el','los','las','y','o','en','con','para'].includes(w));
    
    return products
      .map(p => {
        const descText = `${p.name} ${p.description || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const codeText = String(p.code).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let matchesCount = 0;
        let score = 0;
        searchTerms.forEach(term => {
          let matched = false;
          if (descText.includes(term)) { 
            score += 3; 
            matched = true; 
            if (new RegExp(`\\b${term}`).test(descText)) {
              score += 2;
            }
          }
          if (codeText.includes(term)) { 
            score += 1; 
            matched = true; 
          }
          if (matched) matchesCount++;
        });
        const finalScore = (matchesCount * 100) + score;
        return { product: p, finalScore, matchesCount };
      })
      .filter(item => item.matchesCount > 0) // Allow OR match but filter items with 0 score
      .sort((a, b) => b.finalScore - a.finalScore)
      .map(item => item.product)
      .slice(0, 10);
  }, [search, products]);

  const getItemQty = (productId) => {
    const item = items.find(i => i.product.id === productId);
    return item ? item.quantity : 0;
  };

  if (!client) {
    return (
      <div className="p-4 flex-center flex-col mt-10" style={{ minHeight: '60vh' }}>
        <h2 className="text-xl mb-4 text-center">No hay cliente seleccionado</h2>
        <button className="btn btn-primary" onClick={() => onNavigate('clients')}>
          Seleccionar Cliente
        </button>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ paddingBottom: total > 0 ? '5rem' : '1rem' }}>
      <header className="mb-4">
        <h1 className="text-xl">Armar Pedido</h1>
        <p className="text-muted">Cliente: <strong className="text-primary">{client.name}</strong></p>
      </header>

      <div className="mb-4 relative" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', color: 'var(--text-muted)' }}>
          <Search size={20} />
        </div>
        <input 
          type="text" 
          placeholder="Buscar producto, código, marca..." 
          className="input-glass"
          style={{ paddingLeft: '3rem' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {filteredProducts.map(product => {
          const qty = getItemQty(product.id);
          return (
            <div key={product.id} className="glass-panel p-3">
              <div className="flex-between mb-2">
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', lineHeight: 1.2 }}>{product.name}</h3>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>{product.code} | {product.brand} | {product.presentation} {product.weight}</p>
                </div>
                <div className="text-xl text-primary font-bold">
                  ${product.price}
                </div>
              </div>
              
              <div className="flex-between mt-2">
                <span className="text-muted text-sm" style={{ fontWeight: '500' }}>
                  {qty > 0 ? `Subtotal: $${(product.price * qty).toLocaleString('es-AR')}` : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: 'var(--border-radius-sm)' }}>
                  <button 
                    onClick={() => addItem(product, -1)}
                    style={{ background: 'transparent', border: 'none', color: qty > 0 ? 'var(--text-main)' : 'var(--text-muted)', padding: '0.5rem', cursor: qty > 0 ? 'pointer' : 'default' }}
                    disabled={qty === 0}
                  >
                    <Minus size={20} />
                  </button>
                  <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 'bold' }}>{qty}</span>
                  <button 
                    onClick={() => addItem(product, 1)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', padding: '0.5rem', cursor: 'pointer' }}
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredProducts.length === 0 && (
          <p className="text-center text-muted p-4">No hay resultados para "{search}".</p>
        )}
      </div>

      {total > 0 && (
        <div style={{ position: 'fixed', bottom: '5.5rem', left: '1rem', right: '1rem', zIndex: 40, maxWidth: '568px', margin: '0 auto' }}>
          <button className="btn btn-primary w-full flex-between" style={{ padding: '1rem' }} onClick={() => onNavigate('summary')}>
            <span className="flex-center gap-2"><ShoppingCart size={20} /> Ver Resumen</span>
            <span className="font-bold text-xl">${total.toLocaleString('es-AR')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
