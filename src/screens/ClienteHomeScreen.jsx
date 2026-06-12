import { useState, useEffect } from 'react';
import { Tag, ShoppingCart, History, ChevronDown, ChevronUp, Plus, Ticket, Check, AlertCircle, X } from 'lucide-react';
import { useStore } from '../store';
import { validateCodigoDescuento, markCodigoUsado } from '../services/firebase';

function fmtMoney(n) {
  return (n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function OfertaBadge({ oferta }) {
  if (oferta.condicionTipo === 'percent_qty') {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
        background: 'hsla(35,100%,50%,0.18)', color: 'hsl(35,100%,60%)',
        border: '1px solid hsla(35,100%,50%,0.35)'
      }}>
        {oferta.condicionValor}% dto. comprando {oferta.condicionCantidad}+
      </span>
    );
  }
  if (oferta.condicionTipo === 'bonus_qty') {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
        background: 'hsla(150,80%,40%,0.18)', color: 'hsl(150,80%,55%)',
        border: '1px solid hsla(150,80%,40%,0.35)'
      }}>
        Comprando {oferta.condicionCantidad}, {oferta.condicionValor} de regalo
      </span>
    );
  }
  return null;
}

export default function ClienteHomeScreen({ onNavigate }) {
  const [ofertasOpen, setOfertasOpen] = useState(true);
  const [codigoInput, setCodigoInput] = useState('');
  const [codigoLoading, setCodigoLoading] = useState(false);
  const [codigoError, setCodigoError] = useState('');
  const [codigoOk, setCodigoOk] = useState(false);
  const [cantidades, setCantidades] = useState({});
  const [agregados, setAgregados] = useState({});

  const clienteInfo        = useStore(s => s.clienteInfo);
  const ofertas            = useStore(s => s.ofertas);
  const empresaId          = useStore(s => s.empresaId);
  const currentOrder       = useStore(s => s.currentOrder);
  const addItem            = useStore(s => s.addItem);
  const setClient          = useStore(s => s.setClient);
  const setItemDiscount    = useStore(s => s.setItemDiscount);
  const codigoDescuentoAplicado = useStore(s => s.codigoDescuentoAplicado);
  const setCodigoDescuentoAplicado = useStore(s => s.setCodigoDescuentoAplicado);

  const itemsCount = currentOrder.items.reduce((acc, i) => acc + i.quantity, 0);

  useEffect(() => {
    if (clienteInfo && (!currentOrder.client || currentOrder.client.id !== clienteInfo.id)) {
      setClient(clienteInfo);
    }
  }, [clienteInfo?.id]);

  const handleAddOferta = (oferta) => {
    const qty = parseInt(cantidades[oferta.id]) || 0;
    if (!qty || qty <= 0) return;
    const product = {
      id: oferta.productId,
      code: oferta.productCode || '',
      name: oferta.productName,
      price: oferta.productPrice || 0
    };
    addItem(product, qty);
    // Aplicar descuento si cumple la cantidad mínima
    if (qty >= oferta.condicionCantidad) {
      if (oferta.condicionTipo === 'percent_qty') {
        setItemDiscount(product.id, 'percent', oferta.condicionValor);
      } else if (oferta.condicionTipo === 'bonus_qty') {
        setItemDiscount(product.id, 'bonus', oferta.condicionValor, oferta.condicionCantidad);
      }
    }
    setAgregados(a => ({ ...a, [oferta.id]: true }));
    setTimeout(() => setAgregados(a => ({ ...a, [oferta.id]: false })), 2000);
    setCantidades(c => ({ ...c, [oferta.id]: '' }));
  };

  const getOfertaStatus = (oferta) => {
    const qty = parseInt(cantidades[oferta.id]) || 0;
    if (!qty) return null;
    if (qty >= oferta.condicionCantidad) return 'ok';
    return 'falta';
  };

  const handleAplicarCodigo = async () => {
    if (!codigoInput.trim()) return;
    setCodigoLoading(true); setCodigoError(''); setCodigoOk(false);
    try {
      const result = await validateCodigoDescuento(empresaId, codigoInput.trim(), clienteInfo?.id);
      await markCodigoUsado(empresaId, result.docId, clienteInfo?.id);
      setCodigoDescuentoAplicado({ codigo: result.codigo, porcentaje: result.porcentaje, docId: result.docId });
      setCodigoOk(true);
      setCodigoInput('');
    } catch (e) {
      setCodigoError(e.message);
    }
    setCodigoLoading(false);
  };

  const nombre = clienteInfo?.name || 'Cliente';

  return (
    <div className="p-4" style={{ paddingBottom: '6rem' }}>
      {/* Bienvenida */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Hola, {nombre.split(' ')[0]}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          {clienteInfo?.codigoCliente && <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{clienteInfo.codigoCliente}</span>}
        </p>
      </div>

      {/* Acciones rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button onClick={() => onNavigate('order')} style={{
          padding: '1.1rem', borderRadius: '16px', border: '2px solid hsl(270,100%,60%)',
          background: 'hsla(270,100%,55%,0.15)', cursor: 'pointer', textAlign: 'left'
        }}>
          <ShoppingCart size={26} style={{ color: 'hsl(270,100%,70%)', marginBottom: '0.5rem' }} />
          <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>Nuevo pedido</p>
          <p style={{ fontSize: '0.75rem', color: 'hsl(270,60%,70%)' }}>Buscar productos</p>
        </button>
        <button onClick={() => onNavigate('history')} style={{
          padding: '1.1rem', borderRadius: '16px', border: '2px solid hsla(0,0%,100%,0.15)',
          background: 'hsla(0,0%,100%,0.07)', cursor: 'pointer', textAlign: 'left'
        }}>
          <History size={26} style={{ color: 'hsl(0,0%,75%)', marginBottom: '0.5rem' }} />
          <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>Mis pedidos</p>
          <p style={{ fontSize: '0.75rem', color: 'hsl(0,0%,60%)' }}>Historial</p>
        </button>
      </div>

      {/* Carrito actual */}
      {itemsCount > 0 && (
        <button onClick={() => onNavigate('summary')} style={{
          width: '100%', padding: '1rem', borderRadius: '16px', marginBottom: '1.5rem',
          border: 'none', background: 'linear-gradient(135deg, hsl(270,100%,50%), hsl(240,100%,58%))',
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShoppingCart size={20} />
            <span style={{ fontWeight: 700 }}>Ver pedido actual</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>{itemsCount} items — ${fmtMoney(currentOrder.total)}</span>
        </button>
      )}

      {/* Código de descuento */}
      <div style={{ marginBottom: '1.5rem', borderRadius: '16px', border: '1px solid hsla(35,100%,50%,0.3)', background: 'hsla(35,100%,50%,0.07)', padding: '1rem' }}>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Ticket size={16} style={{ color: 'hsl(35,100%,55%)' }} /> Código de descuento
        </p>
        {codigoDescuentoAplicado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 0.75rem', background: 'hsla(150,80%,40%,0.12)', borderRadius: '10px', border: '1px solid hsla(150,80%,40%,0.3)' }}>
            <Check size={16} style={{ color: 'hsl(150,80%,55%)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.85rem', color: 'hsl(150,80%,60%)', fontWeight: 600, flex: 1 }}>
              Descuento {codigoDescuentoAplicado.porcentaje}% aplicado al pedido
            </p>
            <button onClick={() => setCodigoDescuentoAplicado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(150,80%,55%)', padding: '0.1rem', lineHeight: 1, flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input-glass"
              placeholder="Ingresá tu código (ej: DCTO-AB12)"
              value={codigoInput}
              onChange={e => { setCodigoInput(e.target.value.toUpperCase()); setCodigoError(''); setCodigoOk(false); }}
              style={{ flex: 1, fontSize: '0.9rem', padding: '0.6rem 0.75rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}
            />
            <button onClick={handleAplicarCodigo} disabled={codigoLoading || !codigoInput.trim()} style={{
              padding: '0.6rem 1rem', borderRadius: '10px', border: 'none', fontWeight: 700, fontSize: '0.85rem',
              background: 'hsl(35,100%,50%)', color: '#fff', cursor: 'pointer', opacity: codigoLoading ? 0.7 : 1
            }}>
              {codigoLoading ? '...' : 'Aplicar'}
            </button>
          </div>
        )}
        {codigoError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{codigoError}</p>
          </div>
        )}
      </div>

      {/* Ofertas del día */}
      <div style={{ overflow: 'hidden', borderRadius: '16px', border: '1px solid hsla(35,100%,50%,0.25)', background: 'hsla(25,60%,12%,0.6)' }}>
        <button
          onClick={() => setOfertasOpen(v => !v)}
          style={{ width: '100%', padding: '1rem', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={18} style={{ color: 'hsl(35,100%,60%)' }} />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Ofertas del día</span>
            {ofertas.length > 0 && (
              <span style={{ background: 'hsl(35,100%,50%)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '1px 7px', borderRadius: '999px' }}>
                {ofertas.length}
              </span>
            )}
          </div>
          {ofertasOpen ? <ChevronUp size={18} style={{ color: 'hsl(35,100%,60%)' }} /> : <ChevronDown size={18} style={{ color: 'hsl(35,100%,60%)' }} />}
        </button>

        {ofertasOpen && (
          <div style={{ borderTop: '1px solid hsla(35,100%,50%,0.2)', padding: '0.75rem' }}>
            {ofertas.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', padding: '1rem 0' }}>
                No hay ofertas activas por el momento.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {ofertas.map(oferta => {
                  const status = getOfertaStatus(oferta);
                  const agregado = agregados[oferta.id];
                  return (
                  <div key={oferta.id} style={{
                    padding: '0.85rem', background: 'hsla(270,60%,18%,0.6)',
                    borderRadius: '14px', border: '1px solid hsla(270,60%,55%,0.25)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.65rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {oferta.productCode && (
                          <span style={{ fontSize: '0.7rem', color: 'hsl(270,60%,70%)', fontFamily: 'monospace', fontWeight: 600 }}>{oferta.productCode}</span>
                        )}
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{oferta.productName}</p>
                        <p style={{ fontSize: '0.82rem', color: 'hsl(270,40%,75%)', marginTop: '2px' }}>${fmtMoney(oferta.productPrice)} c/u</p>
                        <div style={{ marginTop: '6px' }}><OfertaBadge oferta={oferta} /></div>
                      </div>
                    </div>

                    {/* Cantidad + aviso + botón */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Cantidad"
                        value={cantidades[oferta.id] || ''}
                        onFocus={e => e.target.select()}
                        onChange={e => setCantidades(c => ({ ...c, [oferta.id]: e.target.value }))}
                        style={{
                          flex: 1, padding: '0.55rem 0.75rem', borderRadius: '10px',
                          border: status === 'ok' ? '1.5px solid hsl(150,70%,45%)' : status === 'falta' ? '1.5px solid hsl(35,100%,55%)' : '1.5px solid hsla(270,60%,55%,0.4)',
                          background: 'hsla(0,0%,0%,0.3)', color: '#fff', fontSize: '1rem', fontWeight: 700,
                          outline: 'none', textAlign: 'center'
                        }}
                      />
                      <button onClick={() => handleAddOferta(oferta)}
                        disabled={!cantidades[oferta.id] || parseInt(cantidades[oferta.id]) <= 0}
                        style={{
                          padding: '0.55rem 1rem', borderRadius: '10px', border: 'none', fontWeight: 700,
                          fontSize: '0.88rem', cursor: 'pointer', flexShrink: 0,
                          background: agregado ? 'hsl(150,70%,40%)' : 'hsl(35,100%,50%)',
                          color: '#fff', opacity: (!cantidades[oferta.id] || parseInt(cantidades[oferta.id]) <= 0) ? 0.5 : 1,
                          transition: 'background 0.3s'
                        }}>
                        {agregado ? '✓ Agregado' : 'Agregar'}
                      </button>
                    </div>

                    {status === 'ok' && (
                      <p style={{ fontSize: '0.78rem', color: 'hsl(150,70%,55%)', marginTop: '0.4rem', fontWeight: 600 }}>
                        ✓ Descuento activado
                      </p>
                    )}
                    {status === 'falta' && (
                      <p style={{ fontSize: '0.78rem', color: 'hsl(35,100%,60%)', marginTop: '0.4rem', fontWeight: 600 }}>
                        Necesitás {oferta.condicionCantidad - parseInt(cantidades[oferta.id])} más para activar el descuento
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
