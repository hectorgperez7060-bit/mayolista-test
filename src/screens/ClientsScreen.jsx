import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, UserCheck, Plus, Clock, Trash2 } from 'lucide-react';
import { addClientToFirebase, deleteClientFromFirebase } from '../services/firebase';

const CONDICION_IVA = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final'];

const FORM_EMPTY = { name: '', cuit: '', condicionIVA: '', address: '', localidad: '', zona: '', phone: '', email: '' };

export default function ClientsScreen({ onNavigate, onBack }) {
  const clients = useStore(state => state.clients);
  const setClient = useStore(state => state.setClient);
  const addClient = useStore(state => state.addClient);
  const removeClient = useStore(state => state.removeClient);
  const markClientDeleted = useStore(state => state.markClientDeleted);
  const currentClient = useStore(state => state.currentOrder.client);
  const empresaId = useStore(state => state.empresaId);
  const rol = useStore(state => state.rol);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_EMPTY);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.address && c.address.toLowerCase().includes(search.toLowerCase())) ||
    (c.cuit && c.cuit.includes(search)) ||
    (c.zona && c.zona.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = (client) => {
    setClient(client);
    onNavigate('order');
  };

  const handleDelete = async (client, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Borrar a ${client.name}?`)) return;
    markClientDeleted(client.id);
    removeClient(client.id);
    if (rol === 'admin' && empresaId) {
      try {
        await deleteClientFromFirebase(empresaId, client.id);
      } catch (err) {
        alert(`No se pudo borrar en la nube: ${err.message}`);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = [];
    if (!form.name)      missing.push('Nombre');
    if (!form.cuit)      missing.push('CUIT / DNI');
    if (!form.address)   missing.push('Dirección');
    if (!form.localidad) missing.push('Localidad');
    if (!form.phone)     missing.push('Teléfono');
    if (!form.email)     missing.push('Email');
    if (missing.length)  return alert(`Campos obligatorios: ${missing.join(', ')}`);
    const newClient = { ...form, id: 'C-' + Date.now().toString() };
    addClient(newClient);
    if (empresaId) addClientToFirebase(empresaId, newClient).catch(() => {});
    setShowForm(false);
    setForm(FORM_EMPTY);
  };

  return (
    <div className="p-4" style={{ paddingBottom: '2rem' }}>
      <header className="mb-4">
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.88rem', fontWeight: 600,
          padding: '0 0 0.4rem 0'
        }}>← Atrás</button>
        <h1 className="text-xl">Clientes</h1>
        <p className="text-muted">Selecciona o crea un cliente para el pedido</p>
      </header>

      {showForm ? (
        <form onSubmit={handleSubmit} className="glass-panel p-4 mb-4 animate-slide-up">
          <h2 className="text-lg mb-4 text-primary">Nuevo Cliente</h2>
          <div className="flex flex-col gap-3">
            <input className="input-glass" placeholder="Nombre Comercial / Razón Social *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input-glass" placeholder="CUIT / DNI *" value={form.cuit} onChange={e => setForm({...form, cuit: e.target.value})} />
              <select className="input-glass" value={form.condicionIVA} onChange={e => setForm({...form, condicionIVA: e.target.value})} style={{ appearance: 'none', WebkitAppearance: 'none' }}>
                <option value="">Cond. IVA</option>
                {CONDICION_IVA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input className="input-glass" placeholder="Dirección *" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input-glass" placeholder="Localidad *" value={form.localidad} onChange={e => setForm({...form, localidad: e.target.value})} />
              <input className="input-glass" placeholder="Zona (opcional)" value={form.zona} onChange={e => setForm({...form, zona: e.target.value})} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input-glass" placeholder="Teléfono *" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              <input className="input-glass" type="email" placeholder="Email *" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn w-full" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary w-full">Guardar</button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '1rem', left: '1rem', color: 'var(--text-muted)' }}><Search size={20} /></div>
              <input type="text" placeholder="Buscar cliente..." className="input-glass" style={{ paddingLeft: '3rem', width: '100%' }} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className="btn btn-primary flex-center" style={{ padding: '0 1rem' }} onClick={() => setShowForm(true)} title="Nuevo Cliente">
              <Plus size={24} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {filtered.map(client => (
              <div 
                key={client.id} 
                className="glass-panel p-4"
                style={{ borderColor: currentClient?.id === client.id ? 'var(--primary)' : 'var(--border-color)', cursor: 'pointer' }}
                onClick={() => handleSelect(client)}
              >
                <div className="flex-between">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 className="text-lg">{client.name}</h3>
                      {client.zona && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '0.1rem 0.45rem',
                          background: 'hsl(270,100%,55%,0.15)', color: 'hsl(270,100%,70%)',
                          borderRadius: '999px', whiteSpace: 'nowrap'
                        }}>{client.zona}</span>
                      )}
                    </div>
                    {(client.cuit || client.condicionIVA || client.address) && (
                      <p className="text-muted text-sm mt-1">
                        {client.cuit && `CUIT: ${client.cuit}`}{client.condicionIVA && ` · ${client.condicionIVA}`}{client.address && ` · ${client.address}`}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {currentClient?.id === client.id && <UserCheck size={22} className="text-primary" />}
                    {(rol === 'admin' || rol === 'vendedor') && (
                      <button onClick={(e) => handleDelete(client, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05555', padding: '0.2rem', lineHeight: 1 }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {currentClient?.id === client.id && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      className="btn flex-center gap-1 text-sm text-primary" 
                      onClick={(e) => { e.stopPropagation(); onNavigate('history'); }}
                      style={{ padding: '0.2rem 0.5rem', background: 'transparent', border: '1px solid var(--primary)' }}
                    >
                      <Clock size={16} /> Ver Historial
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-muted p-4">No se encontraron clientes.</p>}
          </div>
        </>
      )}
    </div>
  );
}
