import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Check, RefreshCw, Loader } from 'lucide-react';
import { useStore } from '../store';
import { searchProducts } from '../utils/search';
import { isAIEnabled, matchProductWithAI } from '../services/gemini';

async function lookupBarcode(code, products) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
  const data = await res.json();

  if (data.status !== 1) return { externalName: null, matches: [], selectedIdx: 0 };

  const p = data.product;
  const externalName = [
    p.product_name_es || p.product_name,
    p.brands
  ].filter(Boolean).join(' ');

  if (!externalName.trim()) return { externalName: null, matches: [], selectedIdx: 0 };

  // Get top candidates using text search on the real product name
  const candidates = searchProducts(products, externalName).slice(0, 15);

  // Use Gemini to pick the semantically closest match
  let selectedIdx = 0;
  if (isAIEnabled() && candidates.length > 1) {
    selectedIdx = await matchProductWithAI(externalName, candidates);
  }

  return { externalName, matches: candidates, selectedIdx };
}

export default function BarcodeScanner({ onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [found, setFound] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [looking, setLooking] = useState(false);
  const products = useStore(state => state.products);
  const addItem = useStore(state => state.addItem);
  const setMetodoEntrada = useStore(state => state.setMetodoEntrada);

  const startScanning = () => {
    setCameraError(null);
    setFound(null);
    setLooking(false);
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        async (result) => {
          if (!result) return;
          try { reader.reset(); } catch {}
          const code = result.getText();
          setLooking(true);
          try {
            const { externalName, matches, selectedIdx } = await lookupBarcode(code, products);
            setFound({ code, externalName, matches, selectedIdx, qty: '' });
          } catch {
            setFound({ code, externalName: null, matches: [], selectedIdx: 0, qty: '' });
          } finally {
            setLooking(false);
          }
        }
      )
      .catch(() => setCameraError('No se pudo acceder a la cámara. Verificá los permisos.'));
  };

  useEffect(() => {
    startScanning();
    return () => { try { readerRef.current?.reset(); } catch {} };
  }, []);

  const handleConfirm = () => {
    const qty = parseInt(found.qty) || 1;
    addItem(found.matches[found.selectedIdx], qty);
    setMetodoEntrada('escaner');
    onClose();
  };

  const handleRescan = () => startScanning();

  const selected = found?.matches?.[found.selectedIdx];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      maxWidth: '600px', margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.9rem 1rem',
        background: 'rgba(0,0,0,0.55)'
      }}>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Escanear código</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.25rem' }}>
          <X size={24} />
        </button>
      </div>

      {/* Camera feed */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        autoPlay playsInline muted
      />

      {/* Viewfinder — only while actively scanning */}
      {!found && !cameraError && !looking && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: '260px', height: '140px',
            border: '2px solid hsl(270,100%,65%)',
            borderRadius: '10px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)'
          }} />
          <p style={{ marginTop: '14px', color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', fontWeight: 500 }}>
            Apuntá al código de barras
          </p>
        </div>
      )}

      {/* Looking up product */}
      {looking && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', gap: '1rem'
        }}>
          <Loader size={36} color="hsl(270,100%,65%)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#fff', fontSize: '0.95rem' }}>Buscando producto...</p>
        </div>
      )}

      {/* Camera error */}
      {cameraError && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', padding: '2rem', textAlign: 'center', gap: '1rem'
        }}>
          <p style={{ color: '#fff', fontSize: '0.95rem' }}>{cameraError}</p>
          <button className="btn btn-primary" onClick={startScanning}>Reintentar</button>
        </div>
      )}

      {/* Result panel */}
      {found && !looking && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'var(--bg-surface)',
          borderRadius: '20px 20px 0 0',
          padding: '1.25rem 1.25rem 2rem',
          maxHeight: '65vh', overflowY: 'auto'
        }}>
          {/* External product name badge */}
          {found.externalName && (
            <div style={{
              marginBottom: '0.75rem', padding: '0.4rem 0.75rem',
              background: 'hsl(270,100%,55%,0.12)', border: '1px solid hsl(270,100%,55%,0.3)',
              borderRadius: '8px', fontSize: '0.78rem', color: 'hsl(270,100%,75%)'
            }}>
              Producto escaneado: <strong>{found.externalName}</strong>
            </div>
          )}

          {found.matches.length === 0 ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', marginBottom: '0.5rem', fontWeight: 600 }}>
                Producto no encontrado en tu catálogo
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                {found.externalName
                  ? `"${found.externalName}" no tiene coincidencia en tu lista de precios.`
                  : 'Este código no está en la base de datos global de productos.'}
              </p>
              <button className="btn w-full flex-center gap-2" onClick={handleRescan}>
                <RefreshCw size={16} /> Escanear otro
              </button>
            </div>
          ) : (
            <>
              {/* Matched product card */}
              <div className="p-3 mb-3" style={{
                background: 'var(--bg-surface-glass)',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border-color)'
              }}>
                <div className="flex-between gap-2">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-semibold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selected.name}
                    </p>
                    <p className="text-xs text-muted">{selected.brand} {selected.presentation} {selected.weight}</p>
                    <p className="text-sm font-bold text-primary mt-1">${selected.price}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="text-xs text-muted">Cant:</span>
                      <input
                        type="number" min="1"
                        value={found.qty}
                        onChange={e => setFound(f => ({ ...f, qty: e.target.value }))}
                        placeholder="1"
                        className="input-glass text-center"
                        style={{ width: '60px', padding: '0.2rem', fontSize: '0.9rem' }}
                        autoFocus
                      />
                    </div>
                    <div className="font-bold">${(selected.price * (parseInt(found.qty) || 1)).toLocaleString('es-AR')}</div>
                  </div>
                </div>
              </div>

              {/* Other candidates */}
              {found.matches.length > 1 && (
                <div className="mb-3" style={{
                  maxHeight: '110px', overflowY: 'auto',
                  border: '1px solid var(--border-color)', borderRadius: '8px'
                }}>
                  <p className="text-xs text-muted" style={{ padding: '0.5rem 0.75rem' }}>
                    No es el correcto? Elegí otro:
                  </p>
                  {found.matches.map((m, i) => (
                    <div
                      key={m.id}
                      onClick={() => setFound(f => ({ ...f, selectedIdx: i }))}
                      style={{
                        padding: '0.5rem 0.75rem',
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '0.85rem', cursor: 'pointer',
                        background: i === found.selectedIdx ? 'var(--bg-surface)' : 'transparent',
                        color: i === found.selectedIdx ? 'var(--primary)' : 'inherit'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {m.name} {m.brand} {m.weight}
                      </span>
                      <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>${m.price}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button className="btn flex-1 flex-center gap-1" onClick={handleRescan}>
                  <RefreshCw size={16} /> Otro
                </button>
                <button className="btn btn-primary flex-1 flex-center gap-1" onClick={handleConfirm}>
                  <Check size={16} /> Agregar {(parseInt(found.qty) || 1) > 1 ? (parseInt(found.qty) || 1) : ''}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
