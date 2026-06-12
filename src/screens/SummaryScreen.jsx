import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Share2, FileText, Table2, Trash2, CheckCircle, X, Percent, Check } from 'lucide-react';
import { saveOrderToFirebase } from '../services/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function fmtQty(q) {
  return Number.isInteger(q) ? q.toString() : q.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
function fmtMoney(n) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}
function calcFreeItems(d, qty) {
  if (!d || d.type !== 'bonus') return 0;
  return d.condicion ? Math.floor(qty / d.condicion) * d.value : d.value;
}
function discLabel(d, qty) {
  if (!d) return '';
  if (d.type === 'percent') return `-${d.value}%`;
  const free = calcFreeItems(d, qty);
  return `-${fmtQty(free)} bon.`;
}
function finalTotal(subtotal, orderDiscount) {
  return orderDiscount ? subtotal * (1 - orderDiscount / 100) : subtotal;
}

/* ── Text for WhatsApp ── */
function buildText(client, items, subtotal, orderDiscount) {
  let t = `*Pedido - ${client.name}*\n`;
  if (client.address) t += `📍 ${client.address}\n`;
  t += `📅 ${new Date().toLocaleDateString('es-AR')}\n\n`;
  items.forEach(i => {
    const disc = i.discount ? ` (${discLabel(i.discount, i.quantity)})` : '';
    t += `• ${fmtQty(i.quantity)}x ${i.product.name}${disc} — $${fmtMoney(i.subtotal)}\n`;
  });
  if (orderDiscount) {
    t += `\nSubtotal: $${fmtMoney(subtotal)}`;
    t += `\nDesc. pedido ${orderDiscount}%: -$${fmtMoney(subtotal * orderDiscount / 100)}`;
  }
  t += `\n\n*TOTAL: $${fmtMoney(finalTotal(subtotal, orderDiscount))}*`;
  return t;
}

/* ── PDF ── */
const GREEN    = [39, 174, 96];
const DARK     = [30, 30, 30];
const MUTED    = [110, 110, 110];

function getImgDims(base64) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

