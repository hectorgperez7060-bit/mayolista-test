import React, { useState } from 'react';
import { useStore } from '../store';
import { RotateCcw, Clock, Search, Table2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

function exportHistorialExcel(ordersHistory) {
  const headers = ['Cliente', 'Fecha', 'Hora', 'Pedido N°', 'Código', 'Producto', 'Cantidad', 'Precio Unit.', 'Subtotal', 'Total Pedido'];
  const grouped = {};
  ordersHistory.forEach(o => {
    const key = o.client?.name || 'Sin cliente';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(o);
  });
  const clientesOrdenados = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'es'));
  const rows = [headers];
  clientesOrdenados.forEach(clientName => {
    grouped[clientName].forEach(o => {
      const fecha = new Date(o.date);
      o.items.forEach(item => {
        rows.push([
          clientName,
          fecha.toLocaleDateString('es-AR'),
          fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          o.id,
          item.product?.code || '',
          item.product?.name || '',
          item.quantity,
          item.product?.price || 0,
          item.subtotal || 0,
          o.total,
        ]);
      });
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historial');
  XLSX.writeFile(wb, `Historial_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.xlsx`);
}

export default function HistoryScreen({ onNavigate, onBack }) {
  const ordersHistory    = useStore(state => state.ordersHistory || []);
  const repeatOrder      = useStore(state => state.repeatOrder);
  const deleteFromHistory = useStore(state => state.deleteFromHistory);
  const rol              = useStore(state => state.rol);
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filtered = search
    ? ordersHistory.filter(o => o.client?.name?.toLowerCase().includes(search.toLowerCase()))
    : ordersHistory;

  const grouped = {};
  filtered.forEach(o => {
    const key = o.client?.name || 'Sin cliente';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(o);
  });
  const clientesOrdenados = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'es'));

  const handleRepeat = (order) => {
    if (confirm('¿Reemplazar el pedido actual con los ítems de este pedido?')) {
      repeatOrder(order);
      onNavigate('order');
    }
  };

  const handleDelete = (orderId) => {
    deleteFromHistory(orderId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.88rem', fontWeight: 600,
            padding: '0 0 0.4rem 0'
          }}>← Atrás</button>
          <h1 className="text-xl">Historial de Pedidos</h1>
          <p className="text-muted">{ordersHistory.length} pedido{ordersHistory.length !== 1 ? 's' : ''} guardado{ordersHistory.length !== 1 ? 's' : ''}</p>
        </div>
        {ordersHistory.length > 0 && (
          <button
            onClick={() => exportHistorialExcel(ordersHistory)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0.5rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(22,163,74,0.4)',
              background: 'rgba(22,163,74,0.1)', color: '#4ade80',
              fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0
            }}
          >
            <Table2 size={15} /> Excel
          </button>
        )}
      </header>

      {ordersHistory.length === 0 ? (
        <div className="flex-center flex-col p-10 text-muted text-center glass-panel">
          <Clock size={48} className="mb-4 opacity-50" />
          <p>Aún no hay pedidos confirmados en el historial.</p>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <div style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Filtrar por cliente..."
              className="input-glass"
              style={{ paddingLeft: '2.75rem', width: '100%' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {clientesOrdenados.map(clientName => (
            <div key={clientName} style={{ marginBottom: '1.5rem' }}>
              <div style={{
                padding: '0.4rem 0.75rem', marginBottom: '0.5rem',
                background: 'hsla(270,100%,55%,0.12)',
                borderLeft: '3px solid var(--primary)',
                borderRadius: '0 8px 8px 0',
              }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>{clientName}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                  {grouped[clientName].length} pedido{grouped[clientName].length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {grouped[clientName].map(order => (
                  <div key={order.id} className="glass-panel p-4">
                    <div className="flex-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                        <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>
                          {new Date(order.date).toLocaleDateString('es-AR')} · {new Date(order.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · #{order.id.slice(-6)}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.1rem', display: 'block' }}>
                            ${order.total.toLocaleString('es-AR')}
                          </span>
                          <span className="text-muted" style={{ fontSize: '0.8rem', display: 'block' }}>
                            {order.items.reduce((acc, i) => acc + i.quantity, 0)} ítems
                          </span>
                        </div>
                        {(confirmDeleteId === order.id ? (
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button onClick={() => handleDelete(order.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '8px', border: 'none', background: 'hsl(0,80%,55%)', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Borrar</button>
                              <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '0.3rem 0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(order.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}>
                              <Trash2 size={15} />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: '0.75rem' }}>
                      <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex-between" style={{ marginBottom: '0.2rem' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>
                              {item.quantity}x {item.product.name}
                            </span>
                            <span style={{ flexShrink: 0 }}>
                              ${(item.subtotal || item.product.price * item.quantity).toLocaleString('es-AR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      className="btn btn-primary w-full flex-center gap-2"
                      onClick={() => handleRepeat(order)}
                    >
                      <RotateCcw size={16} /> Repetir Pedido
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {clientesOrdenados.length === 0 && (
            <p className="text-center text-muted p-4">No hay pedidos para ese cliente.</p>
          )}
        </>
      )}
    </div>
  );
}
