import { useState, useEffect, Component } from 'react';
import { searchProducts } from '../utils/search';

function calcFreeItems(d, qty) {
  if (!d || d.type !== 'bonus') return 0;
  return d.condicion ? Math.floor(qty / d.condicion) * d.value : d.value;
}
function bonLabel(i) {
  const free = calcFreeItems(i.discount, i.quantity);
  return `-${free} bon.`;
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '2rem', color: 'var(--danger)' }}>
        <p style={{ fontWeight: 700 }}>Error al renderizar:</p>
        <pre style={{ fontSize: '0.75rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
      </div>
    );
    return this.props.children;
  }
}
import { ChevronLeft, ChevronDown, Copy, Check, RefreshCw, Users, ShoppingBag, Lock, Unlock, Loader, Share2, Trash2, FileText, Table2, Printer, Eye, Tag, Ticket, Plus, X, Upload } from 'lucide-react';
import { useStore } from '../store';
import {
  listenVendedores, listenPedidos,
  setVendorBlocked, markOrderSeen, deleteOrder,
  renewCode, syncProductos, updateEmpresaData,
  deleteVendedor, clearProductosFirebase,
  saveOferta, deleteOferta, listenOfertas,
  generateCodigoDescuento, listenCodigosDescuento, deleteCodigoDescuento,
  syncClientesFromExcel, regenerarCodigoClientes,
  getEmpresaData
} from '../services/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function clientOf(p) { return p.client || p.cliente || {}; }

function buildOrderText(p) {
  const c = clientOf(p);
  let t = `*Pedido — ${c.name || 'Cliente'}*\n`;
  if (c.address) t += `📍 ${c.address}\n`;
  t += `👤 ${p.vendedorNombre}\n`;
  if (p.date?.toMillis) t += `📅 ${new Date(p.date.toMillis()).toLocaleDateString('es-AR')}\n`;
  t += '\n';
  (p.items || []).forEach(i => {
    const disc = i.discount
      ? (i.discount.type === 'percent' ? ` (-${i.discount.value}%)` : ` (${bonLabel(i)})`)
      : '';
    t += `• ${i.quantity}x ${i.product?.name}${disc} — $${fmtMoney(i.subtotal)}\n`;
  });
  if (p.orderDiscount) {
    t += `\nSubtotal: $${fmtMoney(p.total)}`;
    t += `\nDesc. ${p.orderDiscount}%: -$${fmtMoney(p.total * p.orderDiscount / 100)}`;
    t += `\n\n*TOTAL: $${fmtMoney(p.total * (1 - p.orderDiscount / 100))}*`;
  } else {
    t += `\n*TOTAL: $${fmtMoney(p.total)}*`;
  }
  return t;
}

const PDF_GREEN = [39, 174, 96];
const PDF_DARK  = [30, 30, 30];
const PDF_MUTED = [110, 110, 110];