async function buildPDFBlob(client, items, subtotal, orderDiscount, mayorista) {
  const doc      = new jsPDF();
  const pageW    = doc.internal.pageSize.width;
  const pageH    = doc.internal.pageSize.height;
  const mL = 14, mR = 14, rightX = pageW - mR;
  const hasItemDisc = items.some(i => i.discount);
  const total = finalTotal(subtotal, orderDiscount);

  // ── Top green accent stripe ──
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 3.5, 'F');

  // ── Logo (natural proportions, max 60×30 mm) ──
  const maxLogoW = 60, maxLogoH = 30;
  let logoW = 0, logoH = 0;
  const storedLogo = localStorage.getItem('mayorista-logo');
  if (storedLogo) {
    const dims = await getImgDims(storedLogo);
    if (dims?.w) {
      const pxMm = 25.4 / 96;
      const nW = dims.w * pxMm, nH = dims.h * pxMm;
      const sc = Math.min(maxLogoW / nW, maxLogoH / nH);
      logoW = nW * sc; logoH = nH * sc;
      try {
        doc.addImage(storedLogo, 'JPEG', mL, 7, logoW, logoH, undefined, 'FAST');
      } catch {
        try { doc.addImage(storedLogo, 'PNG', mL, 7, logoW, logoH, undefined, 'FAST'); } catch {}
      }
    }
  }

  // ── Mayorista data — to the RIGHT of logo ──
  const dX  = storedLogo && logoW > 0 ? mL + logoW + 7 : mL;
  let   dY  = 12;
  if (mayorista?.nombre) {
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(...DARK);
    doc.text(mayorista.nombre, dX, dY); dY += 6;
  }
  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  if (mayorista?.cuit)        { doc.text(`CUIT: ${mayorista.cuit}`, dX, dY);                   dY += 4.5; }
  if (mayorista?.condicionIVA){ doc.text(`Cond. IVA: ${mayorista.condicionIVA}`, dX, dY);      dY += 4.5; }
  if (mayorista?.telefono)    { doc.text(`Tel: ${mayorista.telefono}`, dX, dY);                dY += 4.5; }
  if (mayorista?.email)       { doc.text(mayorista.email, dX, dY);                             dY += 4.5; }
  if (mayorista?.direccion)   { doc.text(mayorista.direccion, dX, dY);                         dY += 4.5; }

  // ── Green separator 1 ──
  const sep1Y = Math.max(7 + logoH, dY) + 4;
  doc.setDrawColor(...GREEN); doc.setLineWidth(0.7);
  doc.line(mL, sep1Y, rightX, sep1Y);

  // ── PEDIDO row ──
  const pedY = sep1Y + 6;
  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(...GREEN);
  doc.text('PEDIDO', mL, pedY);
  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, mL + 28, pedY);
  doc.text(`N°: ${Date.now().toString().slice(-6)}`, rightX, pedY, { align: 'right' });

  // ── Green separator 2 ──
  const sep2Y = pedY + 4;
  doc.setDrawColor(...GREEN); doc.setLineWidth(0.4);
  doc.line(mL, sep2Y, rightX, sep2Y);

  // ── Client block ──
  let cY = sep2Y + 6;
  doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...MUTED);
  doc.text('CLIENTE', mL, cY); cY += 5;
  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(...DARK);
  doc.text(client.name, mL, cY); cY += 5;
  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  if (client.address) { doc.text(client.address, mL, cY); cY += 4.5; }
  if (client.phone)   { doc.text(`Tel: ${client.phone}`, mL, cY); cY += 4.5; }

  // ── Items table ──
  const head = hasItemDisc
    ? [['Código', 'Producto', 'Cant.', 'Dto/Bon', 'Precio Unit.', 'Subtotal']]
    : [['Código', 'Producto', 'Cant.', 'Precio Unit.', 'Subtotal']];

  const body = items.map(i => {
    const row = [i.product.code || '', i.product.name, fmtQty(i.quantity)];
    if (hasItemDisc) row.push(i.discount ? discLabel(i.discount) : '—');
    row.push(`$${fmtMoney(i.product.price)}`, `$${fmtMoney(i.subtotal)}`);
    return row;
  });

  autoTable(doc, {
    startY: cY + 4,
    head, body,
    theme: 'grid',
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    alternateRowStyles: { fillColor: [240, 252, 244] },
    columnStyles: hasItemDisc
      ? { 0:{cellWidth:18}, 3:{cellWidth:22,halign:'center'}, 4:{halign:'right'}, 5:{halign:'right',fontStyle:'bold'} }
      : { 0:{cellWidth:18}, 3:{halign:'right'}, 4:{halign:'right',fontStyle:'bold'} },
  });

  // ── Totals ──
  const tY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  if (orderDiscount) {
    const disc = subtotal * orderDiscount / 100;
    doc.setFont(undefined, 'normal'); doc.setTextColor(...MUTED);
    doc.text('Subtotal:', 130, tY);
    doc.text(`$${fmtMoney(subtotal)}`, rightX, tY, { align: 'right' });
    doc.setTextColor(180, 40, 40);
    doc.text(`Descuento ${orderDiscount}% s/pedido:`, 130, tY + 7);
    doc.text(`-$${fmtMoney(disc)}`, rightX, tY + 7, { align: 'right' });
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(128, tY + 10, rightX, tY + 10);
    doc.setTextColor(...DARK); doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.text('TOTAL:', 130, tY + 18);
    doc.text(`$${fmtMoney(total)}`, rightX, tY + 18, { align: 'right' });
  } else {
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(...DARK);
    doc.text('TOTAL:', 130, tY + 6);
    doc.text(`$${fmtMoney(total)}`, rightX, tY + 6, { align: 'right' });
  }

  // ── Footer ──
  doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(190, 190, 190);
  doc.text('Generado con Mayolista', mL, pageH - 8);

  return doc.output('blob');
}

