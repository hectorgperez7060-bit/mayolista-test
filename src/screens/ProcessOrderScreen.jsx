import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Mic, MicOff, Play, Check, X, ChevronDown, ShoppingCart, Loader, ScanLine } from 'lucide-react';
import { searchProducts } from '../utils/search';
import { isAIEnabled, parseOrderWithAI } from '../services/gemini';
import BarcodeScanner from '../components/BarcodeScanner';

const SIZES = ['100','200','250','300','400','500','600','700','750','800','900','1','1.5','2','2.25','2.5','3'];
const STOP_WORDS = ['de','del','la','el','los','las','y','o','en','con','para','unidades','u','un','paquetes','paquete','caja','cajas','poneme','dame','quiero','necesito','agregar','agregame','mandame'];

function parseWithRegex(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    let qty = 1;
    let term = line.trim();
    let extracted = false;

    const matchEndExplicit = term.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(unidad|unidades|unid|uni|u|un\.|paquetes|paquete|cajas|caja)$/i);
    const matchLastNumber = term.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/i);
    const matchStart = term.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);

    if (matchEndExplicit) {
      qty = parseFloat(matchEndExplicit[2].replace(',', '.'));
      term = matchEndExplicit[1];
      extracted = true;
    }

    if (!extracted && matchLastNumber) {
      const isSize = SIZES.includes(matchLastNumber[2]);
      const hasPresentationBefore = /\d+(?:[.,]\d+)?\s*(g|gr|kg|ml|lt|l|cc|k)\b/i.test(matchLastNumber[1]);
      if (hasPresentationBefore || !isSize) {
        qty = parseFloat(matchLastNumber[2].replace(',', '.'));
        term = matchLastNumber[1];
        extracted = true;
      }
    }

    if (!extracted && matchStart && !SIZES.includes(matchStart[1])) {
      qty = parseFloat(matchStart[1].replace(',', '.'));
      term = matchStart[2];
    }

    term = term.replace(/\s+(unidad|unidades|unid|uni|u|un\.|paquetes|paquete|cajas|caja)$/i, '').trim();

    return { raw: line, qty, term };
  });
}

function buildParsedLines(linesToProcess, products) {
  return linesToProcess.map(({ raw, qty, term }, idx) => {
    const matches = searchProducts(products, term).slice(0, 10);
    const termWords = term.toLowerCase().split(' ').filter(w => w && !STOP_WORDS.includes(w));

    let status = 'error';
    if (matches.length > 0) {
      status = matches[0].matchesCount >= termWords.length ? 'success' : 'warning';
    }

    return {
      id: Date.now() + idx,
      raw,
      qty,
      term,
      matches,
      status,
      selectedMatchIdx: 0,
      showOptions: false
    };
  });
}

