/* Componentes de interface: ícones, modais, confirmação, avisos, impressão */
(function (root) {
  'use strict';
  const U = root.U;
  const UI = {};

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    req: '<path d="M8 3h8l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5M10 12h7M10 16h7"/>',
    quote: '<path d="M4 5h16v14H4z"/><path d="M4 10h16M10 5v14"/>',
    order: '<path d="M6 2l1.5 4h11l-2 8H8.5L6 2H3"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    buyer: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5M16 4h6M19 1v6"/>',
    cc: '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><path d="M6 14h12v7H6z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>',
    whats: '<path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    wand: '<path d="M4 20L16 8M14 4v3M18 8h3M17 5l2-2M12 2v1"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  UI.icon = function (name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  };

  UI.$ = (sel, el) => (el || document).querySelector(sel);
  UI.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  UI.setHeader = function (title, crumb, actions) {
    UI.$('#title').textContent = title;
    UI.$('#crumb').textContent = crumb || '';
    UI.$('#top-acts').innerHTML = actions || '';
    document.title = title + ' · Brasmic Compras';
  };

  UI.render = function (html) {
    const v = UI.$('#view');
    v.innerHTML = (root.S.config().exemplo ? '<div class="demo-banner">' + UI.icon('star') + ' Você está vendo dados de exemplo para conhecer o sistema. <button class="btn sm" data-go="#/config">Limpar exemplos e começar</button></div>' : '') + html;
    return v;
  };

  UI.pill = function (map, key) {
    const s = map[key] || { t: key || '—', c: 'neutral' };
    return '<span class="pill ' + s.c + '">' + U.esc(s.t) + '</span>';
  };

  UI.destinoTag = function (d) {
    return d === 'estoque' ? '<span class="tag est">Estoque</span>' : '<span class="tag apl">Aplicação direta</span>';
  };

  UI.options = function (list, selected, labelFn, placeholder) {
    let h = placeholder !== undefined ? '<option value="">' + U.esc(placeholder) + '</option>' : '';
    list.forEach(x => {
      const v = typeof x === 'object' ? x.id : x;
      const l = labelFn ? labelFn(x) : (typeof x === 'object' ? x.nome : x);
      h += '<option value="' + U.esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    });
    return h;
  };

  UI.unitOptions = function (sel) {
    return UI.options(root.P.UNITS, sel || 'UN');
  };

  UI.empty = function (title, text, action) {
    return '<div class="empty"><b>' + U.esc(title) + '</b><span>' + U.esc(text || '') + '</span>' + (action || '') + '</div>';
  };

  /* ---------- Modal ---------- */
  UI.modal = function (opts) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML = '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-label="' + U.esc(opts.title) + '">' +
      '<div class="hd"><h2>' + U.esc(opts.title) + '</h2><button class="btn icon ghost" data-close aria-label="Fechar">' + UI.icon('x') + '</button></div>' +
      '<div class="bd">' + (opts.body || '') + '</div>' +
      (opts.buttons ? '<div class="ft">' + opts.buttons.map((b, i) => '<button class="btn ' + (b.cls || '') + '" data-btn="' + i + '">' + (b.icon ? UI.icon(b.icon) : '') + U.esc(b.label) + '</button>').join('') + '</div>' : '') +
      '</div>';
    UI.$('#modals').appendChild(wrap);
    const api = {
      el: wrap.querySelector('.modal'),
      close: () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    };
    const onKey = e => { if (e.key === 'Escape' && UI.$('#modals').lastElementChild === wrap) api.close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap && !opts.sticky) api.close(); });
    wrap.querySelector('[data-close]').onclick = api.close;
    (opts.buttons || []).forEach((b, i) => {
      wrap.querySelector('[data-btn="' + i + '"]').onclick = async () => {
        if (!b.action) return api.close();
        const r = await b.action(api);
        if (r !== false) api.close();
      };
    });
    if (opts.onMount) opts.onMount(api.el, api);
    const first = api.el.querySelector('.bd input:not([type=hidden]):not([type=checkbox]), .bd select, .bd textarea');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
    return api;
  };

  UI.confirm = function (msg, okLabel, danger) {
    return new Promise(resolve => {
      let done = false;
      UI.modal({
        title: 'Confirmar', size: 'narrow', body: '<p style="margin:0">' + U.esc(msg) + '</p>',
        buttons: [
          { label: 'Voltar', action: () => { done = true; resolve(false); } },
          { label: okLabel || 'Confirmar', cls: danger === false ? 'pri' : 'danger', action: () => { done = true; resolve(true); } }
        ],
        onClose: () => { if (!done) resolve(false); }
      });
    });
  };

  UI.toast = function (msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    UI.$('#toasts').appendChild(t);
    setTimeout(() => t.remove(), type === 'bad' ? 6000 : 3500);
  };

  UI.progress = function (title) {
    const m = UI.modal({
      title: title, size: 'narrow', sticky: true, noFocus: true,
      body: '<p class="muted small" id="pg-msg" style="margin:0">Iniciando…</p><div class="progress"><i id="pg-bar"></i></div>'
    });
    return {
      set: (pct, msg) => {
        if (msg) m.el.querySelector('#pg-msg').textContent = msg;
        if (pct !== null && pct !== undefined) m.el.querySelector('#pg-bar').style.width = pct + '%';
      },
      close: m.close
    };
  };

  UI.print = function (html) {
    const pa = UI.$('#print-area');
    pa.innerHTML = html;
    const imgs = UI.$$('img', pa);
    Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => {
      window.print();
    });
  };

  UI.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); UI.toast('Copiado para a área de transferência', 'ok'); }
    catch (e) { UI.modal({ title: 'Copie o texto', body: '<textarea rows="10" readonly>' + U.esc(text) + '</textarea>' }); }
  };

  /* Lê um arquivo escolhido pelo usuário */
  UI.pickFile = function (accept, multiple) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept || '';
      inp.multiple = !!multiple;
      inp.onchange = () => resolve(Array.from(inp.files || []));
      inp.click();
    });
  };

  UI.attachList = function (anexos, removable) {
    if (!anexos || !anexos.length) return '<span class="muted small">Nenhum anexo</span>';
    return '<div class="attach">' + anexos.map(a =>
      '<a href="#" data-open-att="' + a.id + '" title="Abrir ' + U.esc(a.nome) + '">' +
      (/^image\//.test(a.tipo) || /^data:image/.test(a.dataUrl) ? '<img src="' + a.dataUrl + '" alt="">' : UI.icon('req')) +
      U.esc(a.nome) + (removable ? ' <span data-del-att="' + a.id + '" title="Remover" aria-label="Remover anexo">✕</span>' : '') + '</a>').join('') + '</div>';
  };

  UI.openAttachment = function (a) {
    if (!a) return;
    if (/^image\//.test(a.tipo) || /^data:image/.test(a.dataUrl)) {
      UI.modal({ title: a.nome, size: 'wide', body: '<img src="' + a.dataUrl + '" alt="' + U.esc(a.nome) + '" style="width:100%;height:auto">' });
      return;
    }
    fetch(a.dataUrl).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      const w = window.open(url, '_blank');
      if (!w) root.C.download(a.nome, b);
    });
  };

  root.UI = UI;
})(window);
