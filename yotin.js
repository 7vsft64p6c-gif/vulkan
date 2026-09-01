/**
 * yotin.js — YOTIN, el asistente virtual de VULKÁN.
 * Se inyecta solo (igual que cart-ui.js): basta con incluir
 * <script src="assets/yotin.js"> después de cart.js y cart-ui.js.
 * No modifica el HTML de las páginas ni el carrito existente.
 *
 * QUÉ HACE ESTE ARCHIVO:
 *  1. Dibuja la burbuja + el panel de chat.
 *  2. Carga products.json (misma fuente de verdad que catalogo.html) para
 *     tener precios/stock/variantes SIEMPRE actuales — nunca inventa datos.
 *  3. Calcula el precio mayorista 3+ POR PRODUCTO de forma independiente
 *     (ver calcLinePrice) — nunca suma productos distintos para activarlo.
 *  4. Envía el mensaje del cliente + el contexto de catálogo relevante a
 *     tu backend (POST /api/yotin). YOTIN (el modelo de lenguaje) vive en
 *     ese backend, no aquí — una API key de IA nunca debe ir en JS de
 *     cliente. Ver api-yotin-example.js para un backend de referencia.
 *  5. Si el backend confirma una acción "add_to_cart", este archivo es
 *     quien realmente la ejecuta llamando a Cart.addItem(...) (tu carrito
 *     real). Solo si esa llamada tiene éxito se muestra "lo añadí al
 *     carrito" — nunca se simula.
 */