function exportTodosExcel(pedidos) {
  const headers = ['Cliente', 'Fecha', 'Hora', 'Vendedor', 'Código', 'Producto', 'Cantidad', 'Precio Unit.', 'Subtotal', 'Total Pedido'];
  const grouped = {};
  pedidos.forEach(p => {
    const c = clientOf(p);
    const key = c.name || 'Sin cliente';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  const clientesOrdenados = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'es'));
  const rows = [headers];
  clientesOrdenados.forEach(clientName => {
    grouped[clientName].forEach(p => {
      const fechaMs = p.date?.toMillis ? p.date.toMillis() : Date.now();
      const fecha = new Date(fechaMs);
      (p.items || []).forEach(item => {
        rows.push([
          clientName,
          fecha.toLocaleDateString('es-AR'),
          fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          p.vendedorNombre || '',
          item.product?.code || '',
          item.product?.name || '',
          item.quantity,
          item.product?.price || 0,
          item.subtotal || 0,
          p.orderDiscount ? p.total * (1 - p.orderDiscount / 100) : p.total,
        ]);
      });
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
  XLSX.writeFile(wb, `Pedidos_${new Date().toLocaleDateString('es-AR').replace(/\//g, '-')}.xlsx`);
}

async function exportPedidoPDF(p, mayorista) {
  const c      = clientOf(p);
  const doc   = new jsPDF();
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const mL = 14, mR = 14, rightX = pageW - mR;
  const totalFinal = p.orderDiscount ? p.total * (1 - p.orderDiscount / 100) : p.total;
  const hasDisc    = (p.items || []).some(i => i.discount);
  const fecha      = p.date?.toMillis ? new Date(p.date.toMillis()).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');

  doc.setFillColor(...PDF_GREEN);
  doc.rect(0, 0, pageW, 3.5, 'F');

  let dY = 12;
  const storedLogo = localStorage.getItem('mayorista-logo');
  let logoW = 0, logoH = 0;
  if (storedLogo) {
    try {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = storedLogo; });
      if (img.naturalWidth) {
        const sc = Math.min(60 / (img.naturalWidth * 25.4 / 96), 30 / (img.naturalHeight * 25.4 / 96));
        logoW = img.naturalWidth * 25.4 / 96 * sc;
        logoH = img.naturalHeight * 25.4 / 96 * sc;
        try { doc.addImage(storedLogo, 'JPEG', mL, 7, logoW, logoH, undefined, 'FAST'); } catch { try { doc.addImage(storedLogo, 'PNG', mL, 7, logoW, logoH, undefined, 'FAST'); } catch {} }
      }
    } catch {}
  }
  const dX = storedLogo && logoW > 0 ? mL + logoW + 7 : mL;
  if (mayorista?.nombre) { doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(...PDF_DARK); doc.text(mayorista.nombre, dX, dY); dY += 6; }
  doc.setFont(undefined,'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
  if (mayorista?.cuit)         { doc.text(`CUIT: ${mayorista.cuit}`, dX, dY);           dY += 4.5; }
  if (mayorista?.condicionIVA) { doc.text(`Cond. IVA: ${mayorista.condicionIVA}`, dX, dY); dY += 4.5; }
  if (mayorista?.telefono)     { doc.text(`Tel: ${mayorista.telefono}`, dX, dY);         dY += 4.5; }
  if (mayorista?.email)        { doc.text(mayorista.email, dX, dY);                      dY += 4.5; }
  if (mayorista?.direccion)    { doc.text(mayorista.direccion, dX, dY);                  dY += 4.5; }

  const sep1Y = Math.max(7 + logoH, dY) + 4;
  doc.setDrawColor(...PDF_GREEN); doc.setLineWidth(0.7);
  doc.line(mL, sep1Y, rightX, sep1Y);

  const pedY = sep1Y + 6;
  doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(...PDF_GREEN);
  doc.text('PEDIDO', mL, pedY);
  doc.setFont(undefined,'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
  doc.text(`Fecha: ${fecha}`, mL + 28, pedY);
  doc.text(`Vendedor: ${p.vendedorNombre || ''}`, rightX, pedY, { align: 'right' });

  const sep2Y = pedY + 4;
  doc.setDrawColor(...PDF_GREEN); doc.setLineWidth(0.4);
  doc.line(mL, sep2Y, rightX, sep2Y);

  let cY = sep2Y + 6;
  doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(...PDF_MUTED);
  doc.text('CLIENTE', mL, cY); cY += 5;
  doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(...PDF_DARK);
  doc.text(c.name || '', mL, cY); cY += 5;
  doc.setFont(undefined,'normal'); doc.setFontSize(8.5); doc.setTextColor(...PDF_MUTED);
  if (c.address) { doc.text(c.address, mL, cY); cY += 4.5; }
  if (c.phone)   { doc.text(`Tel: ${c.phone}`, mL, cY); cY += 4.5; }

  const head = hasDisc
    ? [['Código','Producto','Cant.','Dto/Bon','Precio Unit.','Subtotal']]
    : [['Código','Producto','Cant.','Precio Unit.','Subtotal']];
  const body = (p.items || []).map(i => {
    const row = [i.product?.code || '', i.product?.name || '', String(i.quantity)];
    if (hasDisc) row.push(i.discount ? (i.discount.type==='percent' ? `-${i.discount.value}%` : bonLabel(i)) : '—');
    row.push(`$${fmtMoney(i.product?.price || 0)}`, `$${fmtMoney(i.subtotal || 0)}`);
    return row;
  });
  autoTable(doc, {
    startY: cY + 4, head, body, theme: 'grid',
    headStyles: { fillColor: PDF_GREEN, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: PDF_DARK },
    alternateRowStyles: { fillColor: [240,252,244] },
    columnStyles: hasDisc
      ? { 0:{cellWidth:18}, 3:{cellWidth:22,halign:'center'}, 4:{halign:'right'}, 5:{halign:'right',fontStyle:'bold'} }
      : { 0:{cellWidth:18}, 3:{halign:'right'}, 4:{halign:'right',fontStyle:'bold'} },
  });

  const tY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  if (p.orderDiscount) {
    doc.setFont(undefined,'normal'); doc.setTextColor(...PDF_MUTED);
    doc.text('Subtotal:', 130, tY);
    doc.text(`$${fmtMoney(p.total)}`, rightX, tY, { align:'right' });
    doc.setTextColor(180,40,40);
    doc.text(`Descuento ${p.orderDiscount}%:`, 130, tY+7);
    doc.text(`-$${fmtMoney(p.total * p.orderDiscount / 100)}`, rightX, tY+7, { align:'right' });
    doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
    doc.line(128, tY+10, rightX, tY+10);
    doc.setTextColor(...PDF_DARK); doc.setFontSize(13); doc.setFont(undefined,'bold');
    doc.text('TOTAL:', 130, tY+18);
    doc.text(`$${fmtMoney(totalFinal)}`, rightX, tY+18, { align:'right' });
  } else {
    doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(...PDF_DARK);
    doc.text('TOTAL:', 130, tY+6);
    doc.text(`$${fmtMoney(totalFinal)}`, rightX, tY+6, { align:'right' });
  }
  doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(190,190,190);
  doc.text('Generado con Mayolista', mL, pageH - 8);

  const fileName = `Pedido_${(c.name||'cliente').replace(/\s+/g,'_')}.pdf`;
  const blob = doc.output('blob');
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPedidoExcel(p) {
  const c        = clientOf(p);
  const fecha    = p.date?.toMillis ? new Date(p.date.toMillis()).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  const hasDisc  = (p.items || []).some(i => i.discount);
  const totalFinal = p.orderDiscount ? p.total * (1 - p.orderDiscount / 100) : p.total;
  const header = hasDisc
    ? ['Código','Producto','Cantidad','Dto/Bon','Precio Unit.','Subtotal']
    : ['Código','Producto','Cantidad','Precio Unit.','Subtotal'];
  const body = (p.items || []).map(i => {
    const row = [i.product?.code||'', i.product?.name||'', i.quantity];
    if (hasDisc) row.push(i.discount ? (i.discount.type==='percent' ? `-${i.discount.value}%` : bonLabel(i)) : '');
    row.push(i.product?.price||0, i.subtotal||0);
    return row;
  });
  const rows = [
    ['Cliente:', c.name||''],
    ['Dirección:', c.address||''],
    ['Vendedor:', p.vendedorNombre||''],
    ['Fecha:', fecha],
    [],
    header,
    ...body,
    [],
    ['','','', ...(hasDisc?['']:[]), 'Subtotal:', p.total],
  ];
  if (p.orderDiscount) {
    rows.push(['','','', ...(hasDisc?['']:[]), `Descuento ${p.orderDiscount}%:`, -(p.total * p.orderDiscount / 100)]);
    rows.push(['','','', ...(hasDisc?['']:[]), 'TOTAL:', totalFinal]);
  } else {
    rows.push(['','','', ...(hasDisc?['']:[]), 'TOTAL:', p.total]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
  XLSX.writeFile(wb, `Pedido_${(c.name||'cliente').replace(/\s+/g,'_')}.xlsx`);
}

function printPedido(p, mayorista) {
  const c        = clientOf(p);
  const fecha    = p.date?.toMillis ? new Date(p.date.toMillis()).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  const totalFinal = p.orderDiscount ? p.total * (1 - p.orderDiscount / 100) : p.total;
  const rows = (p.items || []).map(i => {
    const disc = i.discount ? (i.discount.type==='percent' ? ` <span style="color:#16a34a">(-${i.discount.value}%)</span>` : ` <span style="color:#16a34a">(-${i.discount.value} bon.)</span>`) : '';
    return `<tr><td>${i.product?.code||''}</td><td>${i.product?.name||''}${disc}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">$${fmtMoney(i.product?.price||0)}</td><td style="text-align:right;font-weight:700">$${fmtMoney(i.subtotal||0)}</td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:24px;max-width:720px;margin:0 auto}
    h2{color:#1e3a5f;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    thead{background:#1e3a5f;color:#fff}
    th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10pt}
    .total-row td{font-weight:800;font-size:12pt;border-top:2px solid #1e3a5f;border-bottom:none}
    .muted{color:#64748b;font-size:9pt}
    .disc{color:#dc2626}
    @media print{body{padding:0}}
  </style></head><body>
    ${mayorista?.nombre ? `<h2>${mayorista.nombre}</h2>` : ''}
    ${mayorista?.cuit ? `<p class="muted">CUIT: ${mayorista.cuit}${mayorista.condicionIVA ? ' · ' + mayorista.condicionIVA : ''}</p>` : ''}
    <hr style="border:none;border-top:2px solid #1e3a5f;margin:12px 0"/>
    <p><strong>Cliente:</strong> ${c.name||''}</p>
    ${c.address ? `<p class="muted">${c.address}</p>` : ''}
    <p class="muted">Vendedor: ${p.vendedorNombre||''} · Fecha: ${fecha}</p>
    <table>
      <thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P.Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${p.orderDiscount ? `<p class="disc" style="text-align:right">Descuento ${p.orderDiscount}% s/pedido: -$${fmtMoney(p.total * p.orderDiscount / 100)}</p>` : ''}
    <table><tbody><tr class="total-row"><td colspan="4">TOTAL</td><td style="text-align:right">$${fmtMoney(totalFinal)}</td></tr></tbody></table>
    <p class="muted" style="text-align:center;margin-top:24px">Generado con Mayolista</p>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

function timeAgo(ts) {
  if (!ts?.toMillis) return 'nunca';
  const diff = Date.now() - ts.toMillis();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  if (hrs  < 24) return `hace ${hrs}h`;
  return `hace ${days}d`;
}

export default function AdminPanelScreen({ onNavigate }) {
  const [tab, setTab]                   = useState('vendedores');
  const [vendedores, setVendedores]     = useState([]);
  const [pedidos, setPedidos]           = useState([]);
  const [copied, setCopied]             = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState('');
  const [syncProgress, setSyncProgress] = useState(null);
  const [generatingCode, setGenerating]     = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(false);
  const [expandedId, setExpandedId]         = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmRemoveVendorId, setConfirmRemoveVendorId] = useState(null);

  // Ofertas del día
  const [ofertas, setOfertasLocal]           = useState([]);
  const [ofertaForm, setOfertaForm]          = useState(null); // null = cerrado
  const [ofertaSaving, setOfertaSaving]      = useState(false);

  // Códigos de descuento
  const [codigos, setCodigos]                = useState([]);
  const [newCodPct, setNewCodPct]            = useState('');
  const [newCodCliente, setNewCodCliente]    = useState('');
  const [genLoading, setGenLoading]          = useState(false);
  const [genResult, setGenResult]            = useState(null);
  const clients                              = useStore(s => s.clients);

  // Importar clientes Excel
  const [clientImportLoading, setClientImportLoading] = useState(false);
  const [clientImportMsg, setClientImportMsg]         = useState('');
  const [codigoClientesLocal, setCodigoClientesLocal] = useState('');
  const [regenLoading, setRegenLoading]               = useState(false);
  const [codigoClientesCopied, setCodigoClientesCopied] = useState(false);

  const empresaId     = useStore(s => s.empresaId);
  const empresaCodigo = useStore(s => s.empresaCodigo);
  const vendedorId    = useStore(s => s.vendedorId);
  const mayorista     = useStore(s => s.mayorista);
  const products      = useStore(s => s.products);
  const setEmpresaInfo = useStore(s => s.setEmpresaInfo);

  useEffect(() => {
    if (!empresaId) return;
    const u1 = listenVendedores(empresaId, setVendedores);
    const u2 = listenPedidos(empresaId, setPedidos);
    const u3 = listenOfertas(empresaId, setOfertasLocal);
    const u4 = listenCodigosDescuento(empresaId, setCodigos);
    getEmpresaData(empresaId).then(data => {
      if (data?.codigoClientes) setCodigoClientesLocal(data.codigoClientes);
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, [empresaId]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(empresaCodigo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    const text = `Unite a Mayolista con el código: *${empresaCodigo}*\nDescargá la app: https://hectorgperez7060-bit.github.io/mayolista/`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Código Mayolista', text }); } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleSyncProducts = async () => {
    setSyncing(true); setSyncMsg(''); setSyncProgress(null);
    try {
      await syncProductos(empresaId, products, (current, total, phase) => {
        setSyncProgress({ current, total, phase });
      });
      setSyncProgress(null);
      setSyncMsg(`✓ ${products.length} productos publicados`);
    } catch (err) {
      setSyncProgress(null);
      console.error('syncProductos error:', err);
      const msg = err?.message || 'Verificá tu conexión.';
      setSyncMsg(`Error: ${msg}`);
      window.alert(`No se pudo publicar: ${msg}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3500);
  };

  const handleManualPurge = async () => {
    if (!window.confirm('¿Estás seguro de que querés borrar TODOS los productos de la nube? Esto no se puede deshacer.')) return;
    setSyncing(true); setSyncMsg('Limpiando base de datos...');
    try {
      await clearProductosFirebase(empresaId, (count) => {
        setSyncMsg(`Limpiando base de datos (${count} eliminados)...`);
      });
      setSyncMsg('✓ Base de datos limpia');
    } catch (err) {
      window.alert('Error al limpiar: ' + err.message);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3500);
  };

  const handleSyncData = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      await updateEmpresaData(empresaId, mayorista);
      setSyncMsg('✓ Datos del mayorista publicados');
    } catch {
      setSyncMsg('Error al sincronizar.');
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3500);
  };

  const handleDelete = async (pedidoId) => {
    try {
      await deleteOrder(empresaId, pedidoId);
      if (expandedId === pedidoId) setExpandedId(null);
    } catch {}
    setConfirmDeleteId(null);
  };

  const handleNewCode = async () => {
    setGenerating(true); setConfirmNewCode(false);
    try {
      const newCode = await renewCode(empresaId, mayorista.nombre);
      setEmpresaInfo({ empresaCodigo: newCode });
    } catch {}
    setGenerating(false);
  };

  const otrosVendedores = vendedores.filter(v => v.id !== vendedorId);
  const pendientes      = pedidos.filter(p => p.estado === 'pendiente').length;

  return (
    <ErrorBoundary>
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl">Panel de Empresa</h1>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>{mayorista.nombre || 'Mi empresa'}</p>
        </div>
      </header>

      {/* Código */}
      <div className="glass-panel p-4 mb-4" style={{ background: 'hsla(270,100%,55%,0.07)', border: '1px solid hsla(270,100%,55%,0.25)' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>
          CÓDIGO DE EMPRESA
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '0.1em', color: 'var(--primary)', flex: 1 }}>
            {empresaCodigo}
          </span>
          <button onClick={handleCopyCode} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'hsl(150,80%,50%)' : 'var(--text-muted)', padding: '0.35rem' }}>
            {copied ? <Check size={22} /> : <Copy size={22} />}
          </button>
          <button onClick={handleShareCode} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.35rem' }}>
            <Share2 size={22} />
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Compartí este código con tus vendedores para que se conecten
        </p>

        {!confirmNewCode ? (
          <button onClick={() => setConfirmNewCode(true)} style={{
            marginTop: '10px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'hsl(0,80%,65%)', fontSize: '0.78rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '4px', padding: 0
          }}>
            <RefreshCw size={13} /> Generar código nuevo
          </button>
        ) : (
          <div style={{ marginTop: '10px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <p style={{ fontSize: '0.78rem', color: 'hsl(0,80%,65%)', flex: 1 }}>
              ¿Seguro? El código actual dejará de funcionar.
            </p>
            <button onClick={handleNewCode} disabled={generatingCode} style={{
              padding: '0.3rem 0.7rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'hsl(0,80%,55%)', color: '#fff', fontWeight: 700, fontSize: '0.75rem'
            }}>
              {generatingCode ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sí, generar'}
            </button>
            <button onClick={() => setConfirmNewCode(false)} style={{
              padding: '0.3rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)',
              background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem'
            }}>
              Cancelar
            </button>
          </div>
        )}
      </div>


      {/* Publicar */}
      <div className="glass-panel p-3 mb-4">
        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.06em' }}>
          PUBLICAR CAMBIOS A VENDEDORES
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={handleSyncProducts} disabled={syncing} style={{
            flex: 2, padding: '0.65rem', borderRadius: '12px', border: 'none',
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.82rem',
            cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            minWidth: '200px'
          }}>
            {syncing && <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {syncProgress
              ? `Subiendo ${syncProgress.current}/${syncProgress.total}…`
              : `Publicar lista (${products.length})`}
          </button>
          
          <button onClick={handleSyncData} disabled={syncing} style={{
            flex: 1, padding: '0.65rem', borderRadius: '12px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface-glass)', color: 'var(--text-main)',
            fontWeight: 700, fontSize: '0.82rem', cursor: syncing ? 'default' : 'pointer',
            opacity: syncing ? 0.7 : 1
          }}>
            Datos
          </button>

          <button onClick={handleManualPurge} disabled={syncing} style={{
            flex: 1, padding: '0.65rem', borderRadius: '12px',
            border: '1px solid hsla(0,80%,55%,0.3)',
            background: 'hsla(0,80%,55%,0.08)', color: 'hsl(0,80%,65%)',
            fontWeight: 700, fontSize: '0.82rem', cursor: syncing ? 'default' : 'pointer',
            opacity: syncing ? 0.7 : 1
          }}>
            Borrar Nube
          </button>
        </div>
        {syncMsg && (
          <p style={{
            marginTop: '8px', fontSize: '0.78rem', fontWeight: 600,
            color: syncMsg.startsWith('✓') ? 'hsl(150,80%,50%)' : 'var(--danger)'
          }}>{syncMsg}</p>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'vendedores', label: `Vendedores`, icon: <Users size={14} /> },
          { key: 'pedidos',    label: 'Pedidos',    icon: <ShoppingBag size={14} /> },
          { key: 'ofertas',    label: 'Ofertas',    icon: <Tag size={14} /> },
          { key: 'descuentos', label: 'Descuentos', icon: <Ticket size={14} /> },
          { key: 'clientes',   label: 'Clientes',   icon: <Upload size={14} /> }
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: '1 1 auto', padding: '0.55rem 0.5rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: tab === t.key ? 'var(--primary)' : 'var(--bg-surface-glass)',
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            fontWeight: 700, fontSize: '0.8rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
          }}>
            {t.icon} {t.label}
            {t.key === 'pedidos' && pendientes > 0 && (
              <span style={{
                background: 'hsl(0,80%,60%)', color: '#fff',
                borderRadius: '999px', padding: '1px 6px', fontSize: '0.7rem'
              }}>{pendientes}</span>
            )}
          </button>
        ))}
      </div>

      {/* Vendedores */}
      {tab === 'vendedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {otrosVendedores.length === 0 ? (
            <div className="glass-panel p-5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Users size={34} style={{ opacity: 0.25, marginBottom: '0.6rem' }} />
              <p style={{ fontSize: '0.9rem' }}>Ningún vendedor conectado aún</p>
              <p style={{ fontSize: '0.78rem', marginTop: '4px' }}>Compartí el código para que se unan</p>
            </div>
          ) : otrosVendedores.map(v => (
            <div key={v.id} className="glass-panel p-3" style={{ opacity: v.bloqueado ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: v.bloqueado ? 'hsl(0,60%,25%)' : 'hsla(270,100%,55%,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1.05rem',
                  color: v.bloqueado ? 'hsl(0,80%,70%)' : 'var(--primary)'
                }}>
                  {v.nombre?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.nombre}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {v.bloqueado ? '🔴 Bloqueado' : '🟢 Activo'} · {timeAgo(v.lastSeen)}
                  </p>
                </div>
                <button onClick={() => setVendorBlocked(empresaId, v.id, !v.bloqueado)} style={{
                  padding: '0.4rem 0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: v.bloqueado ? 'hsla(150,80%,40%,0.15)' : 'hsla(0,80%,55%,0.12)',
                  color: v.bloqueado ? 'hsl(150,80%,50%)' : 'hsl(0,80%,65%)',
                  fontWeight: 700, fontSize: '0.75rem',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  {v.bloqueado ? <><Unlock size={14} /> Activar</> : <><Lock size={14} /> Bloquear</>}
                </button>
                <button onClick={() => setConfirmRemoveVendorId(v.id)} style={{
                  padding: '0.4rem 0.5rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: 'hsla(0,80%,55%,0.1)',
                  color: 'hsl(0,80%,65%)',
                  display: 'flex', alignItems: 'center'
                }}>
                  <Trash2 size={15} />
                </button>
              </div>
              {confirmRemoveVendorId === v.id && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <p style={{ flex: 1, fontSize: '0.78rem', color: 'hsl(0,80%,65%)' }}>
                    ¿Eliminar a {v.nombre} de la empresa?
                  </p>
                  <button onClick={async () => { await deleteVendedor(empresaId, v.id); setConfirmRemoveVendorId(null); }} style={{
                    padding: '0.3rem 0.7rem', borderRadius: '8px', border: 'none',
                    background: 'hsl(0,80%,55%)', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
                  }}>Sí, eliminar</button>
                  <button onClick={() => setConfirmRemoveVendorId(null)} style={{
                    padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)',
                    background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer'
                  }}>Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pedidos */}
      {tab === 'pedidos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {pedidos.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
              <button
                onClick={() => exportTodosExcel(pedidos)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '0.45rem 0.85rem', borderRadius: '10px',
                  border: '1px solid rgba(22,163,74,0.4)', background: 'rgba(22,163,74,0.1)',
                  color: '#4ade80', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                <Table2 size={14} /> Exportar todo Excel
              </button>
            </div>
          )}
          {pedidos.length === 0 ? (
            <div className="glass-panel p-5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <ShoppingBag size={34} style={{ opacity: 0.25, marginBottom: '0.6rem' }} />
              <p style={{ fontSize: '0.9rem' }}>Sin pedidos todavía</p>
            </div>
          ) : (() => {
            const grouped = {};
            pedidos.forEach(p => {
              const key = clientOf(p).name || 'Sin cliente';
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(p);
            });
            const clientesOrdenados = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'es'));
            return clientesOrdenados.map(clientName => (
              <div key={clientName} style={{ marginBottom: '0.75rem' }}>
                <div style={{
                  padding: '0.35rem 0.75rem', marginBottom: '0.4rem',
                  background: 'hsla(270,100%,55%,0.1)',
                  borderLeft: '3px solid var(--primary)',
                  borderRadius: '0 8px 8px 0',
                }}>
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--primary)' }}>{clientName}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {grouped[clientName].length} pedido{grouped[clientName].length !== 1 ? 's' : ''}
                  </span>
                </div>
                {grouped[clientName].map(p => {
            const isOpen = expandedId === p.id;
            const isConfirmingDelete = confirmDeleteId === p.id;
            const totalFinal = p.orderDiscount ? p.total * (1 - p.orderDiscount / 100) : p.total;
            const c = clientOf(p);
            return (
              <div key={p.id} className="glass-panel p-3" style={{
                borderLeft: p.estado === 'pendiente' ? '3px solid var(--primary)' : '3px solid transparent',
                marginBottom: '0.4rem'
              }}>
                <div onClick={() => { setExpandedId(isOpen ? null : p.id); setConfirmDeleteId(null); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.name || 'Cliente'}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {p.vendedorNombre}
                      {p.date ? ` · ${new Date(p.date?.toMillis ? p.date.toMillis() : p.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1rem' }}>${fmtMoney(totalFinal)}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.items?.length || 0} productos</p>
                    </div>
                    <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    {/* Encabezado de columnas */}
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 36px 60px 70px 72px', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
                      <span>Código</span>
                      <span>Producto</span>
                      <span style={{ textAlign: 'center' }}>Cant.</span>
                      <span style={{ textAlign: 'center' }}>Dto/Bon</span>
                      <span style={{ textAlign: 'right' }}>P.Unit.</span>
                      <span style={{ textAlign: 'right' }}>Subtotal</span>
                    </div>
                    {(p.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 36px 60px 70px 72px', gap: '4px', fontSize: '0.78rem', marginBottom: '4px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.product?.code || '—'}</span>
                        <span style={{ color: 'var(--text-main)' }}>{item.product?.name}</span>
                        <span style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                        <span style={{ textAlign: 'center', fontSize: '0.72rem', color: item.discount ? 'hsl(150,80%,50%)' : 'var(--text-muted)' }}>
                          {item.discount ? (item.discount.type === 'percent' ? `-${item.discount.value}%` : `${calcFreeItems(item.discount, item.quantity)} bon.`) : '—'}
                        </span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>${fmtMoney(item.product?.price || 0)}</span>
                        <span style={{ textAlign: 'right', fontWeight: 700 }}>${fmtMoney(item.subtotal)}</span>
                      </div>
                    ))}
                    {p.orderDiscount && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#f87171', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
                        <span>Desc. pedido {p.orderDiscount}%{p.codigoDescuento ? ` (${p.codigoDescuento})` : ''}</span>
                        <span>-${fmtMoney(p.total * p.orderDiscount / 100)}</span>
                      </div>
                    )}
                    {p.estado === 'pendiente' && (
                      <button onClick={() => markOrderSeen(empresaId, p.id)} style={{
                        marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '4px', padding: 0
                      }}>
                        <Eye size={13} /> Marcar como visto
                      </button>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.4rem', marginTop: '10px' }}>
                      <button
                        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildOrderText(p))}`, '_blank')}
                        style={{ padding: '0.45rem 0.25rem', borderRadius: '10px', border: '1px solid rgba(37,211,102,0.4)', background: 'rgba(37,211,102,0.1)', color: '#25D366', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                      >
                        <Share2 size={13} /> WA
                      </button>
                      <button
                        onClick={() => exportPedidoPDF(p, mayorista)}
                        style={{ padding: '0.45rem 0.25rem', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                      >
                        <FileText size={13} /> PDF
                      </button>
                      <button
                        onClick={() => exportPedidoExcel(p)}
                        style={{ padding: '0.45rem 0.25rem', borderRadius: '10px', border: '1px solid rgba(22,163,74,0.4)', background: 'rgba(22,163,74,0.1)', color: '#4ade80', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                      >
                        <Table2 size={13} /> Excel
                      </button>
                      <button
                        onClick={() => printPedido(p, mayorista)}
                        style={{ padding: '0.45rem 0.25rem', borderRadius: '10px', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                      >
                        <Printer size={13} /> Imprimir
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => handleDelete(p.id)} style={{ padding: '0.35rem 0.75rem', borderRadius: '10px', border: 'none', background: 'hsl(0,80%,55%)', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Borrar</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '0.35rem 0.6rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)} style={{ padding: '0.35rem 0.65rem', borderRadius: '10px', border: '1px solid hsla(0,80%,55%,0.4)', background: 'hsla(0,80%,55%,0.1)', color: 'hsl(0,80%,65%)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600 }}>
                          <Trash2 size={14} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
              </div>
            ));
          })()}
        </div>
      )}

      {/* ── Tab Ofertas ── */}
      {tab === 'ofertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Ofertas del día ({ofertas.length})</p>
            <button onClick={() => setOfertaForm({ productId: '', productCode: '', productName: '', productPrice: '', condicionTipo: 'percent_qty', condicionCantidad: '', condicionValor: '' })} style={{
              padding: '0.45rem 0.9rem', borderRadius: '10px', border: 'none', background: 'hsl(35,100%,50%)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
            }}>
              <Plus size={15} /> Nueva oferta
            </button>
          </div>

          {ofertaForm && (() => {
            const busqueda = ofertaForm._busqueda || '';
            const sugeridos = busqueda.length >= 2
              ? searchProducts(products, busqueda).slice(0, 15)
              : [];
            const productoSeleccionado = !!ofertaForm.productId;
            return (
            <div className="glass-panel p-4" style={{ borderColor: 'hsla(35,100%,50%,0.4)' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Nueva oferta</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

                {/* Buscador de producto */}
                {!productoSeleccionado ? (
                  <div style={{ position: 'relative' }}>
                    <input className="input-glass" placeholder="Buscá el producto por nombre o código..."
                      value={busqueda}
                      onChange={e => setOfertaForm(f => ({ ...f, _busqueda: e.target.value, productId: '', productCode: '', productName: '', productPrice: '' }))}
                      style={{ fontSize: '0.9rem', padding: '0.65rem', width: '100%' }}
                      autoFocus />
                    {sugeridos.length > 0 && (
                      <div
                        onTouchStart={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                          background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                          borderRadius: '10px', marginTop: '4px', maxHeight: '260px', overflowY: 'auto',
                          WebkitOverflowScrolling: 'touch'
                        }}>
                        {sugeridos.map(p => (
                          <div key={p.id}
                            onClick={() => setOfertaForm(f => ({ ...f, _busqueda: p.name, productId: p.id, productCode: p.code || '', productName: p.name, productPrice: p.price || '' }))}
                            style={{ padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</span>
                              {p.code && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'monospace' }}>{p.code}</span>}
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>${fmtMoney(p.price || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {busqueda.length >= 2 && sugeridos.length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Sin coincidencias</p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', background: 'hsla(35,100%,50%,0.1)', borderRadius: '10px', border: '1px solid hsla(35,100%,50%,0.3)' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ofertaForm.productName}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>${fmtMoney(ofertaForm.productPrice || 0)} c/u {ofertaForm.productCode && `· ${ofertaForm.productCode}`}</p>
                    </div>
                    <button onClick={() => setOfertaForm(f => ({ ...f, _busqueda: '', productId: '', productCode: '', productName: '', productPrice: '' }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}>
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Tipo de descuento y valores — solo se muestran si hay producto seleccionado */}
                {productoSeleccionado && (<>
                  <select className="input-glass" value={ofertaForm.condicionTipo}
                    onChange={e => setOfertaForm(f => ({ ...f, condicionTipo: e.target.value }))}
                    style={{ fontSize: '0.9rem', padding: '0.65rem' }}>
                    <option value="percent_qty">% de descuento al comprar X o más unidades</option>
                    <option value="bonus_qty">Comprando X unidades, N unidades de regalo</option>
                  </select>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input className="input-glass" type="number" placeholder={ofertaForm.condicionTipo === 'percent_qty' ? 'Cantidad mínima' : 'Comprando X unidades'}
                      value={ofertaForm.condicionCantidad}
                      onChange={e => setOfertaForm(f => ({ ...f, condicionCantidad: e.target.value }))}
                      style={{ fontSize: '0.9rem', padding: '0.65rem' }} />
                    <input className="input-glass" type="number" placeholder={ofertaForm.condicionTipo === 'percent_qty' ? '% de descuento' : 'Unidades de regalo'}
                      value={ofertaForm.condicionValor}
                      onChange={e => setOfertaForm(f => ({ ...f, condicionValor: e.target.value }))}
                      style={{ fontSize: '0.9rem', padding: '0.65rem' }} />
                  </div>
                </>)}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={async () => {
                    if (!ofertaForm.productName || !ofertaForm.condicionCantidad || !ofertaForm.condicionValor) return;
                    setOfertaSaving(true);
                    await saveOferta(empresaId, {
                      productId: ofertaForm.productId,
                      productCode: ofertaForm.productCode,
                      productName: ofertaForm.productName,
                      productPrice: Number(ofertaForm.productPrice) || 0,
                      condicionTipo: ofertaForm.condicionTipo,
                      condicionCantidad: Number(ofertaForm.condicionCantidad),
                      condicionValor: Number(ofertaForm.condicionValor),
                      activa: true
                    });
                    setOfertaForm(null);
                    setOfertaSaving(false);
                  }} disabled={ofertaSaving || !productoSeleccionado} style={{
                    flex: 1, padding: '0.7rem', borderRadius: '10px', border: 'none',
                    background: productoSeleccionado ? 'hsl(35,100%,50%)' : 'var(--bg-surface)',
                    color: productoSeleccionado ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: productoSeleccionado ? 'pointer' : 'default'
                  }}>
                    {ofertaSaving ? 'Guardando...' : 'Guardar oferta'}
                  </button>
                  <button onClick={() => setOfertaForm(null)} style={{
                    padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                  }}><X size={16} /></button>
                </div>
              </div>
            </div>
            );
          })()}

          {ofertas.length === 0 && !ofertaForm && (
            <div className="glass-panel p-5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Tag size={34} style={{ opacity: 0.25, marginBottom: '0.6rem' }} />
              <p style={{ fontSize: '0.9rem' }}>No hay ofertas activas</p>
            </div>
          )}

          {ofertas.map(of => (
            <div key={of.id} className="glass-panel p-3" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                {of.productCode && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{of.productCode}</span>}
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{of.productName}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>${fmtMoney(of.productPrice || 0)} c/u</p>
                <p style={{ fontSize: '0.78rem', color: 'hsl(35,100%,60%)', fontWeight: 600, marginTop: '3px' }}>
                  {of.condicionTipo === 'percent_qty'
                    ? `${of.condicionValor}% dto. comprando ${of.condicionCantidad}+`
                    : `Comprando ${of.condicionCantidad}, ${of.condicionValor} de regalo`}
                </p>
              </div>
              <button onClick={() => deleteOferta(empresaId, of.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Descuentos ── */}
      {tab === 'descuentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="glass-panel p-4">
            <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.75rem' }}>Generar código de descuento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input className="input-glass" type="number" min="1" max="100" placeholder="% de descuento (ej: 15)"
                value={newCodPct} onChange={e => setNewCodPct(e.target.value)}
                style={{ fontSize: '0.9rem', padding: '0.65rem' }} />
              <select className="input-glass" value={newCodCliente} onChange={e => setNewCodCliente(e.target.value)}
                style={{ fontSize: '0.9rem', padding: '0.65rem' }}>
                <option value="">Para cualquier cliente (genérico)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.cuit ? `(${c.cuit})` : ''}</option>
                ))}
              </select>
              <button onClick={async () => {
                if (!newCodPct || isNaN(Number(newCodPct))) return;
                setGenLoading(true); setGenResult(null);
                const res = await generateCodigoDescuento(empresaId, Number(newCodPct), newCodCliente || null);
                setGenResult(res.codigo);
                setNewCodPct(''); setNewCodCliente('');
                setGenLoading(false);
              }} disabled={genLoading || !newCodPct} style={{
                padding: '0.7rem', borderRadius: '10px', border: 'none', background: 'hsl(35,100%,50%)', color: '#fff', fontWeight: 700, cursor: 'pointer'
              }}>
                {genLoading ? 'Generando...' : 'Generar código'}
              </button>
              {genResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.75rem', background: 'hsla(150,80%,40%,0.12)', borderRadius: '10px', border: '1px solid hsla(150,80%,40%,0.3)' }}>
                  <Check size={16} style={{ color: 'hsl(150,80%,55%)' }} />
                  <p style={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace', color: 'hsl(150,80%,60%)' }}>{genResult}</p>
                  <button onClick={async () => { await navigator.clipboard.writeText(genResult); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <Copy size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Códigos generados ({codigos.length})</p>
          {codigos.length === 0 && (
            <div className="glass-panel p-4" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No hay códigos generados aún
            </div>
          )}
          {codigos.map(c => {
            const clienteTarget = c.targetClienteId ? clients.find(cl => cl.id === c.targetClienteId) : null;
            return (
              <div key={c.id} className="glass-panel p-3" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.95rem' }}>{c.codigo}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {c.porcentaje}% dto. · {clienteTarget ? clienteTarget.name : 'Cualquier cliente'} · {c.usados?.length || 0} uso{c.usados?.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                  background: c.usados?.length > 0 ? 'hsla(0,80%,60%,0.15)' : 'hsla(150,80%,40%,0.15)',
                  color: c.usados?.length > 0 ? 'hsl(0,80%,65%)' : 'hsl(150,80%,55%)'
                }}>
                  {c.usados?.length > 0 ? 'Usado' : 'Activo'}
                </span>
                <button onClick={async () => {
                  if (!confirm(`¿Borrar el código ${c.codigo}?`)) return;
                  await deleteCodigoDescuento(empresaId, c.id).catch(() => {});
                }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05555', padding: '0.2rem', lineHeight: 1 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab Clientes (importar Excel) ── */}
      {tab === 'clientes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Código de acceso para clientes */}
          <div className="glass-panel p-4">
            <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={16} style={{ color: 'hsl(35,100%,55%)' }} /> Código de acceso para clientes
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Compartí este código con tus clientes para que se registren en la app. Es distinto al código de vendedores.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <div style={{
                flex: 1, padding: '0.65rem 1rem', borderRadius: '12px',
                background: 'hsla(35,100%,50%,0.1)', border: '2px solid hsla(35,100%,50%,0.3)',
                fontFamily: 'monospace', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.12em',
                color: 'hsl(35,100%,60%)', textAlign: 'center'
              }}>
                {codigoClientesLocal || '—'}
              </div>
              <button onClick={async () => {
                if (!codigoClientesLocal) return;
                await navigator.clipboard.writeText(codigoClientesLocal);
                setCodigoClientesCopied(true);
                setTimeout(() => setCodigoClientesCopied(false), 2000);
              }} style={{ padding: '0.65rem', borderRadius: '10px', border: 'none', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                {codigoClientesCopied ? <Check size={18} style={{ color: 'hsl(150,80%,55%)' }} /> : <Copy size={18} style={{ color: 'var(--text-muted)' }} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={async () => {
                if (!codigoClientesLocal) return;
                const text = `Registrate como cliente en Mayolista con el código: *${codigoClientesLocal}*\nApp: https://hectorgperez7060-bit.github.io/mayolista/`;
                if (navigator.share) { try { await navigator.share({ title: 'Código clientes', text }); } catch {} }
                else { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }
              }} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: 'none', background: 'hsl(150,70%,35%)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Share2 size={15} /> Compartir
              </button>
              <button onClick={async () => {
                if (!confirm('¿Regenerar el código de clientes? El código anterior dejará de funcionar.')) return;
                setRegenLoading(true);
                try {
                  const nuevo = await regenerarCodigoClientes(empresaId);
                  setCodigoClientesLocal(nuevo);
                } catch {}
                setRegenLoading(false);
              }} disabled={regenLoading} style={{ padding: '0.6rem 0.85rem', borderRadius: '10px', border: 'none', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <RefreshCw size={14} /> Regenerar
              </button>
            </div>
            {!codigoClientesLocal && (
              <button onClick={async () => {
                setRegenLoading(true);
                try {
                  const nuevo = await regenerarCodigoClientes(empresaId);
                  setCodigoClientesLocal(nuevo);
                } catch {}
                setRegenLoading(false);
              }} disabled={regenLoading} style={{ marginTop: '0.6rem', width: '100%', padding: '0.65rem', borderRadius: '10px', border: 'none', background: 'hsl(35,100%,50%)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {regenLoading ? 'Generando...' : 'Generar código de clientes'}
              </button>
            )}
          </div>

          <div className="glass-panel p-4">
            <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Importar clientes desde Excel</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              El archivo debe tener columnas: <strong>nombre</strong>, <strong>cuit</strong>, y opcionalmente: condicionIVA, direccion, localidad, zona, telefono, email, id, codigoCliente.
              Si el cliente ya existe por CUIT o ID, se actualiza sin borrar su historial.
            </p>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
              padding: '1rem', borderRadius: '14px', border: '2px dashed var(--border-color)',
              cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600
            }}>
              <Upload size={20} />
              {clientImportLoading ? 'Importando...' : 'Elegir archivo .xlsx / .xls'}
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={clientImportLoading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setClientImportLoading(true); setClientImportMsg('');
                  try {
                    const data = await file.arrayBuffer();
                    const wb = XLSX.read(data);
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    if (rows.length === 0) { setClientImportMsg('El archivo no tiene datos.'); setClientImportLoading(false); return; }
                    await syncClientesFromExcel(empresaId, rows, (cur, total) => {
                      setClientImportMsg(`Importando ${cur}/${total}...`);
                    });
                    setClientImportMsg(`✓ ${rows.length} cliente${rows.length !== 1 ? 's' : ''} importado${rows.length !== 1 ? 's' : ''} correctamente.`);
                  } catch (err) {
                    setClientImportMsg(`Error: ${err.message}`);
                  }
                  setClientImportLoading(false);
                  e.target.value = '';
                }}
              />
            </label>
            {clientImportMsg && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: clientImportMsg.startsWith('✓') ? 'hsl(150,80%,55%)' : 'var(--danger)', fontWeight: 600 }}>
                {clientImportMsg}
              </p>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
    </ErrorBoundary>
  );
}
