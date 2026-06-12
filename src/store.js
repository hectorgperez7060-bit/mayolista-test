import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mockProducts, mockClients } from './data';

function calcSubtotal(price, qty, discount) {
  if (!discount || !discount.value) return price * qty;
  if (discount.type === 'percent') return price * qty * (1 - discount.value / 100);
  if (discount.type === 'bonus') {
    const freeItems = discount.condicion
      ? Math.floor(qty / discount.condicion) * discount.value
      : discount.value;
    return price * Math.max(0, qty - freeItems);
  }
  return price * qty;
}

export const useStore = create(
  persist(
    (set) => ({
      isLoggedIn: !!localStorage.getItem('mayolista-session'),
      login: () => set({ isLoggedIn: true }),
      logout: () => set({ isLoggedIn: false }),

      mayorista: { nombre: '', cuit: '', direccion: '', telefono: '', email: '', condicionIVA: '', logo: '' },
      setMayorista: (data) => set((state) => ({ mayorista: { ...state.mayorista, ...data } })),

      deletedClientIds: [],
      markClientDeleted: (id) => set(state => ({ deletedClientIds: [...state.deletedClientIds, id] })),

      empresaId:          null,
      empresaCodigo:      null,
      rol:                null,
      vendedorId:         null,
      vendedorNombre:     null,
      vendedorSessionId:  null,
      setEmpresaInfo:  (info) => set(info),
      clearEmpresaInfo: () => set({ empresaId: null, empresaCodigo: null, rol: null, vendedorId: null, vendedorNombre: null, vendedorSessionId: null, clienteInfo: null, codigoDescuentoAplicado: null, currentOrder: { client: null, items: [], total: 0, orderDiscount: null, metodoEntrada: null } }),

      products: mockProducts,
      clients: mockClients,
      ordersHistory: [],
      currentOrder: {
        client: null,
        items: [],
        total: 0,
        orderDiscount: null,
        metodoEntrada: null
      },
      
      setClient: (client) => set((state) => ({
        currentOrder: { ...state.currentOrder, client }
      })),

      setOrderDiscount: (percent) => set((state) => ({
        currentOrder: {
          ...state.currentOrder,
          orderDiscount: (percent > 0 && percent <= 100) ? percent : null
        }
      })),
      
      addToHistory: () => set((state) => {
        const o = state.currentOrder;
        if (!o.client || o.items.length === 0 || o._savedId) return state;
        const newOrder = {
          id: 'ORD-' + Date.now(),
          date: new Date().toISOString(),
          client: o.client,
          items: [...o.items],
          total: o.total
        };
        return {
          ordersHistory: [newOrder, ...(state.ordersHistory || [])],
          currentOrder: { ...o, _savedId: newOrder.id }
        };
      }),

      saveOrder: () => set((state) => {
        const o = state.currentOrder;
        if (!o.client || o.items.length === 0) return state;
        const history = state.ordersHistory || [];
        const alreadySaved = o._savedId && history.some(h => h.id === o._savedId);
        const finalHistory = alreadySaved ? history : [
          { id: 'ORD-' + Date.now(), date: new Date().toISOString(), client: o.client, items: [...o.items], total: o.total, metodoEntrada: o.metodoEntrada },
          ...history
        ];
        return {
          ordersHistory: finalHistory,
          currentOrder: { client: null, items: [], total: 0, orderDiscount: null, metodoEntrada: null }
        };
      }),

      setMetodoEntrada: (metodo) => set((state) => ({
        currentOrder: { ...state.currentOrder, metodoEntrada: metodo }
      })),
      
      repeatOrder: (order) => set(() => ({
        currentOrder: {
          client: order.client,
          items: [...order.items],
          total: order.total
        }
      })),

      deleteFromHistory: (orderId) => set((state) => ({
        ordersHistory: state.ordersHistory.filter(o => o.id !== orderId)
      })),
      
      setItemQuantity: (productId, qty) => set((state) => {
        const items = [...state.currentOrder.items];
        const idx = items.findIndex(i => i.product.id === productId);
        if (idx >= 0) {
          if (qty <= 0) {
            items.splice(idx, 1);
          } else {
            items[idx] = { ...items[idx], quantity: qty, subtotal: calcSubtotal(items[idx].product.price, qty, items[idx].discount) };
          }
        }
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        return { currentOrder: { ...state.currentOrder, items, total } };
      }),

      setItemDiscount: (productId, type, value, condicion = null) => set((state) => {
        const items = [...state.currentOrder.items];
        const idx = items.findIndex(i => i.product.id === productId);
        if (idx < 0) return state;
        const discount = (type && value > 0) ? { type, value, ...(condicion ? { condicion } : {}) } : null;
        items[idx] = { ...items[idx], discount, subtotal: calcSubtotal(items[idx].product.price, items[idx].quantity, discount) };
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        return { currentOrder: { ...state.currentOrder, items, total } };
      }),

      addItem: (product, qty = 1) => set((state) => {
        const items = [...state.currentOrder.items];
        const existingIdx = items.findIndex(i => i.product.id === product.id);
        if (existingIdx >= 0) {
          const newQty = items[existingIdx].quantity + qty;
          if (newQty <= 0) {
            items.splice(existingIdx, 1);
          } else {
            items[existingIdx] = { ...items[existingIdx], quantity: newQty, subtotal: calcSubtotal(product.price, newQty, items[existingIdx].discount) };
          }
        } else if (qty > 0) {
          items.push({ product, quantity: qty, subtotal: product.price * qty, discount: null });
        }
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        return { currentOrder: { ...state.currentOrder, items, total } };
      }),
      
      removeItem: (productId) => set((state) => {
        const items = state.currentOrder.items.filter(i => i.product.id !== productId);
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        return { currentOrder: { ...state.currentOrder, items, total } };
      }),

      clearOrder: () => set({
        currentOrder: { client: null, items: [], total: 0, orderDiscount: null }
      }),

      clearProducts: () => set({ products: [] }),

      addProduct: (product) => set((state) => ({
        products: [...state.products, { ...product, id: Date.now().toString() }]
      })),

      addClient: (client) => set((state) => ({
        clients: [...state.clients, { ...client, id: client.id || ('C-' + Date.now().toString()) }]
      })),

      removeClient: (clientId) => set((state) => ({
        clients: state.clients.filter(c => c.id !== clientId)
      })),

      bulkUpsertProducts: (importedList) => set((state) => {
        const nextProducts = [...state.products];
        importedList.forEach(item => {
          const idx = nextProducts.findIndex(p => p.code === item.codigo);
          if (idx >= 0) {
            // Update existings
            nextProducts[idx] = { 
              ...nextProducts[idx], 
              name: item.descripcion, 
              description: item.descripcion, 
              price: Number(item.precio) 
            };
          } else {
            // Create new
            nextProducts.push({
              id: Date.now().toString() + Math.random().toString().slice(2, 6),
              code: item.codigo,
              name: item.descripcion,
              description: item.descripcion,
              price: Number(item.precio),
              brand: '', 
              presentation: '', 
              weight: '', 
              category: 'Importado', 
              synonyms: []
            });
          }
        });
        return { products: nextProducts };
      }),

      pendingPurge: false,
      setPendingPurge: (val) => set({ pendingPurge: val }),

      // Rol cliente
      clienteInfo: null,
      setClienteInfo: (info) => set({ clienteInfo: info }),

      // Ofertas del día (cargadas desde Firebase)
      ofertas: [],
      setOfertas: (ofertas) => set({ ofertas }),

      // Código de descuento aplicado al pedido del cliente
      codigoDescuentoAplicado: null,
      setCodigoDescuentoAplicado: (info) => set((state) => ({
        codigoDescuentoAplicado: info,
        currentOrder: {
          ...state.currentOrder,
          orderDiscount: info ? info.porcentaje : null
        }
      }))
    }),
    {
      name: 'mayorista-storage',
    }
  )
);