export default function SummaryScreen({ onNavigate, onBack, readonlyDiscounts = false }) {
  const { client, items, total, orderDiscount } = useStore(s => s.currentOrder);
  const removeItem       = useStore(s => s.removeItem);
  const setItemQty       = useStore(s => s.setItemQuantity);
  const setItemDiscount  = useStore(s => s.setItemDiscount);
  const setOrderDiscount = useStore(s => s.setOrderDiscount);
  const saveOrder        = useStore(s => s.saveOrder);
  const addToHistory     = useStore(s => s.addToHistory);
  const mayorista        = useStore(s => s.mayorista);
  const empresaId        = useStore(s => s.empresaId);
  const rol              = useStore(s => s.rol);
  const vendedorId       = useStore(s => s.vendedorId);
  const vendedorNombre   = useStore(s => s.vendedorNombre);
  const codigoDescuentoAplicado = useStore(s => s.codigoDescuentoAplicado);
  const ofertas                 = useStore(s => s.ofertas);
  const clients                 = useStore(s => s.clients);
  const clearOrder              = useStore(s => s.clearOrder);

  const [saved, setSaved]         = useState(false);
  const [sharing, setSharing]     = useState(false);
  const [discInputs, setDiscInputs] = useState({});
  const [orderDiscInput, setOrderDiscInput] = useState(orderDiscount ? String(orderDiscount) : '');

  // Auto-aplicar descuentos de oferta cuando rol=cliente y cambia la cantidad
  useEffect(() => {
    if (!readonlyDiscounts || !ofertas || !ofertas.length) return;
    items.forEach(item => {
      const oferta = ofertas.find(o => o.productId === item.product.id || o.productCode === item.product.code);
      if (!oferta) return;
      const cumple = item.quantity >= oferta.condicionCantidad;
      if (cumple) {
        if (oferta.condicionTipo === 'percent_qty') {
          if (!item.discount || item.discount.type !== 'percent' || item.discount.value !== oferta.condicionValor) {
            setItemDiscount(item.product.id, 'percent', oferta.condicionValor);
          }
        } else if (oferta.condicionTipo === 'bonus_qty') {
          if (!item.discount || item.discount.type !== 'bonus' || item.discount.value !== oferta.condicionValor || item.discount.condicion !== oferta.condicionCantidad) {
            setItemDiscount(item.product.id, 'bonus', oferta.condicionValor, oferta.condicionCantidad);
          }
        }
      } else {
        if (item.discount) setItemDiscount(item.product.id, null, 0);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map(i => ({ id: i.product.id, qty: i.quantity }))), readonlyDiscounts]);

  const subtotal   = total;
  const totalFinal = finalTotal(subtotal, orderDiscount);
  const fileName   = client ? `Pedido_${client.name.replace(/\s+/g, '_')}.pdf` : 'Pedido.pdf';

  const markSaved = () => {
    addToHistory();
    setSaved(true);
  };

  const handleApplyOrderDisc = () => {
    const v = parseFloat(orderDiscInput);
    setOrderDiscount(isNaN(v) || v <= 0 ? 0 : v);
  };
  const handleClearOrderDisc = () => {
    setOrderDiscInput('');
    setOrderDiscount(0);
  };

  /* ── Share ── */
  const handleShare = async () => {
    if (!client) return;
    setSharing(true); markSaved();
    try {
      const blob = await buildPDFBlob(client, items, subtotal, orderDiscount, mayorista);
      const text = buildText(client, items, subtotal, orderDiscount);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Pedido', text });
      } else if (navigator.share) {
        await navigator.share({ title: 'Pedido', text, url: '' });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch {}
    setSharing(false);
  };

  const handleWhatsApp = () => {
    if (!client) return; markSaved();
    window.open(`https://wa.me/?text=${encodeURIComponent(buildText(client, items, subtotal, orderDiscount))}`, '_blank');
  };

  const handlePDF = async () => {
    if (!client) return; markSaved();
    const blob = await buildPDFBlob(client, items, subtotal, orderDiscount, mayorista);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExcel = () => {
    if (!client) return; markSaved();
    const hasItemDisc = items.some(i => i.discount);
    const header = hasItemDisc
      ? ['Código', 'Producto', 'Cantidad', 'Dto/Bon', 'Precio Unit.', 'Subtotal']
      : ['Código', 'Producto', 'Cantidad', 'Precio Unit.', 'Subtotal'];
    const body = items.map(i => {
      const row = [i.product.code || '', i.product.name, i.quantity];
      if (hasItemDisc) row.push(i.discount ? discLabel(i.discount) : '');
      row.push(i.product.price, i.subtotal);
      return row;
    });
    const rows = [
      ['Cliente:', client.name],
      ['Dirección:', client.address || ''],
      ['Fecha:', new Date().toLocaleDateString('es-AR')],
      [],
      header,
      ...body,
      [],
      ['', '', '', ...(hasItemDisc ? [''] : []), 'Subtotal:', subtotal],
    ];
    if (orderDiscount) {
      rows.push(['', '', '', ...(hasItemDisc ? [''] : []), `Descuento ${orderDiscount}%:`, -(subtotal * orderDiscount / 100)]);
      rows.push(['', '', '', ...(hasItemDisc ? [''] : []), 'TOTAL:', totalFinal]);
    } else {
      rows.push(['', '', '', ...(hasItemDisc ? [''] : []), 'TOTAL:', subtotal]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
    XLSX.writeFile(wb, `Pedido_${client.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleFinish = async () => {
    if ((rol === 'vendedor' || rol === 'cliente') && empresaId && vendedorId) {
      try {
        await saveOrderToFirebase(empresaId, vendedorId, vendedorNombre, {
          client, items, total, orderDiscount,
          codigoDescuento: codigoDescuentoAplicado?.codigo || null
        });
      } catch {}
    }
    saveOrder();
    onNavigate('home');
  };

  const clienteValido = client && (rol === 'cliente' || clients.some(c => c.id === client.id));

  if (!clienteValido || items.length === 0) {
    if (client && !clienteValido) clearOrder();
    return (
      <div className="p-4 flex-center flex-col mt-10" style={{ minHeight: '60vh' }}>
        <h2 className="text-xl mb-4 text-center">El pedido está vacío</h2>
        <button className="btn btn-primary" onClick={() => onNavigate('clients')}>
          Armar Pedido
        </button>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.88rem', fontWeight: 600,
            padding: '0 0 0.4rem 0'
          }}>
            ← Atrás
          </button>
          <h1 className="text-xl">Resumen del Pedido</h1>
          <p className="text-muted">Revisá y compartí</p>
        </div>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e', fontSize: '0.8rem', fontWeight: 600 }}>
            <CheckCircle size={15} /> Guardado
          </div>
        )}
      </header>

      <button onClick={() => onNavigate('order')} style={{
        width: '100%', padding: '0.85rem', borderRadius: '14px', border: '2px solid var(--primary)',
        background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem',
        cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
      }}>
        + Seguir agregando productos
      </button>

      {/* Cliente */}
      <div className="glass-panel p-4 mb-4">
        <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary)' }}>{client.name}</p>
        {client.address && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{client.address}</p>}
        {client.phone   && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{client.phone}</p>}
      </div>

      {/* Items */}
      <div className="flex flex-col gap-2 mb-4">
        <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
          {items.length} producto{items.length !== 1 ? 's' : ''}
        </p>
        {items.map(item => {
          const discVal  = discInputs[item.product.id] ?? '';
          const isPercent = item.discount?.type === 'percent';
          const isBonus   = item.discount?.type === 'bonus';
          const applyDiscount = (type) => {
            const v = parseFloat(discVal);
            setItemDiscount(item.product.id, isNaN(v) || v <= 0 ? null : type, isNaN(v) ? 0 : v);
          };
          const clearDiscount = () => {
            setDiscInputs(p => ({ ...p, [item.product.id]: '' }));
            setItemDiscount(item.product.id, null, 0);
          };
          return (
            <div key={item.product.id} className="glass-panel p-3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                  <p className="font-semibold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</p>
                  <p className="text-sm text-muted">${fmtMoney(item.product.price)} c/u</p>
                </div>
                <button onClick={() => removeItem(item.product.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                  <Trash2 size={17} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <input type="number" min="0" step="any"
                  className="input-glass text-center"
                  style={{ width: '64px', padding: '0.25rem', fontSize: '0.88rem' }}
                  value={item.quantity}
                  onFocus={e => e.target.select()}
                  onChange={e => setItemQty(item.product.id, parseFloat(e.target.value) || 0)}
                />
                {!readonlyDiscounts && (
                  <>
                    <input type="number" min="0" step="any"
                      className="input-glass text-center"
                      placeholder="dto"
                      style={{ width: '54px', padding: '0.25rem', fontSize: '0.82rem' }}
                      value={discVal}
                      onChange={e => setDiscInputs(p => ({ ...p, [item.product.id]: e.target.value }))}
                    />
                    <button onClick={() => applyDiscount('percent')} style={{
                      padding: '0.25rem 0.55rem', borderRadius: '8px', cursor: 'pointer',
                      fontWeight: 700, fontSize: '0.78rem',
                      background: isPercent ? 'var(--primary)' : 'var(--bg-surface)',
                      color: isPercent ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${isPercent ? 'var(--primary)' : 'var(--border-color)'}`
                    }}>%</button>
                    <button onClick={() => applyDiscount('bonus')} style={{
                      padding: '0.25rem 0.55rem', borderRadius: '8px', cursor: 'pointer',
                      fontWeight: 700, fontSize: '0.78rem',
                      background: isBonus ? '#059669' : 'var(--bg-surface)',
                      color: isBonus ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${isBonus ? '#059669' : 'var(--border-color)'}`
                    }}>BON</button>
                  </>
                )}
                <span className="font-bold text-primary" style={{ marginLeft: 'auto', fontSize: '0.95rem' }}>
                  ${fmtMoney(item.subtotal)}
                </span>
              </div>
              {item.discount && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                    background: isPercent ? 'rgba(99,102,241,0.15)' : 'rgba(5,150,105,0.15)',
                    color: isPercent ? '#818cf8' : '#34d399',
                    border: `1px solid ${isPercent ? 'rgba(99,102,241,0.3)' : 'rgba(5,150,105,0.3)'}`
                  }}>
                    {isPercent
                      ? `${item.discount.value}% de descuento`
                      : (() => {
                          const free = calcFreeItems(item.discount, item.quantity);
                          return `Bonif. ${fmtQty(free)} u. → pagás ${fmtQty(item.quantity - free)}`;
                        })()}
                  </span>
                  {!readonlyDiscounts && (
                    <button onClick={clearDiscount} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}
              {readonlyDiscounts && !item.discount && (() => {
                const oferta = ofertas.find(o => o.productId === item.product.id || o.productCode === item.product.code);
                if (!oferta) return null;
                const faltan = oferta.condicionCantidad - item.quantity;
                if (faltan <= 0) return null;
                return (
                  <p style={{ fontSize: '0.72rem', color: 'hsl(35,100%,60%)', marginTop: '4px' }}>
                    {oferta.condicionTipo === 'percent_qty'
                      ? `Agregá ${faltan} más para obtener el ${oferta.condicionValor}% de descuento`
                      : `Comprá ${faltan} más para llevarte ${oferta.condicionValor} de regalo`}
                  </p>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* ── Descuento global del pedido ── */}
      {readonlyDiscounts && codigoDescuentoAplicado ? (
        <div className="glass-panel p-4 mb-3" style={{ borderColor: 'hsla(150,80%,40%,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} style={{ color: 'hsl(150,80%,55%)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.88rem', color: 'hsl(150,80%,60%)', fontWeight: 600 }}>
              Descuento {codigoDescuentoAplicado.porcentaje}% otorgado por el mayorista
            </p>
          </div>
        </div>
      ) : !readonlyDiscounts ? (
        <div className="glass-panel p-4 mb-3">
          <p style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Percent size={15} style={{ color: 'var(--primary)' }} /> Descuento sobre el pedido
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number" min="0" max="100" step="any"
              className="input-glass text-center"
              placeholder="0"
              style={{ width: '72px', padding: '0.35rem', fontSize: '1rem', fontWeight: 700 }}
              value={orderDiscInput}
              onChange={e => setOrderDiscInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyOrderDisc()}
            />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>%</span>
            <button
              onClick={handleApplyOrderDisc}
              style={{
                padding: '0.4rem 1rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.88rem'
              }}
            >
              Aplicar
            </button>
            {orderDiscount && (
              <button onClick={handleClearOrderDisc} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.8rem'
              }}>
                <X size={14} /> Quitar
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Totales ── */}
      <div className="glass-panel p-4 mb-5">
        {orderDiscount ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Subtotal</span>
              <span style={{ color: 'var(--text-muted)' }}>${fmtMoney(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ color: '#f87171', fontSize: '0.95rem', fontWeight: 600 }}>
                Descuento {orderDiscount}%
              </span>
              <span style={{ color: '#f87171', fontWeight: 600 }}>
                -${fmtMoney(subtotal * orderDiscount / 100)}
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>TOTAL</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>
                ${fmtMoney(totalFinal)}
              </span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-xl">TOTAL</span>
            <span className="text-2xl text-primary font-bold">${fmtMoney(subtotal)}</span>
          </div>
        )}
      </div>

      {/* Compartir */}
      <button onClick={handleShare} disabled={sharing} style={{
        width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
        background: 'linear-gradient(135deg,#25D366,#128C7E)',
        color: '#fff', fontWeight: 800, fontSize: '1.05rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
        cursor: sharing ? 'default' : 'pointer',
        boxShadow: '0 4px 20px rgba(37,211,102,0.35)', opacity: sharing ? 0.8 : 1,
        marginBottom: '0.75rem'
      }}>
        <Share2 size={21} /> {sharing ? 'Abriendo...' : 'Compartir Pedido'}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <button onClick={handleWhatsApp} style={{ padding: '0.65rem 0.4rem', borderRadius: '12px', border: '1px solid rgba(37,211,102,0.4)', background: 'rgba(37,211,102,0.1)', color: '#25D366', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <Share2 size={18} /> WhatsApp
        </button>
        <button onClick={handlePDF} style={{ padding: '0.65rem 0.4rem', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <FileText size={18} /> PDF
        </button>
        <button onClick={handleExcel} style={{ padding: '0.65rem 0.4rem', borderRadius: '12px', border: '1px solid rgba(22,163,74,0.4)', background: 'rgba(22,163,74,0.1)', color: '#4ade80', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <Table2 size={18} /> Excel
        </button>
      </div>

      {rol === 'vendedor' ? (
        <button onClick={handleFinish} style={{
          width: '100%', padding: '1rem', borderRadius: '16px', border: 'none',
          background: 'linear-gradient(135deg, hsl(270,100%,55%), hsl(240,100%,60%))',
          color: '#fff', fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer'
        }}>
          Enviar al Mayorista
        </button>
      ) : (
        <button className="btn btn-primary w-full" onClick={handleFinish}>
          Finalizar y Nuevo Pedido
        </button>
      )}
    </div>
  );
}
