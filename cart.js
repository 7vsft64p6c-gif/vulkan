/**
 * cart.js — motor del carrito. Sin dependencias, sin build step.
 * Guarda solo {product_id, quantity} en localStorage — nunca precios.
 * Los precios reales para pintar el carrito salen de products.json
 * (el mismo archivo que usa catalogo.html), y el backend los vuelve a
 * calcular de cero al crear la orden (Fase 7).
 */
(function (window) {
  'use strict';

  const STORAGE_KEY = 'vulkan_cart_v1';
  const CHECKOUT_KEY = 'vulkan_checkout_session_v1';
  const LAST_ORDER_KEY = 'vulkan_last_order_v1';

  let listeners = [];
  let productsCache = null;
  let productsPromise = null;

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeRaw(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    listeners.forEach((fn) => {
      try { fn(items); } catch (e) { /* no-op */ }
    });
  }

  function loadProducts() {
    if (productsCache) return Promise.resolve(productsCache);
    if (productsPromise) return productsPromise;
    productsPromise = fetch('/products.json')
      .then((r) => r.json())
      .then((data) => {
        productsCache = data;
        return data;
      });
    return productsPromise;
  }

  const Cart = {
    getItems() {
      return readRaw();
    },

    count() {
      return readRaw().reduce((sum, i) => sum + i.quantity, 0);
    },

    addItem(productId, quantity) {
      quantity = quantity || 1;
      const items = readRaw();
      const existing = items.find((i) => i.product_id === productId);
      if (existing) {
        existing.quantity = Math.min(999, existing.quantity + quantity);
      } else {
        items.push({ product_id: productId, quantity: Math.min(999, quantity) });
      }
      writeRaw(items);
    },

    setQuantity(productId, quantity) {
      let items = readRaw();
      if (quantity <= 0) {
        items = items.filter((i) => i.product_id !== productId);
      } else {
        const existing = items.find((i) => i.product_id === productId);
        if (existing) existing.quantity = Math.min(999, quantity);
      }
      writeRaw(items);
    },

    removeItem(productId) {
      const items = readRaw().filter((i) => i.product_id !== productId);
      writeRaw(items);
    },

    clear() {
      writeRaw([]);
      sessionStorage.removeItem(CHECKOUT_KEY);
    },

    subscribe(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter((l) => l !== fn); };
    },

    /** Devuelve los items del carrito ya combinados con nombre/precio/imagen
     *  para PINTAR la UI. Esto es solo para mostrar — el backend jamás
     *  confía en estos números. */
    async enriched() {
      const data = await loadProducts();
      const byId = {};
      data.products.forEach((p) => { byId[p.id] = p; });

      const items = readRaw();
      const lines = items.map((i) => {
        const p = byId[i.product_id];
        if (!p) return null; // producto ya no existe en el catálogo
        const unitCents = (p.wholesale_cents && p.wholesale_min_qty && i.quantity >= p.wholesale_min_qty)
          ? p.wholesale_cents
          : p.price_cents;
        return {
          product_id: i.product_id,
          name: p.name,
          image: (p.images && p.images[0]) || null,
          quantity: i.quantity,
          unit_price_cents: unitCents,
          subtotal_cents: unitCents * i.quantity,
          out_of_stock: p.status === 'Agotado',
        };
      }).filter(Boolean);

      const subtotalCents = lines.reduce((s, l) => s + l.subtotal_cents, 0);
      return { lines, subtotalCents };
    },

    formatCents(cents) {
      const sign = cents < 0 ? '-' : '';
      const abs = Math.abs(cents);
      const soles = Math.floor(abs / 100);
      const cent = String(abs % 100).padStart(2, '0');
      return `${sign}S/ ${soles.toLocaleString('es-PE')}.${cent}`;
    },

    /** Clave de idempotencia estable para ESTE intento de checkout — se
     *  regenera solo cuando el carrito se vacía (compra completada o
     *  cancelada). Protege el botón "Pagar" de dobles clics/reintentos. */
    getCheckoutIdempotencyKey() {
      let key = sessionStorage.getItem(CHECKOUT_KEY);
      if (!key) {
        key = 'chk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(CHECKOUT_KEY, key);
      }
      return key;
    },

    rememberLastOrder(orderNumber, email) {
      sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ order_number: orderNumber, email }));
    },

    getLastOrder() {
      try {
        const raw = sessionStorage.getItem(LAST_ORDER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
  };

  window.Cart = Cart;
})(window);