export default function ProcessOrderScreen({ onNavigate, onBack }) {
  const products = useStore(state => state.products);
  const { client, total } = useStore(state => state.currentOrder);
  const addItem = useStore(state => state.addItem);
  const setMetodoEntrada = useStore(state => state.setMetodoEntrada);

  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [parsedLines, setParsedLines] = useState([]);
  const [notFound, setNotFound] = useState([]);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const recognitionRef = useRef(null);
  const aiEnabled = isAIEnabled();

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setHasSpeechSupport(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map(r => r[0].transcript)
        .join('\n');
      setText(prev => prev ? prev + '\n' + transcript : transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const processText = async () => {
    if (!text.trim()) return;

    let linesToProcess = [];

    if (aiEnabled) {
      setIsProcessingAI(true);
      try {
        const aiResult = await parseOrderWithAI(text);
        linesToProcess = aiResult.map(item => ({
          raw: item.cantidad !== 1 ? `${item.cantidad} ${item.producto}` : item.producto,
          qty: Number(item.cantidad) || 1,
          term: item.producto
        }));
        setMetodoEntrada(isListening ? 'voz-ia' : 'texto-ia');
      } catch {
        linesToProcess = parseWithRegex(text);
        setMetodoEntrada(isListening ? 'voz' : 'texto');
      } finally {
        setIsProcessingAI(false);
      }
    } else {
      linesToProcess = parseWithRegex(text);
      setMetodoEntrada(isListening ? 'voz' : 'texto');
    }

    const newCards = buildParsedLines(linesToProcess, products);
    const found = newCards.filter(l => l.status !== 'error');
    const missing = newCards.filter(l => l.status === 'error').map(l => l.term);
    setParsedLines(prev => [...prev, ...found]);
    if (missing.length) setNotFound(prev => [...prev, ...missing]);
    setText('');
  };

  const removeLineFromText = (raw) => {
    setText(prev =>
      prev.split('\n').filter(l => l.trim() !== raw.trim()).join('\n').trim()
    );
  };

  const confirmLine = (idx) => {
    const line = parsedLines[idx];
    if (line.matches.length > 0) {
      addItem(line.matches[line.selectedMatchIdx], line.qty);
      setParsedLines(prev => prev.filter((_, i) => i !== idx));
      removeLineFromText(line.raw);
    }
  };

  const removeLine = (idx) => {
    const updated = [...parsedLines];
    updated.splice(idx, 1);
    setParsedLines(updated);
  };

  const updateLineQty = (lineId, rawValue) => {
    setParsedLines(prev => prev.map(line =>
      line.id === lineId ? { ...line, qty: rawValue === '' ? '' : Math.max(0, parseFloat(rawValue) || 0) } : line
    ));
  };

  const commitLineQty = (lineId) => {
    setParsedLines(prev => prev.map(line =>
      line.id === lineId ? { ...line, qty: parseFloat(line.qty) || 1 } : line
    ));
  };

  const toggleOptions = (idx) => {
    const updated = [...parsedLines];
    updated[idx].showOptions = !updated[idx].showOptions;
    setParsedLines(updated);
  };

  const selectOption = (lineIdx, matchIdx) => {
    const updated = [...parsedLines];
    updated[lineIdx].selectedMatchIdx = matchIdx;
    updated[lineIdx].showOptions = false;
    setParsedLines(updated);
  };

  const confirmAll = () => {
    const toConfirm = parsedLines.filter(l => l.status === 'success');
    toConfirm.forEach(line => addItem(line.matches[line.selectedMatchIdx], line.qty));
    const confirmedRaws = new Set(toConfirm.map(l => l.raw.trim()));
    setParsedLines(prev => prev.filter(l => !confirmedRaws.has(l.raw.trim())));
    setText(prev =>
      prev.split('\n').filter(l => !confirmedRaws.has(l.trim())).join('\n').trim()
    );
  };

  const correctCount = parsedLines.filter(l => l.status === 'success').length;
  const warningCount = parsedLines.filter(l => l.status === 'warning').length;

  if (!client) {
    return (
      <div className="p-4 flex-center flex-col mt-10">
        <h2 className="text-xl mb-4 text-center">No hay cliente seleccionado</h2>
        <button className="btn btn-primary" onClick={() => onNavigate('clients')}>Seleccionar Cliente</button>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ paddingBottom: total > 0 ? '5rem' : '2rem' }}>
      <header className="mb-4">
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.88rem', fontWeight: 600,
          padding: '0 0 0.4rem 0'
        }}>← Atrás</button>
        <div className="flex-between">
          <h1 className="text-xl">Procesar Pedido Rápido</h1>
          {aiEnabled && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'hsl(270,100%,65%,0.15)', color: 'hsl(270,100%,75%)', border: '1px solid hsl(270,100%,65%,0.3)' }}>
              ✨ IA activa
            </span>
          )}
        </div>
        <p className="text-muted">Cliente: <strong className="text-primary">{client.name}</strong></p>
      </header>

      <div className="glass-panel p-4 mb-4">
        <div className="flex-between mb-2">
          <label className="text-sm font-semibold">Escribe o dicta (una línea por producto):</label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn flex-center gap-1"
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.85rem',
                background: 'var(--bg-surface)',
                color: 'var(--primary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}
              onClick={() => setShowScanner(true)}
              title="Escanear código de barras"
            >
              <ScanLine size={16} /> Escanear
            </button>
            <button
              type="button"
              className="btn flex-center gap-2"
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.85rem',
                background: isListening ? 'hsl(0,100%,65%,0.15)' : 'var(--bg-surface)',
                color: isListening ? 'var(--danger)' : hasSpeechSupport ? 'var(--text-main)' : 'var(--text-muted)',
                border: `1px solid ${isListening ? 'var(--danger)' : 'var(--border-color)'}`,
                cursor: hasSpeechSupport ? 'pointer' : 'not-allowed'
              }}
              onClick={toggleListen}
              disabled={!hasSpeechSupport}
            >
              {isListening ? <><Mic size={16} /> Escuchando...</> : hasSpeechSupport ? <><Mic size={16} /> Dictar</> : <><MicOff size={16} /> No disponible</>}
            </button>
          </div>
        </div>

        <textarea
          className="input-glass w-full"
          rows="5"
          placeholder={aiEnabled
            ? 'Ejemplo:\ndoce coca zero 2.25\nponeme cinco yerba playadito\nquiero tres harinas tres ceros'
            : 'Ejemplo:\n12 coca zero 2.25\n5 yerba playadito 500'}
          value={text}
          onChange={e => setText(e.target.value)}
          style={{ resize: 'vertical' }}
        />

        <button
          className="btn btn-primary w-full mt-3 flex-center gap-2"
          onClick={processText}
          disabled={isProcessingAI}
        >
          {isProcessingAI
            ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Procesando con IA...</>
            : <><Play size={18} /> Procesar Líneas</>
          }
        </button>
      </div>

      {parsedLines.length > 0 && (
        <div className="glass-panel p-3 mb-4 animate-slide-up" style={{ background: 'var(--bg-surface)' }}>
          <div className="flex-between">
            <div className="text-sm">
              <span className="font-bold text-primary">{correctCount} listas</span>
              <span className="mx-2 text-muted">|</span>
              <span className="font-bold" style={{ color: '#eab308' }}>{warningCount} revisar</span>
            </div>
            {correctCount > 0 && (
              <button className="btn btn-primary flex-center gap-1 text-sm" onClick={confirmAll} style={{ padding: '0.4rem 0.8rem' }}>
                <Check size={16} /> Confirmar Todo
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {parsedLines.map((line, idx) => {
          const hasMatches = line.matches.length > 0;
          const selectedProduct = hasMatches ? line.matches[line.selectedMatchIdx] : null;
          const borderColor = line.status === 'success' ? 'var(--primary)' : line.status === 'warning' ? '#eab308' : 'var(--danger)';

          return (
            <div key={line.id} className="glass-panel p-3 animate-slide-up" style={{ borderLeft: `4px solid ${borderColor}` }}>
              <div className="flex-between mb-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="font-semibold text-sm" style={{ display: 'inline-block', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>"{line.raw}"</span>
                  {line.status === 'warning' && <span style={{ fontSize: '0.65rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#eab308', color: '#fff' }}>Revisar</span>}
                  {line.status === 'error' && <span className="bg-danger text-white" style={{ fontSize: '0.65rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Sin coincidencia</span>}
                </div>
                <button className="text-muted" onClick={() => removeLine(idx)}><X size={18} /></button>
              </div>

              {hasMatches ? (
                <>
                  <div className="mb-2 p-2" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--border-radius-sm)' }}>
                    <div className="flex-between gap-2">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-semibold truncate" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedProduct.name}</p>
                        <p className="text-xs text-muted">{selectedProduct.brand} {selectedProduct.presentation} {selectedProduct.weight}</p>
                        <p className="text-sm font-bold text-primary mt-1">${selectedProduct.price}</p>
                      </div>
                      <div className="text-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Cant:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLineQty(line.id, e.target.value)}
                            onBlur={() => commitLineQty(line.id)}
                            className="input-glass text-center"
                            style={{ width: '60px', padding: '0.2rem', fontSize: '0.9rem' }}
                          />
                        </div>
                        <div className="font-bold" style={{ whiteSpace: 'nowrap' }}>
                          ${(selectedProduct.price * line.qty).toLocaleString('es-AR')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {line.showOptions && (
                    <div className="mb-2 p-1 border" style={{ borderColor: 'var(--border-color)', borderRadius: 'var(--border-radius-sm)', maxHeight: '150px', overflowY: 'auto' }}>
                      <p className="text-xs text-muted mb-1 pl-1">Otras coincidencias ({line.matches.length}):</p>
                      {line.matches.map((m, mIdx) => (
                        <div
                          key={m.id}
                          className="flex-between p-2 text-sm cursor-pointer"
                          onClick={() => selectOption(idx, mIdx)}
                          style={{
                            color: mIdx === line.selectedMatchIdx ? 'var(--primary)' : 'inherit',
                            background: mIdx === line.selectedMatchIdx ? 'var(--bg-surface)' : 'transparent',
                            borderRadius: '4px'
                          }}
                        >
                          <span className="truncate flex-1">{m.name} {m.brand} {m.weight}</span>
                          <span className="font-semibold ml-2">${m.price}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <button className="btn flex-1 flex-center gap-1 text-sm" onClick={() => toggleOptions(idx)}>
                      <ChevronDown size={16} /> Cambiar
                    </button>
                    <button className="btn btn-primary flex-1 flex-center gap-1 text-sm" onClick={() => confirmLine(idx)}>
                      <Check size={16} /> {line.qty > 1 ? 'Agregar ' + line.qty : 'Agregar'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-2 text-center text-danger text-sm" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--border-radius-sm)' }}>
                  No se encontraron coincidencias para "{line.term}".
                </div>
              )}
            </div>
          );
        })}

        {notFound.length > 0 && (
          <div className="glass-panel p-3 animate-slide-up" style={{ borderLeft: '4px solid var(--danger)' }}>
            <div className="flex-between mb-2">
              <span className="text-sm font-semibold text-danger">No encontrado en catálogo:</span>
              <button className="text-xs text-muted" onClick={() => setNotFound([])}>Limpiar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {notFound.map((term, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.2rem 0.6rem', borderRadius: '999px',
                  background: 'hsl(0,80%,55%,0.12)', border: '1px solid hsl(0,80%,55%,0.3)',
                  color: 'var(--danger)', fontSize: '0.8rem'
                }}>
                  {term}
                  <button onClick={() => setNotFound(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {parsedLines.length === 0 && notFound.length === 0 && text.trim() === '' && (
          <div className="text-center text-primary p-4 animate-slide-up">
            <Check size={32} className="mx-auto mb-2" />
            <p>¡Líneas procesadas y agregadas!</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <div style={{ position: 'fixed', bottom: '5.5rem', left: '1rem', right: '1rem', zIndex: 40, maxWidth: '568px', margin: '0 auto' }}>
          <button className="btn btn-primary w-full flex-between" style={{ padding: '1rem' }} onClick={() => onNavigate('summary')}>
            <span className="flex-center gap-2"><ShoppingCart size={20} /> Ver Pedido Final</span>
            <span className="font-bold text-xl">${total.toLocaleString('es-AR')}</span>
          </button>
        </div>
      )}

      {showScanner && <BarcodeScanner onClose={() => setShowScanner(false)} />}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
