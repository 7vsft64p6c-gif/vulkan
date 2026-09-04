/**
 * cart-ui.js — inyecta el botón de carrito en el nav + el drawer lateral.
 * Depende de cart.js (window.Cart). No modifica el HTML de las páginas:
 * basta con incluir <script src="assets/cart.js"> y este archivo.
 */
(function () {
  'use strict';

  const REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STYLES = `
    .cart-trigger{
      position:relative; display:inline-flex; align-items:center; justify-content:center;
      width:40px; height:40px; border:1px solid rgba(244,238,228,.2); border-radius:2px;
      background:transparent; cursor:pointer; color:var(--paper); flex-shrink:0;
      transition:border-color .2s ease;
      margin-left:14px;
    }
    .cart-trigger:hover{ border-color:var(--ember); }
    .cart-trigger svg{ width:19px; height:19px; }
    .cart-badge{
      position:absolute; top:-7px; right:-7px; min-width:18px; height:18px; padding:0 4px;
      border-radius:9px; background:var(--lava); color:var(--obsidian);
      font-family:'JetBrains Mono',monospace; font-size:.66rem; font-weight:600;
      display:flex; align-items:center; justify-content:center; line-height:1;
    }
    .cart-badge.hidden{ display:none; }
    .cart-trigger.bump{ animation:cartBump .35s ease; }
    @keyframes cartBump{ 0%{transform:scale(1);} 40%{transform:scale(1.18);} 100%{transform:scale(1);} }
    @media (prefers-reduced-motion: reduce){ .cart-trigger.bump{ animation:none; } }

    .cart-overlay{
      position:fixed; inset:0; background:rgba(18,14,11,.6); z-index:98;
      opacity:0; pointer-events:none; transition:opacity .25s ease;
    }
    .cart-overlay.open{ opacity:1; pointer-events:auto; }

    .cart-drawer{
      position:fixed; top:0; right:0; bottom:0; width:min(400px,92vw); z-index:99;
      background:var(--obsidian-2); border-left:1px solid rgba(244,238,228,.12);
      display:flex; flex-direction:column;
      transform:translateX(100%); transition:transform .3s ease;
    }
    .cart-drawer.open{ transform:translateX(0); }
    @media (prefers-reduced-motion: reduce){ .cart-drawer{ transition:none; } .cart-overlay{ transition:none; } }

    .cart-drawer-head{
      padding:20px 22px; border-bottom:1px solid rgba(244,238,228,.1);
      display:flex; align-items:center; justify-content:space-between;
    }
    .cart-drawer-head h2{ font-family:'Space Grotesk',sans-serif; font-size:1.1rem; color:var(--paper); }
    .cart-close{ background:none; border:none; color:var(--paper-dim); font-size:1.4rem; cursor:pointer; line-height:1; }
    .cart-close:hover{ color:var(--lava); }

    .cart-items{ flex:1; overflow-y:auto; padding:10px 22px; }
    .cart-empty{ color:var(--smoke); font-family:'JetBrains Mono',monospace; font-size:.85rem; padding:40px 0; text-align:center; }

    .cart-line{
      display:flex; gap:12px; padding:14px 0; border-bottom:1px solid rgba(244,238,228,.08);
      opacity:1; transform:translateX(0); transition:opacity .2s ease, transform .2s ease, max-height .25s ease;
      max-height:200px; overflow:hidden;
    }
    .cart-line.removing{ opacity:0; transform:translateX(16px); max-height:0; padding-top:0; padding-bottom:0; }
    @media (prefers-reduced-motion: reduce){ .cart-line{ transition:none; } }

    .cart-line-img{
      width:54px; height:54px; background:var(--ash); border-radius:2px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; overflow:hidden;
    }
    .cart-line-img img{ width:100%; height:100%; object-fit:cover; }
    .cart-line-body{ flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
    .cart-line-name{ font-size:.86rem; color:var(--paper); line-height:1.3; }
    .cart-line-name.oos{ color:var(--smoke); text-decoration:line-through; }
    .cart-line-foot{ display:flex; align-items:center; justify-content:space-between; }
    .cart-qty{ display:flex; align-items:center; gap:8px; }
    .cart-qty button{
      width:22px; height:22px; border:1px solid rgba(244,238,228,.2); background:transparent;
      color:var(--paper); border-radius:2px; cursor:pointer; font-family:'JetBrains Mono',monospace;
      transition:transform .12s ease;
    }
    .cart-qty button:active{ transform:scale(.9); }
    @media (prefers-reduced-motion: reduce){ .cart-qty button:active{ transform:none; } }
    .cart-qty span{ font-family:'JetBrains Mono',monospace; font-size:.82rem; min-width:16px; text-align:center; }
    .cart-line-price{ font-family:'JetBrains Mono',monospace; font-size:.82rem; color:var(--ember); }
    .cart-remove{ background:none; border:none; color:var(--smoke); cursor:pointer; font-size:.75rem; text-decoration:underline; padding:0; }
    .cart-remove:hover{ color:var(--lava); }

    .cart-drawer-foot{ padding:18px 22px 22px; border-top:1px solid rgba(244,238,228,.1); }
    .cart-subtotal-row{ display:flex; justify-content:space-between; margin-bottom:14px; font-family:'JetBrains Mono',monospace; }
    .cart-subtotal-row .label{ color:var(--paper-dim); font-size:.85rem; }
    .cart-subtotal-row .value{ color:var(--paper); font-size:1.05rem; font-weight:600; }
    .cart-checkout-btn{
      display:block; width:100%; text-align:center; font-family:'JetBrains Mono',monospace;
      font-size:.85rem; letter-spacing:.03em; color:var(--obsidian); background:var(--lava);
      padding:13px; border-radius:2px; text-decoration:none; border:1px solid var(--lava);
      transition:box-shadow .2s ease, opacity .2s ease;
    }
    .cart-checkout-btn:hover{ box-shadow:var(--crack-glow); }
    .cart-checkout-btn.disabled{ opacity:.4; pointer-events:none; }

    .prod-add-cart{
      font-family:'JetBrains Mono',monospace; font-size:.72rem; letter-spacing:.03em;
      color:var(--obsidian); background:var(--ember); border:1px solid var(--ember);
      padding:8px 12px; border-radius:2px; cursor:pointer; transition:transform .15s ease, box-shadow .2s ease;
      flex:1;
    }
    .prod-add-cart:hover{ box-shadow:var(--crack-glow); }
    .prod-add-cart:active{ transform:scale(.97); }
    .prod-add-cart.added{ background:var(--paper); border-color:var(--paper); }
    .prod-add-cart:disabled{ opacity:.4; cursor:not-allowed; background:var(--smoke); border-color:var(--smoke); }
    @media (prefers-reduced-motion: reduce){ .prod-add-cart:active{ transform:none; } }
    .prod-actions{ display:flex; gap:8px; align-items:center; margin-top:10px; }
  `;

  function injectStyles() {
    const tag = document.createElement('style');
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }

  function cartIconSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
    </svg>`;
  }

  function buildTrigger() {
    const btn = document.createElement('button');
    btn.className = 'cart-trigger';
    btn.setAttribute('aria-label', 'Ver carrito');
    btn.innerHTML = cartIconSVG() + '<span class="cart-badge hidden" id="cartBadge">0</span>';
    return btn;
  }

  function mountTrigger() {
    const nav = document.querySelector('nav');
    if (!nav) return null;
    const trigger = buildTrigger();
    const menuToggle = nav.querySelector('.menu-toggle');
    if (menuToggle) {
      nav.insertBefore(trigger, menuToggle);
    } else {
      nav.appendChild(trigger);
    }
    return trigger;
  }

  function buildDrawer() {
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'cartOverlay';

    const drawer = document.createElement('div');
    drawer.className = 'cart-drawer';
    drawer.id = 'cartDrawer';
    drawer.innerHTML = `
      <div class="cart-drawer-head">
        <h2>Tu carrito</h2>
        <button class="cart-close" id="cartCloseBtn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-drawer-foot">
        <div class="cart-subtotal-row">
          <span class="label">Subtotal</span>
          <span class="value" id="cartSubtotal">S/ 0.00</span>
        </div>
        <a href="checkout.html" class="cart-checkout-btn" id="cartCheckoutBtn">Continuar al pago</a>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    return { overlay, drawer };
  }

  function lineHTML(line) {
    const img = line.image
      ? `<img src="${line.image}" alt="">`
      : '';
    const nameClass = line.out_of_stock ? 'cart-line-name oos' : 'cart-line-name';
    return `
      <div class="cart-line" data-id="${line.product_id}">
        <div class="cart-line-img">${img}</div>
        <div class="cart-line-body">
          <div class="${nameClass}">${line.name}${line.out_of_stock ? ' (agotado)' : ''}</div>
          <div class="cart-line-foot">
            <div class="cart-qty">
              <button data-action="dec" aria-label="Restar">-</button>
              <span>${line.quantity}</span>
              <button data-action="inc" aria-label="Sumar">+</button>
            </div>
            <span class="cart-line-price">${Cart.formatCents(line.subtotal_cents)}</span>
          </div>
          <button class="cart-remove" data-action="remove">Quitar</button>
        </div>
      </div>`;
  }

  async function renderDrawer(itemsEl, subtotalEl, checkoutBtn) {
    const { lines, subtotalCents } = await Cart.enriched();
    if (lines.length === 0) {
      itemsEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
      checkoutBtn.classList.add('disabled');
    } else {
      itemsEl.innerHTML = lines.map(lineHTML).join('');
      const hasOOS = lines.some((l) => l.out_of_stock);
      checkoutBtn.classList.toggle('disabled', hasOOS);
    }
    subtotalEl.textContent = Cart.formatCents(subtotalCents);
  }

  function updateBadge(badgeEl, triggerEl) {
    const count = Cart.count();
    badgeEl.textContent = count > 99 ? '99+' : String(count);
    badgeEl.classList.toggle('hidden', count === 0);
    if (!REDUCE_MOTION) {
      triggerEl.classList.remove('bump');
      // reflow para poder re-disparar la animación
      void triggerEl.offsetWidth;
      triggerEl.classList.add('bump');
    }
  }

  function wireAddToCartButtons() {
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.prod-add-cart');
      if (!btn || btn.disabled) return;
      const id = btn.dataset.id;
      if (!id) return;

      Cart.addItem(id, 1);

      const original = btn.textContent;
      btn.textContent = '✓ Agregado';
      btn.classList.add('added');
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('added');
        btn.disabled = false;
      }, 900);
    });
  }

  function init() {
    injectStyles();
    const trigger = mountTrigger();
    if (!trigger) return;
    const { overlay, drawer } = buildDrawer();

    const badge = document.getElementById('cartBadge');
    const itemsEl = document.getElementById('cartItems');
    const subtotalEl = document.getElementById('cartSubtotal');
    const checkoutBtn = document.getElementById('cartCheckoutBtn');
    const closeBtn = document.getElementById('cartCloseBtn');

    function open() {
      overlay.classList.add('open');
      drawer.classList.add('open');
      renderDrawer(itemsEl, subtotalEl, checkoutBtn);
    }
    function close() {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
    }

    trigger.addEventListener('click', open);
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    itemsEl.addEventListener('click', (e) => {
      const line = e.target.closest('.cart-line');
      if (!line) return;
      const id = line.dataset.id;
      const action = e.target.dataset.action;
      if (!action) return;

      if (action === 'remove') {
        line.classList.add('removing');
        setTimeout(() => Cart.removeItem(id), REDUCE_MOTION ? 0 : 220);
        return;
      }
      const items = Cart.getItems();
      const current = items.find((i) => i.product_id === id);
      if (!current) return;
      if (action === 'inc') Cart.setQuantity(id, current.quantity + 1);
      if (action === 'dec') Cart.setQuantity(id, current.quantity - 1);
    });

    Cart.subscribe(() => {
      updateBadge(badge, trigger);
      if (drawer.classList.contains('open')) {
        renderDrawer(itemsEl, subtotalEl, checkoutBtn);
      }
    });

    updateBadge(badge, trigger);
    wireAddToCartButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