(function () {
  'use strict';

  /* =====================================================================
     CONFIGURACIÓN EDITABLE — datos confirmados de VULKÁN.
     Deja en null/[] lo que todavía no esté confirmado: YOTIN nunca debe
     inventar sobre esto (secciones 26-29-40 del prompt maestro).
     ===================================================================== */
  const YOTIN_CONFIG = {
    endpoint: '/api/yotin', // backend que llama al modelo (ver api-yotin-example.js)
    nombre: 'YOTIN',
    envios: {
      cobertura: 'Arequipa y provincias',
      empresas: ['Shalom'],
      costo: null,
      envioGratis: null,
      recojoPersonal: null,
      lugarRecojo: null,
    },
    pagos: {
      yape: null,
      plin: null,
      transferencia: null,
      tarjeta: null,
      contraEntrega: null,
    },
    garantia: {
      disponible: null,
      duracion: null,
      cobertura: null,
      exclusiones: null,
      proceso: null,
    },
    cambiosDevoluciones: {
      cambios: null,
      devoluciones: null,
      plazo: null,
      condiciones: null,
    },
    atencionHumana: {
      correo: 'stevebunnies62@gmail.com',
      whatsapp: null,
      telefono: null,
      horario: 'Puedes escribir a cualquier hora',
      redes: [],
    },
    // Productos ganadores (sección 14 del prompt maestro) — solo para uso
    // en recomendaciones, nunca se etiquetan automáticamente como "más vendido".
    ganadores: [
      'p021-airpods-pro-3ra-generacion-anc', 'p029-charge6-jbl', 'p014-airpods-max-calidad-a1',
      'p010-magsafe-20-000-mah', 'p027-go4-pro-jbl', 'p028-boombox4-mini-jbl',
      'p056-tour-pro6-jbl', 'p066-tune-760bt-jbl', 'p076-watch-10-ultra', 'p085-apple-watch',
      'p086-h26-ultra', 'p087-microwear-s11', 'p088-m99-con-chip', 'p091-h100-con-chip',
      'p093-lentes-inteligentes', 'p110-e88-drone', 'p148-drovi-50-000-mah', 'p132-led-light-kit',
    ],
  };

  /* =====================================================================
     MOTOR DE CATÁLOGO — misma fuente que catalogo.html (products.json).
     No hardcodea precios ni la regla de mayorista en ningún otro lugar.
     ===================================================================== */
  let CATALOG = { categories: {}, products: [] };
  let PRODUCTS_BY_ID = {};

  async function loadCatalog() {
    try {
      const res = await fetch('/products.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      CATALOG = await res.json();
      PRODUCTS_BY_ID = {};
      CATALOG.products.forEach((p) => { PRODUCTS_BY_ID[p.id] = p; });
    } catch (err) {
      console.error('YOTIN: no se pudo cargar products.json', err);
    }
  }

  // REGLA DE PRECIO MAYORISTA 3+ — se calcula por producto, de forma
  // independiente. Nunca sumar cantidades de productos distintos para
  // activarla. wholesale_min_qty viene de products.json (editable ahí,
  // sin tocar esta función).
  function calcLinePrice(product, quantity) {
    const qualifies = product.wholesale_cents != null
      && quantity >= (product.wholesale_min_qty || 3);
    const unitCents = qualifies ? product.wholesale_cents : product.price_cents;
    return {
      unitCents,
      unitDisplay: qualifies ? product.wholesale_display : product.price_display,
      totalCents: unitCents * quantity,
      appliedWholesale: qualifies,
    };
  }

  // Búsqueda simple por nombre/categoría para pasarle a YOTIN solo los
  // productos relevantes al mensaje del cliente (no los 148 en cada turno).
  function searchCatalog(query, limit) {
    limit = limit || 8;
    const q = (query || '').toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored = CATALOG.products
      .map((p) => {
        const hay = (p.name + ' ' + (CATALOG.categories[p.category] || '')).toLowerCase();
        const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.p);
    return scored;
  }

  function toContextProduct(p) {
    return {
      id: p.id,
      name: p.name,
      category: CATALOG.categories[p.category] || p.category,
      price_display: p.price_display,
      wholesale_display: p.wholesale_display,
      wholesale_min_qty: p.wholesale_min_qty,
      status: p.status, // null = disponible
      desc: p.desc || null,
      colores: (p.colores || []).map((c) => c.nombre),
      modelos: p.modelos || [],
      ganador: YOTIN_CONFIG.ganadores.includes(p.id),
    };
  }

  /* =====================================================================
     UI — mismo lenguaje visual que el resto del sitio (variables CSS
     definidas en :root del HTML donde se cargue este script).
     ===================================================================== */
  const STYLES = `
    .yotin-fab{
      position:fixed; right:22px; bottom:22px; z-index:120;
      width:58px; height:58px; border-radius:50%; border:1px solid rgba(255,90,31,.5);
      background:var(--lava); color:var(--obsidian); cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 18px rgba(255,90,31,.35);
      transition:box-shadow .2s ease, transform .15s ease;
    }
    .yotin-fab:hover{ box-shadow:var(--crack-glow); }
    .yotin-fab:active{ transform:scale(.95); }
    .yotin-fab svg{ width:26px; height:26px; }
    .yotin-fab .yotin-dot{
      position:absolute; top:-2px; right:-2px; width:12px; height:12px; border-radius:50%;
      background:var(--ember); border:2px solid var(--obsidian);
    }
    @media (prefers-reduced-motion: reduce){ .yotin-fab{ transition:none; } }

    .yotin-panel{
      position:fixed; right:22px; bottom:92px; z-index:121;
      width:min(370px,90vw); height:min(560px,74vh);
      background:var(--obsidian-2); border:1px solid rgba(244,238,228,.14);
      border-radius:4px; display:flex; flex-direction:column; overflow:hidden;
      transform:translateY(16px) scale(.97); opacity:0; pointer-events:none;
      transition:transform .22s ease, opacity .2s ease;
      box-shadow:0 12px 40px rgba(0,0,0,.5);
    }
    .yotin-panel.open{ transform:translateY(0) scale(1); opacity:1; pointer-events:auto; }
    @media (prefers-reduced-motion: reduce){ .yotin-panel{ transition:none; } }
    @media(max-width:480px){ .yotin-panel{ right:10px; bottom:82px; width:94vw; height:72vh; } }

    .yotin-head{
      padding:14px 16px; border-bottom:1px solid rgba(244,238,228,.1);
      display:flex; align-items:center; justify-content:space-between; background:var(--obsidian);
    }
    .yotin-head-title{ display:flex; align-items:center; gap:10px; }
    .yotin-avatar{
      width:30px; height:30px; border-radius:50%; background:var(--lava);
      display:flex; align-items:center; justify-content:center; color:var(--obsidian);
      font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:.8rem; flex-shrink:0;
    }
    .yotin-head h3{ font-family:'Space Grotesk',sans-serif; font-size:.95rem; color:var(--paper); }
    .yotin-head p{ font-family:'JetBrains Mono',monospace; font-size:.66rem; color:var(--smoke); }
    .yotin-panel-close{ background:none; border:none; color:var(--paper-dim); font-size:1.3rem; cursor:pointer; line-height:1; }
    .yotin-panel-close:hover{ color:var(--lava); }

    .yotin-messages{ flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
    .yotin-msg{ max-width:85%; font-size:.86rem; line-height:1.5; padding:10px 13px; border-radius:10px; white-space:pre-wrap; }
    .yotin-msg.bot{ align-self:flex-start; background:var(--ash); color:var(--paper); border-bottom-left-radius:2px; }
    .yotin-msg.user{ align-self:flex-end; background:var(--lava); color:var(--obsidian); border-bottom-right-radius:2px; }
    .yotin-msg.system{
      align-self:center; background:transparent; color:var(--smoke);
      font-family:'JetBrains Mono',monospace; font-size:.7rem; text-align:center; padding:4px 0;
    }
    .yotin-typing{ align-self:flex-start; display:flex; gap:4px; padding:10px 13px; }
    .yotin-typing span{ width:6px; height:6px; border-radius:50%; background:var(--smoke); animation:yotinBlink 1.2s infinite ease-in-out; }
    .yotin-typing span:nth-child(2){ animation-delay:.2s; }
    .yotin-typing span:nth-child(3){ animation-delay:.4s; }
    @keyframes yotinBlink{ 0%,80%,100%{opacity:.3;} 40%{opacity:1;} }
    @media (prefers-reduced-motion: reduce){ .yotin-typing span{ animation:none; opacity:.7; } }

    .yotin-inputrow{ display:flex; gap:8px; padding:12px; border-top:1px solid rgba(244,238,228,.1); }
    .yotin-inputrow input{
      flex:1; background:var(--obsidian); border:1px solid rgba(244,238,228,.15); color:var(--paper);
      font-family:'Inter',sans-serif; font-size:.85rem; padding:10px 12px; border-radius:20px; outline:none;
      transition:border-color .2s ease;
    }
    .yotin-inputrow input:focus{ border-color:var(--ember); }
    .yotin-send{
      width:38px; height:38px; border-radius:50%; border:1px solid var(--lava); background:var(--lava);
      color:var(--obsidian); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .yotin-send:hover{ box-shadow:var(--crack-glow); }
    .yotin-send:disabled{ opacity:.4; cursor:not-allowed; }
  `;

  function injectStyles() {
    const tag = document.createElement('style');
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }

  function chatIconSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
    </svg>`;
  }

  function buildDom() {
    const fab = document.createElement('button');
    fab.className = 'yotin-fab';
    fab.setAttribute('aria-label', 'Abrir chat con YOTIN');
    fab.innerHTML = chatIconSVG() + '<span class="yotin-dot"></span>';

    const panel = document.createElement('div');
    panel.className = 'yotin-panel';
    panel.innerHTML = `
      <div class="yotin-head">
        <div class="yotin-head-title">
          <div class="yotin-avatar">Y</div>
          <div>
            <h3>${YOTIN_CONFIG.nombre}</h3>
            <p>Asistente de VULKÁN</p>
          </div>
        </div>
        <button class="yotin-panel-close" id="yotinClose" aria-label="Cerrar">&times;</button>
      </div>
      <div class="yotin-messages" id="yotinMessages"></div>
      <div class="yotin-inputrow">
        <input type="text" id="yotinInput" placeholder="Pregúntale a YOTIN..." autocomplete="off">
        <button class="yotin-send" id="yotinSend" aria-label="Enviar">➤</button>
      </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    return { fab, panel };
  }

  function addMessage(container, role, text) {
    const el = document.createElement('div');
    el.className = 'yotin-msg ' + role;
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function addSystemNote(container, text) {
    const el = document.createElement('div');
    el.className = 'yotin-msg system';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(container) {
    const el = document.createElement('div');
    el.className = 'yotin-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  const GREETING = `Soy ${YOTIN_CONFIG.nombre}, el asistente de la tienda 😊. Puedo ayudarte con productos tecnológicos, compatibilidad, características, recomendaciones y compras.`;

  let history = []; // [{role:'user'|'assistant', content:string}]

  // Ejecuta REALMENTE la acción confirmada por el backend. Nunca se
  // muestra "lo añadí al carrito" sin que esta función haya tenido éxito.
  function executeAction(action, messagesEl) {
    if (!action || action.type !== 'add_to_cart') return;
    const product = PRODUCTS_BY_ID[action.product_id];
    if (!product) {
      addSystemNote(messagesEl, 'No pude ubicar ese producto en el catálogo actual.');
      return;
    }
    if (product.status) {
      addSystemNote(messagesEl, `${product.name} aparece como agotado — no se añadió al carrito.`);
      return;
    }
    if (!window.Cart || typeof Cart.addItem !== 'function') {
      addSystemNote(messagesEl, 'El carrito no está disponible en esta página.');
      return;
    }
    const qty = Math.max(1, Number(action.quantity) || 1);
    Cart.addItem(product.id, qty);
    const price = calcLinePrice(product, qty);
    addSystemNote(messagesEl, `✓ ${product.name} ×${qty} añadido al carrito (${price.unitDisplay} c/u${price.appliedWholesale ? ', precio mayorista 3+' : ''}).`);
  }

  async function sendMessage(text, messagesEl) {
    addMessage(messagesEl, 'user', text);
    history.push({ role: 'user', content: text });

    const typingEl = showTyping(messagesEl);
    const relevant = searchCatalog(text).map(toContextProduct);

    let data;
    try {
      const res = await fetch(YOTIN_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-12),
          catalog_context: relevant,
          config: YOTIN_CONFIG,
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      typingEl.remove();
      addMessage(messagesEl, 'bot', 'No pude conectarme en este momento. Puedes escribirnos directo a ' + YOTIN_CONFIG.atencionHumana.correo + '.');
      console.error('YOTIN backend error:', err);
      return;
    }

    typingEl.remove();
    const reply = data && data.reply ? data.reply : 'No tengo esa información confirmada en este momento.';
    addMessage(messagesEl, 'bot', reply);
    history.push({ role: 'assistant', content: reply });

    if (data && data.action) executeAction(data.action, messagesEl);
  }

  function init() {
    injectStyles();
    const { fab, panel } = buildDom();
    const messagesEl = panel.querySelector('#yotinMessages');
    const inputEl = panel.querySelector('#yotinInput');
    const sendBtn = panel.querySelector('#yotinSend');
    const closeBtn = panel.querySelector('#yotinClose');
    let greeted = false;

    function open() {
      panel.classList.add('open');
      if (!greeted) {
        addMessage(messagesEl, 'bot', GREETING);
        greeted = true;
      }
      inputEl.focus();
    }
    function close() { panel.classList.remove('open'); }

    fab.addEventListener('click', () => {
      panel.classList.contains('open') ? close() : open();
    });
    closeBtn.addEventListener('click', close);

    function submit() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      sendMessage(text, messagesEl);
    }
    sendBtn.addEventListener('click', submit);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    loadCatalog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
