// Kayıp Kıta — browser prototype: you vs 3 bots, rules v1.6 (values as printed on the cards).
(() => {
  'use strict';
  const { cards: ALL, characters: CHARS, elements: ELS } = window.KK;
  const $ = (s) => document.querySelector(s);
  const img = (c) => `../assets/cards/${c.id}.webp`;
  const hd = (c) => `../assets/cards-hd/${c.id}.webp`;
  const BACK = { monster: '../assets/backs/monster.webp', habitat: '../assets/backs/habitat.webp', attack: '../assets/backs/attack.webp', fate: '../assets/backs/fate.webp' };
  const ELC = { orman: 'var(--orman)', su: 'var(--su)', yer: 'var(--yer)', gok: 'var(--gok)' };
  const elName = (e) => ELS[e]?.name ?? 'Nötr';
  const d20 = () => 1 + Math.floor(Math.random() * 20);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ---------- Decks ----------
  class Deck {
    constructor(cards) {
      this.pile = shuffle(cards.slice());
      this.discard = [];
    }
    refill() {
      if (!this.pile.length) {
        this.pile = shuffle(this.discard);
        this.discard = [];
      }
    }
    draw() {
      this.refill();
      return this.pile.pop();
    }
    peek() {
      this.refill();
      return this.pile[this.pile.length - 1];
    }
    toss(c) {
      if (c) this.discard.push(c);
    }
  }

  // ---------- State ----------
  let G = null;
  // ?auto: the human seat is played by the bot logic (headless smoke test)
  const AUTO = /[?&]auto/.test(location.search);
  let speed = AUTO ? 200 : +(store.get('kk-speed') || 1);
  if (![1, 2, 4, 200].includes(speed)) speed = 1;
  if (AUTO) addEventListener('error', (e) => { document.body.dataset.err = String(e.message); });
  let gen = 0; // bumps when a game is abandoned, so its pending waits never resolve
  let paused = false;
  const wait = (ms) => {
    const g = gen;
    return new Promise((resolve) => {
      const tick = () => {
        if (g !== gen) return;
        if (paused) return setTimeout(tick, 120);
        resolve();
      };
      setTimeout(tick, ms / speed);
    });
  };
  const FIFTEEN = new Set(['evrim', 'vudu', 'beslenme']);

  function newGame(charId, target) {
    const order = [charId, ...CHARS.map((c) => c.id).filter((x) => x !== charId)];
    const players = order.map((id, i) => {
      const ch = CHARS.find((c) => c.id === id);
      return {
        i,
        human: i === 0,
        ch,
        name: i === 0 ? 'Sen' : ch.name,
        level: 10,
        hand: [],
        wounded: false,
        fledLast: false,
        dieMod: 0, // this turn's d20 modifier (Kör Talih / Şanslı Kaçış)
        nextDie: 0,
        oneCard: false, // Kırık Kol
        lastHabitat: false, // Yaralı Bacak
        noSab: 0, // Eylemsizlik (own turns)
        wins: 0,
        losses: 0,
      };
    });
    G = {
      target,
      players,
      turn: Math.floor(Math.random() * 4),
      round: 1,
      monsters: new Deck(ALL.filter((c) => c.type === 'monster')),
      habitats: new Deck(ALL.filter((c) => c.type === 'habitat')),
      attack: new Deck(ALL.filter((c) => c.type === 'weapon' || c.type === 'sabotage')),
      fate: new Deck(ALL.filter((c) => c.type === 'fate')),
      prevHabitat: null,
      t: null, // table of the current turn
      over: false,
    };
    for (const p of players) for (let k = 0; k < 5; k++) p.hand.push(G.attack.draw());
  }

  // ---------- Maths ----------
  const weaponVal = (c, habEl, noBonus) => (c.type === 'weapon' ? c.dmg + (c.el && c.el === habEl && !noBonus ? c.bonus : 0) : 0);
  const homeBonus = (t) => (t.mon && t.hab && t.mon.el === t.hab.el ? 3 : 0);
  const charBonus = (p, t) => (!p.wounded && !t.hafiza && p.ch.el === t.mon.el ? 1 : 0);
  const fullMatch = (p, t) => !p.wounded && !t.hafiza && p.ch.el === t.mon.el && t.mon.el === t.hab.el;

  /** P(adventurer total > monster total) for a fixed card difference, both d20. */
  function pWin(diff) {
    let w = 0;
    for (let a = 1; a <= 20; a++) for (let m = 1; m <= 20; m++) if (a + diff > m) w++;
    return w / 400;
  }

  function bestPair(p, habEl) {
    return p.hand
      .map((c) => ({ c, v: weaponVal(c, habEl) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, p.oneCard ? 1 : 2);
  }

  const who = (p) => (p.human ? 'Sen' : p.name);
  const nameB = (p) => `<b>${who(p)}</b>`;

  // ============================================================
  // VIEW
  // ============================================================
  const RING = 2 * Math.PI * 21;
  function ava(p, big = false) {
    const pct = Math.max(0, Math.min(1, p.level / G.target));
    return `<div class="ava ${big ? 'big' : ''}" style="--c:${ELC[p.ch.el]}">
      <svg class="ring" viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="21" /><circle class="fg" cx="24" cy="24" r="21" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - pct)}" /></svg>
      <img src="../assets/chars/${p.ch.id}.webp" alt="" />
      <span class="lv">${p.level}</span>
    </div>`;
  }

  function statusChips(p) {
    const out = [];
    if (p.wounded) out.push('<span class="chip chip-bad">Yaralı</span>');
    if (p.oneCard) out.push('<span class="chip chip-dim">Kırık kol</span>');
    if (p.lastHabitat) out.push('<span class="chip chip-dim">Topal</span>');
    if (p.noSab > 0) out.push('<span class="chip chip-dim">Sabotaj yok</span>');
    const die = G.turn === p.i ? p.dieMod : p.nextDie;
    if (die) out.push(`<span class="chip ${die > 0 ? 'chip-gold' : 'chip-bad'}">Zar ${die > 0 ? '+' : ''}${die}</span>`);
    return out.join('');
  }

  function renderPlayers() {
    $('#seats').innerHTML = G.players
      .slice(1)
      .map((p) => `<div class="seat ${G.turn === p.i && !G.over ? 'active' : ''} ${p.wounded ? 'wounded' : ''}" data-i="${p.i}">
          ${ava(p)}
          <div class="seat-tx"><b>${p.name}</b>
            <span class="seat-sub"><svg><use href="#i-cards" /></svg>${p.hand.length}${statusChips(p) ? ' ' + statusChips(p) : ''}</span>
          </div>
          <span class="turn-tag">Sırası</span>
        </div>`)
      .join('');
    const me = G.players[0];
    $('#me').className = `me ${G.turn === 0 && !G.over ? 'active' : ''}`;
    $('#me').dataset.i = 0;
    $('#me').innerHTML = `${ava(me, true)}<div class="me-tx"><b>${me.ch.name}</b><span>${elName(me.ch.el)} · hedef ${G.target}${statusChips(me) ? ' ' + statusChips(me) : ''}</span></div>`;
  }

  function seatEl(p) {
    return p.human ? $('#me .ava') : document.querySelector(`.seat[data-i="${p.i}"] .ava`);
  }

  function floatDelta(p, d) {
    const el = seatEl(p);
    if (!el || !d || AUTO) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = `delta ${d > 0 ? 'up' : 'down'}`;
    s.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
    s.style.left = r.left + r.width / 2 + 'px';
    s.style.top = r.top - 6 + 'px';
    $('#fx').appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }

  /** A card image flies from one rect to the target element (purely visual). */
  function fly(from, toEl, src, { fromRot = 0, dur = 480 } = {}) {
    if (AUTO || !from || !toEl) return Promise.resolve();
    const to = toEl.getBoundingClientRect();
    if (!to.width) return Promise.resolve();
    const f = from instanceof Element ? from.getBoundingClientRect() : from;
    if (!f.width) return Promise.resolve();
    const im = document.createElement('img');
    im.className = 'fly';
    im.src = src;
    Object.assign(im.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
    $('#fx').appendChild(im);
    const sx = f.width / to.width;
    const dx = f.left + f.width / 2 - (to.left + to.width / 2);
    const dy = f.top + f.height / 2 - (to.top + to.height / 2);
    const a = im.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}) rotate(${fromRot}deg)`, opacity: 0.9 },
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      ],
      { duration: dur / Math.min(speed, 2), easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return a.finished.then(() => im.remove(), () => im.remove());
  }

  function setPhase(name) {
    const order = ['track', 'decide', 'duel', 'result', 'rest'];
    const k = order.indexOf(name);
    document.querySelectorAll('#phase li').forEach((li, i) => {
      li.classList.toggle('on', i === k);
      li.classList.toggle('done', k >= 0 && i < k);
    });
  }

  let realmLayer = 0;
  let realmNow = null;
  function setRealm(el) {
    if (el === realmNow) return;
    realmNow = el;
    const layers = document.querySelectorAll('#arenaBg i');
    realmLayer = 1 - realmLayer;
    if (el) layers[realmLayer].style.backgroundImage = `url('../assets/realms/${el}.webp')`;
    layers[realmLayer].classList.toggle('on', !!el);
    layers[1 - realmLayer].classList.remove('on');
  }

  function renderDecks() {
    const row = (k, d, label) =>
      `<div class="deck" title="${label}" aria-label="${label}: ${d.pile.length} kart" id="deck-${k}">
        ${d.pile.length ? `<i style="background-image:url('${BACK[k]}')"></i>`.repeat(Math.min(3, Math.ceil(d.pile.length / 6))) : ''}
        <span>${d.pile.length}</span></div>`;
    $('#decks').innerHTML = row('habitat', G.habitats, 'Habitat destesi') + row('monster', G.monsters, 'Canavar destesi') + row('attack', G.attack, 'Saldırı destesi') + row('fate', G.fate, 'Kader destesi');
  }

  function setSlot(el, card, tags = '', animate = false) {
    el.querySelectorAll('.face,.tags').forEach((x) => x.remove());
    el.querySelector('.slot-ph').hidden = !!card;
    if (!card) return;
    el.insertAdjacentHTML('beforeend', `<img class="face ${animate ? 'flip-in' : ''}" src="${img(card)}" alt="${card.name}" data-id="${card.id}" />${tags ? `<div class="tags">${tags}</div>` : ''}`);
  }

  function renderTable(animate = {}) {
    const t = G.t;
    setSlot($('#slotHab'), t?.hab, t?.hab ? `<span class="tag tag-el" style="--c:${ELC[t.hab.el]}">${elName(t.hab.el)}${t.habBorrowed ? ' · önceki' : ''}</span>` : '', animate.hab);
    const mt = t?.mon
      ? `<span class="tag tag-pow">Güç ${t.mon.power}</span>${homeBonus(t) ? '<span class="tag tag-home">+3 yuvasında</span>' : ''}<span class="tag tag-el" style="--c:${ELC[t.mon.el]}">−${t.mon.penalty}</span>`
      : '';
    setSlot($('#slotMon'), t?.mon, mt, animate.mon);
    setRealm(t?.hab?.el ?? null);
    renderDecks();
  }

  function renderDie(el, val, state) {
    el.className = `die ${el.classList.contains('die-mon') ? 'die-mon' : 'die-adv'} ${state ?? ''}`;
    el.querySelector('b').textContent = val ?? '';
  }

  async function rollDie(el, final) {
    if (AUTO) return renderDie(el, final, 'landed');
    renderDie(el, d20(), 'rolling');
    const iv = setInterval(() => (el.querySelector('b').textContent = d20()), 70);
    await wait(650);
    clearInterval(iv);
    renderDie(el, final, 'landed');
  }

  function renderDuel() {
    const t = G.t;
    const d = t?.duel;
    $('#duel').classList.toggle('on', !!d);
    const p = G.players[G.turn];
    $('#advLbl').textContent = p ? (p.human ? 'Sen' : p.name) : 'Maceracı';
    $('#numMon').textContent = d?.monTotal ?? '–';
    $('#numAdv').textContent = d?.advTotal ?? '–';
    $('#noteMon').textContent = d?.monNote ?? (t?.mon ? `güç ${t.mon.power}${homeBonus(t) ? ' +3' : ''} + zar` : '');
    $('#noteAdv').textContent = d?.advNote ?? '';
    $('#scoreMon').className = `score score-mon ${d?.result === 'lose' ? 'win' : d?.result === 'win' ? 'lose' : ''}`;
    $('#scoreAdv').className = `score score-adv ${d?.result === 'win' ? 'win' : d?.result === 'lose' ? 'lose' : ''}`;
    if (!d) {
      renderDie($('#dieMon'), '', 'idle');
      renderDie($('#dieAdv'), '', 'idle');
    }
    const s = $('#sabSlot');
    if (!t?.sab) {
      s.className = 'sab-slot';
      s.innerHTML = '';
    } else if (!t.sab.open) {
      s.className = 'sab-slot armed';
      s.innerHTML = `<img class="back" src="${BACK.attack}" alt="Kapalı sabotaj" />`;
    } else {
      s.className = 'sab-slot open';
      s.innerHTML = `<img class="face" src="${img(t.sab.card)}" alt="${t.sab.card.name}" data-id="${t.sab.card.id}" />${t.sab.dud ? '<span class="dud">Etkisiz</span>' : ''}`;
    }
    $('#played').innerHTML = (t?.played ?? []).map((c) => `<img src="${img(c)}" alt="${c.name}" data-id="${c.id}" class="${t.lost?.includes(c) ? 'lost' : ''}" />`).join('');
  }

  let lastSay = '';
  function say(html) {
    lastSay = html;
    $('#say').innerHTML = html;
  }

  // Log
  let logRound = 0;
  const logItems = [];
  function log(html, p) {
    if (G.round !== logRound) {
      logRound = G.round;
      logItems.push(`<li class="round">Tur ${G.round}</li>`);
    }
    logItems.push(`<li style="--c:${p ? ELC[p.ch.el] : 'var(--muted)'}">${html}</li>`);
    if (logItems.length > 220) logItems.splice(0, logItems.length - 200);
    const list = $('#logList');
    list.innerHTML = logItems.join('');
    list.scrollTop = list.scrollHeight;
  }

  async function banner({ kind = 'neutral', title, sub = '', card = null, p = null, ms = 1300 }) {
    if (AUTO) return;
    const b = $('#banner');
    b.className = `banner ${kind}`;
    b.innerHTML = `${card ? `<img class="b-card" src="${img(card)}" alt="" />` : ''}${p ? `<img class="b-ava" src="../assets/chars/${p.ch.id}.webp" alt="" style="--c:${ELC[p.ch.el]}" />` : ''}<div class="b-t">${title}</div>${sub ? `<div class="b-s">${sub}</div>` : ''}`;
    b.hidden = false;
    await wait(ms);
    b.classList.add('out');
    await wait(280);
    b.hidden = true;
  }

  // Hand
  let handMode = null; // { pick: n }
  let selected = [];
  let seenHand = new Set();
  function renderHand() {
    const me = G.players[0];
    const t = G.t;
    const habEl = t?.hab?.el;
    const picking = !!handMode;
    const box = $('#hand');
    box.className = `hand ${picking ? 'picking' : ''} ${G.turn !== 0 && !picking ? 'inactive' : ''}`;
    const n = me.hand.length;
    const W = box.clientWidth || 360;
    const cw = parseFloat(getComputedStyle(box).getPropertyValue('--hand-w')) || box.querySelector('.card')?.offsetWidth || 76;
    const step = n > 1 ? Math.min(cw * 0.94, (W - cw - 8) / (n - 1)) : 0;
    const mid = (n - 1) / 2;
    box.innerHTML = me.hand
      .map((c, i) => {
        const v = picking ? weaponVal(c, habEl, t?.koreltme) : null;
        const sel = selected.includes(i);
        const off = i - mid;
        const fresh = !seenHand.has(c);
        return `<button ${picking ? '' : `data-id="${c.id}"`} class="card ${sel ? 'sel' : ''} ${picking && !sel && selected.length >= handMode.pick ? 'dim' : ''} ${fresh && seenHand.size ? 'deal' : ''}" data-i="${i}" aria-label="${c.name}${picking ? `, değer ${v}` : ''}" aria-pressed="${sel}"
          style="--dx:${(off * step).toFixed(1)}px;--dy:${(Math.abs(off) ** 2 * 3).toFixed(1)}px;--rot:${(off * 3.5).toFixed(1)}deg;--z:${i + 1};animation-delay:${fresh ? 80 * i : 0}ms">
          <img src="${img(c)}" alt="" />
          <span class="zm" data-zoom="${c.id}" role="button" aria-label="${c.name} kartını büyüt"><svg><use href="#i-zoom" /></svg></span>
          ${picking ? `<span class="val ${v ? '' : 'zero'}">${v}</span>` : ''}
        </button>`;
      })
      .join('');
    seenHand = new Set(me.hand);
  }
  addEventListener('resize', () => G && renderHand());

  function render() {
    renderPlayers();
    renderTable();
    renderDuel();
    renderHand();
  }

  // ---------- Input helpers ----------
  function actions(btns) {
    // btns: [{label, sub, icon, value, cls, disabled}] → Promise<value>
    return new Promise((resolve) => {
      const box = $('#actions');
      box.innerHTML = btns
        .map(
          (b, i) =>
            `<button class="btn ${b.cls ?? 'btn-primary'}" data-k="${i}" ${b.disabled ? 'disabled' : ''}><span class="ic">${b.icon ? `<svg><use href="#i-${b.icon}" /></svg>` : ''}${b.label}</span>${b.sub ? `<small>${b.sub}</small>` : ''}</button>`,
        )
        .join('');
      box.onclick = (e) => {
        const k = e.target.closest('button')?.dataset.k;
        if (k == null || btns[k].disabled) return;
        box.onclick = null;
        idle();
        resolve(btns[k].value);
      };
    });
  }
  function idle(text) {
    const p = G?.players[G.turn];
    $('#actions').innerHTML = `<div class="wait">${text ?? (p && !p.human ? `${p.name} oynuyor…` : '')}</div>`;
  }

  function sheet(html, bind) {
    return new Promise((resolve) => {
      $('#sheet').innerHTML = html;
      $('#modal').hidden = false;
      $('#sheet').scrollTop = 0;
      bind($('#sheet'), (v) => {
        $('#modal').hidden = true;
        resolve(v);
      });
    });
  }
  const okSheet = (html, label = 'Tamam') =>
    sheet(`${html}<div class="row"><button class="btn btn-primary" data-ok>${label}</button></div>`, (el, done) => (el.querySelector('[data-ok]').onclick = () => done()));

  // ---------- Zoom: ⤢ button, a tap on table cards, or a long press on any card ----------
  function zoom(id) {
    const c = ALL.find((x) => x.id === id);
    if (!c) return;
    $('#zoom img').src = hd(c);
    $('#zoom img').alt = c.name;
    $('#zoom p').textContent = describe(c);
    $('#zoom').hidden = false;
  }
  const cardIdAt = (el) =>
    el.closest('[data-zoom]')?.dataset.zoom ??
    el.closest('[data-id]')?.dataset.id ??
    el.closest('.card,[data-k]')?.querySelector('[data-zoom]')?.dataset.zoom;
  let suppressClick = false;
  document.addEventListener(
    'click',
    (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      const z = e.target.closest('[data-zoom]');
      if (z) {
        e.stopPropagation();
        e.preventDefault();
        return zoom(z.dataset.zoom);
      }
      const t = e.target.closest('[data-id]');
      if (t && !t.closest('.sheet') && !t.closest('#zoom')) zoom(t.dataset.id);
    },
    true,
  );
  let pressTimer = null;
  document.addEventListener('pointerdown', (e) => {
    const id = e.target.closest('#zoom') ? null : cardIdAt(e.target);
    if (!id) return;
    pressTimer = setTimeout(() => {
      suppressClick = true;
      zoom(id);
    }, 420);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointermove'])
    document.addEventListener(ev, (e) => {
      if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 6) return;
      clearTimeout(pressTimer);
    });
  document.addEventListener('contextmenu', (e) => e.target.closest('.card,[data-k],.slot,.played,.sab-slot') && e.preventDefault());
  $('#zoom').onclick = () => ($('#zoom').hidden = true);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#zoom').hidden) $('#zoom').hidden = true;
  });

  function describe(c) {
    if (c.type === 'monster') return `${c.name} · ${elName(c.el)} · Güç ${c.power} · Yenilirsen −${c.penalty} level`;
    if (c.type === 'weapon') return c.el ? `${c.name} · Hasar ${c.dmg}, ${elName(c.el)} habitatında +${c.bonus} daha` : `${c.name} · Nötr silah, her yerde ${c.dmg}`;
    if (c.text) return `${c.name}: ${c.text}`;
    return `${c.name} · ${elName(c.el)} habitatı`;
  }

  // ============================================================
  // TURN FLOW
  // ============================================================
  async function playTurn() {
    const p = G.players[G.turn];
    const t = (G.t = { hab: null, mon: null, sab: null, duel: null, hafiza: false, koreltme: false, played: [] });
    setPhase('track');
    render();
    idle();
    if (p.human) {
      say('<b>Senin sıran.</b> İz sürüyorsun…');
      await banner({ title: 'Senin sıran', sub: `Tur ${G.round}`, p, ms: 900 });
    } else {
      say(`${nameB(p)} iz sürüyor…`);
      await wait(700);
    }

    // 1. Track
    if (p.lastHabitat && G.prevHabitat) {
      t.hab = G.prevHabitat;
      t.habBorrowed = true;
      p.lastHabitat = false;
    } else {
      t.hab = G.habitats.draw();
    }
    await fly($('#deck-habitat'), $('#slotHab'), t.habBorrowed ? img(t.hab) : BACK.habitat);
    renderTable({ hab: true });
    await wait(500);
    t.mon = G.monsters.draw();
    await fly($('#deck-monster'), $('#slotMon'), BACK.monster);
    renderTable({ mon: true });
    renderDuel();
    const intro = `${p.human ? 'Karşına' : `${nameB(p)} karşısına`} <b>${t.mon.name}</b> çıktı · ${elName(t.hab.el)} habitatı` + (homeBonus(t) ? ' · <b>yuvasında, +3</b>' : '');
    say(intro);
    log(`${nameB(p)} → <b>${t.mon.name}</b> (güç ${t.mon.power}${homeBonus(t) ? '+3' : ''}), ${elName(t.hab.el)}`, p);
    await wait(900);

    // 2. Fight or flee
    setPhase('decide');
    let fled = false;
    const canFlee = !p.fledLast;
    const pair = bestPair(p, t.hab.el);
    const diff = pair.reduce((s, x) => s + x.v, 0) + charBonus(p, t) + p.dieMod - t.mon.power - homeBonus(t);
    const pw = pWin(diff);
    let choice;
    if (p.human && !AUTO) {
      say(`${intro}. Elindeki en iyi kartlarla kazanma şansın yaklaşık <b>%${Math.round(pw * 100)}</b>.`);
      choice = await actions([
        { label: canFlee ? 'Kaç' : 'Kaçamazsın', sub: canFlee ? 'zar 11+ gerekir' : 'üst üste olmaz', icon: 'run', value: 'flee', cls: 'btn-dark', disabled: !canFlee },
        { label: 'Savaş', sub: `+${t.mon.power + (fullMatch(p, t) ? 2 : 0)} ya da −${t.mon.penalty} level`, icon: 'sword', value: 'fight', cls: 'btn-primary' },
      ]);
    } else {
      const ev = pw * (t.mon.power + (fullMatch(p, t) ? 2 : 0)) - (1 - pw) * t.mon.penalty;
      choice = canFlee && ev < 0 ? 'flee' : 'fight';
      say(`${nameB(p)} ${choice === 'flee' ? 'kaçmayı deniyor…' : 'savaşmaya karar verdi.'}`);
      await wait(800);
    }

    if (choice === 'flee') {
      const roll = Math.max(1, Math.min(20, d20() + p.dieMod));
      $('#duel').classList.add('on');
      say('Kaçış zarı atılıyor…');
      await rollDie($('#dieAdv'), roll);
      $('#numAdv').textContent = roll;
      $('#noteAdv').textContent = `kaçış · 11+ gerekir${p.dieMod ? ` (${p.dieMod > 0 ? '+' : ''}${p.dieMod})` : ''}`;
      if (roll >= 11) {
        fled = true;
        say(`Kaçış zarı <b>${roll}</b>: ${p.human ? 'kaçtın' : `${nameB(p)} kaçtı`}! Kader kartı çekiliyor…`);
        log(`${nameB(p)} kaçtı (zar ${roll})`, p);
        await wait(700);
        await drawFate(p);
      } else {
        say(`Kaçış zarı <b>${roll}</b>: <span class="bad">köşeye sıkıştı${p.human ? 'n' : ''}!</span> Savaş zorunlu.`);
        log(`${nameB(p)} kaçamadı (zar ${roll})`, p);
        await wait(1100);
      }
    } else log(`${nameB(p)} savaşıyor`, p);
    p.fledLast = fled;

    if (!fled && !G.over) await duel(p, t);

    // 5. Rest
    setPhase('rest');
    if (!fled) while (p.hand.length < 5) p.hand.push(G.attack.draw());
    p.dieMod = 0;
    if (p.noSab > 0) p.noSab--;
    G.habitats.toss(t.habBorrowed ? null : t.hab);
    G.prevHabitat = t.hab;
    G.monsters.toss(t.mon);
    renderPlayers();
    renderHand();
    renderDecks();
    if (!G.over) {
      await wait(p.human ? 700 : 600);
      G.turn = (G.turn + 1) % 4;
      if (G.turn === 0) G.round++;
    }
  }

  async function duel(p, t) {
    setPhase('duel');
    const d = (t.duel = { monRoll: null, advRoll: null, monTotal: null, advTotal: null });
    const right = G.players[(p.i + 3) % 4];
    // 3a. Monster attack (rolled by the player on the right)
    renderDuel();
    say(`${right.human ? '<b>Sen</b>' : nameB(right)} canavar için zar atıyor…`);
    d.monRoll = d20();
    await rollDie($('#dieMon'), d.monRoll);
    d.monTotal = t.mon.power + homeBonus(t) + d.monRoll;
    d.monNote = `güç ${t.mon.power}${homeBonus(t) ? ' +3' : ''} + zar ${d.monRoll}`;
    renderDuel();
    say(`Canavarın saldırısı: <b>${d.monTotal}</b>.`);
    await wait(700);

    // 3b. Sabotage window — from the left, total 1 card
    for (let k = 1; k <= 3 && !t.sab; k++) {
      const q = G.players[(p.i + k) % 4];
      if (q.wounded || q.noSab > 0) continue;
      const sabs = q.hand.filter((c) => c.type === 'sabotage');
      if (!sabs.length) continue;
      let card = null;
      if (q.human && !AUTO) card = await humanSabotage(q, p, t);
      else card = botSabotage(q, p, t, sabs);
      if (card) {
        const fromRect = q.human ? null : seatEl(q)?.getBoundingClientRect();
        q.hand.splice(q.hand.indexOf(card), 1);
        t.sab = { card, by: q, open: false };
        renderHand();
        renderPlayers();
        if (fromRect) await fly(fromRect, $('#sabSlot'), BACK.attack, { fromRot: -20 });
        renderDuel();
        say(`${nameB(q)} masaya <b>kapalı bir sabotaj</b> bıraktı${q.human ? 'n' : ''}!`);
        log(`${nameB(q)} kapalı sabotaj attı`, q);
        await wait(1000);
      }
    }
    if (!t.sab) {
      say('Kimse sabotaj atmadı.');
      await wait(500);
    }

    // 3c. Blind attack
    let picks;
    let fromRects = [];
    if (p.human && !AUTO) {
      picks = await humanAttack(p, t);
      fromRects = picks.map((c) => document.querySelector(`#hand .card[data-i="${p.hand.indexOf(c)}"]`)?.getBoundingClientRect());
    } else {
      picks = bestPair(p, t.hab.el).map((x) => x.c);
      if (!p.human) fromRects = picks.map(() => seatEl(p)?.getBoundingClientRect());
      say(`${nameB(p)} ${picks.length === 1 ? 'tek' : 'iki'} saldırı kartı açıyor…`);
      await wait(500);
    }
    t.played = picks;
    for (const c of picks) p.hand.splice(p.hand.indexOf(c), 1);
    renderHand();
    renderPlayers();
    renderDuel();
    const playedEls = [...document.querySelectorAll('#played img')];
    playedEls.forEach((e) => (e.style.visibility = 'hidden'));
    await Promise.all(picks.map((c, i) => fly(fromRects[i], playedEls[i], img(c), { fromRot: p.human ? 0 : -12 })));
    playedEls.forEach((e) => (e.style.visibility = ''));
    d.advRoll = Math.max(1, Math.min(20, d20() + p.dieMod));
    say(`${picks.map((c) => `<b>${c.name}</b>`).join(' + ')} · zar atılıyor…`);
    await rollDie($('#dieAdv'), d.advRoll);
    computeAdv(p, t);
    renderDuel();
    log(`${nameB(p)}: ${picks.map((c) => c.name).join(' + ')}, zar ${d.advRoll} → <b>${d.advTotal}</b> / canavar ${d.monTotal}`, p);
    await wait(900);

    // 3d. Reveal sabotage
    let mult = 1;
    let thief = null;
    let truce = false;
    let panic = false;
    if (t.sab) {
      t.sab.open = true;
      const s = t.sab.card;
      const valid = sabValid(s, p, t);
      t.sab.dud = !valid;
      renderDuel();
      if (!valid) {
        say(`Sabotaj açıldı: <b>${s.name}</b> — şartı tutmadı, <span class="good">etkisiz!</span>`);
        log(`Sabotaj <b>${s.name}</b> etkisiz kaldı (blöf)`, t.sab.by);
      } else {
        say(`Sabotaj açıldı: <b>${s.name}</b>! ${s.text}`);
        log(`${nameB(t.sab.by)}: <b>${s.name}</b>`, t.sab.by);
        switch (s.key) {
          case 'adrenalin': d.monSab = 2; break;
          case 'kan': d.monSab = 3; break;
          case 'evrim': d.monSab = 4; break;
          case 'beslenme': d.monSab = 5; break;
          case 'hortum': case 'kasirga': case 'yangin': case 'deprem': d.monSab = 3; break;
          case 'iksir': d.monSab = 2; break;
          case 'hileli': d.advRoll = Math.max(1, d.advRoll - 3); break;
          case 'ugursuz': { const r2 = d20(); d.advRoll = Math.min(d.advRoll, r2); d.advNoteX = `2. zar ${r2}`; break; }
          case 'vudu': d.advSab = -5; break;
          case 'hafiza': t.hafiza = true; break;
          case 'koreltme': t.koreltme = true; break;
          case 'kabza': {
            const best = t.played.slice().sort((a, b) => weaponVal(b, t.hab.el) - weaponVal(a, t.hab.el))[0];
            if (best) {
              t.played = t.played.filter((c) => c !== best);
              t.lost = [best];
              G.attack.toss(best);
            }
            break;
          }
          case 'teleport': {
            G.habitats.toss(t.hab);
            t.hab = G.habitats.draw();
            t.habBorrowed = false;
            renderTable({ hab: true });
            break;
          }
          case 'ateskes': truce = true; break;
          case 'cifte': mult = 2; break;
          case 'panik': panic = true; break;
          case 'hirsiz': thief = t.sab.by; break;
        }
        if (d.monSab) {
          d.monTotal += d.monSab;
          d.monNote += ` +${d.monSab}`;
        }
        renderDie($('#dieAdv'), d.advRoll, 'landed');
        computeAdv(p, t);
        if (t.lost) t.played = [...t.played, ...t.lost];
      }
      renderDuel();
      await wait(1500);
    }

    // 4. Result
    setPhase('result');
    const gain = t.mon.power + (fullMatch(p, t) ? 2 : 0);
    let res;
    if (truce) {
      d.result = 'tie';
      say('Ateşkes! Savaş sonuçsuz bitti.');
      res = { kind: 'neutral', title: 'Ateşkes', sub: 'Kimse level kazanmadı ya da kaybetmedi.' };
    } else if (d.advTotal > d.monTotal) {
      d.result = 'win';
      let g = gain * mult;
      let stolen = 0;
      if (thief) {
        stolen = Math.floor(g / 2);
        g -= stolen;
      }
      p.wins++;
      const healed = p.wounded;
      p.wounded = false;
      changeLevel(p, g);
      if (thief && stolen) changeLevel(thief, stolen);
      const extra = (fullMatch(p, t) ? ' · Tam Uyum +2' : '') + (mult > 1 ? ' · Çifte Şans' : '') + (stolen ? ` · ${who(thief)} ${stolen} çaldı` : '') + (healed ? ' · yaralar iyileşti' : '');
      say(`${p.human ? '<b>Kazandın!</b>' : `${nameB(p)} kazandı.`} <span class="good">+${g} level</span>${extra}`);
      log(`${nameB(p)} kazandı <b>+${g}</b>${extra}`, p);
      res = { kind: p.human ? 'win' : 'neutral', title: p.human ? 'Zafer!' : `${p.name} kazandı`, sub: `${d.advTotal} – ${d.monTotal} · +${g} level${extra}` };
    } else if (d.advTotal < d.monTotal) {
      d.result = 'lose';
      p.losses++;
      const loss = t.mon.penalty * mult;
      changeLevel(p, -loss);
      say(`${p.human ? '<b>Kaybettin.</b>' : `${nameB(p)} kaybetti.`} <span class="bad">−${loss} level</span>${p.wounded ? ' · <b>Yaralı!</b>' : ''}`);
      log(`${nameB(p)} kaybetti <b>−${loss}</b>${p.wounded ? ' · Yaralı' : ''}`, p);
      res = { kind: p.human ? 'lose' : 'neutral', title: p.human ? 'Yenildin' : `${p.name} yenildi`, sub: `${d.advTotal} – ${d.monTotal} · −${loss} level${p.wounded ? ' · Yaralı düştü' : ''}` };
    } else {
      d.result = 'tie';
      say('Berabere! Kimse level kazanmadı ya da kaybetmedi.');
      log('Berabere', p);
      res = { kind: 'neutral', title: 'Berabere', sub: `${d.advTotal} – ${d.monTotal}` };
    }
    renderDuel();
    renderPlayers();
    for (const c of t.played) if (!t.lost?.includes(c)) G.attack.toss(c);
    if (t.sab) G.attack.toss(t.sab.card);
    if (panic) {
      for (const c of p.hand) G.attack.toss(c);
      p.hand = [];
      for (let k = 0; k < 5; k++) p.hand.push(G.attack.draw());
    }
    p.oneCard = false;
    await banner({ ...res, p, ms: p.human ? 1500 : 1000 });
    await wait(400);
  }

  function computeAdv(p, t) {
    const d = t.duel;
    let w = t.played.reduce((s, c) => s + weaponVal(c, t.hab.el), 0);
    if (t.koreltme) w -= Math.max(0, ...t.played.map((c) => weaponVal(c, t.hab.el) - weaponVal(c, t.hab.el, true)));
    const cb = charBonus(p, t);
    d.advTotal = w + cb + d.advRoll + (d.advSab ?? 0);
    d.advNote = `kart ${w}${cb ? ' +1' : ''} + zar ${d.advRoll}${d.advSab ? ' −5' : ''}${d.advNoteX ? ` (${d.advNoteX})` : ''}`;
  }

  function sabValid(s, p, t) {
    if (FIFTEEN.has(s.key) && p.level < 15) return false;
    if (s.el && s.el !== t.mon.el) return false;
    return true;
  }

  function changeLevel(p, delta) {
    p.level += delta;
    if (p.level <= 0) {
      p.level = 1;
      p.wounded = true;
    }
    floatDelta(p, delta);
    if (p.level >= G.target) {
      p.level = Math.max(p.level, G.target);
      G.over = true;
      G.winner = p;
    }
  }

  // ---------- Fate ----------
  async function drawFate(p) {
    const f = G.fate.draw();
    G.fate.toss(f);
    renderDecks();
    log(`${nameB(p)} kader: <b>${f.name}</b>`, p);
    if (p.human && !AUTO) {
      await okSheet(`<p class="eyebrow">Kader kartı</p><h2>${f.name}</h2><img class="big" src="${hd(f)}" alt="${f.name}" /><p>${f.text}</p>`);
    } else {
      say(`${nameB(p)} kader kartı çekti: <b>${f.name}</b>. ${f.text}`);
      await banner({ title: f.name, sub: `${p.name}: ${f.text}`, card: f, ms: 1300 });
    }
    switch (f.key) {
      case 'kor': p.nextDie = -2; break;
      case 'skacis': p.nextDie = 2; break;
      case 'ekipman': {
        if (p.hand.length) {
          const k = Math.floor(Math.random() * p.hand.length);
          G.attack.toss(p.hand.splice(k, 1)[0]);
          p.hand.push(G.attack.draw());
        }
        break;
      }
      case 'bacak': p.lastHabitat = true; break;
      case 'kol': p.oneCard = true; break;
      case 'eylemsiz': p.noSab = 3; break; // this turn + 2 more of own turns
      case 'dinlenme': changeLevel(p, 1); break;
      case 'hazine': await swapCards(p, 2); break;
      case 'fal': {
        const top = G.monsters.peek();
        if (p.human && !AUTO) await okSheet(`<p class="eyebrow">Şanslı Fal</p><h2>Sıradaki canavar</h2><p>Bir sonraki oyuncunun karşısına bu çıkacak.</p><img class="big" src="${hd(top)}" alt="${top.name}" />`);
        break;
      }
    }
    renderPlayers();
    renderHand();
  }

  async function swapCards(p, n) {
    if (!p.human || AUTO) {
      const worst = p.hand
        .map((c) => ({ c, v: c.type === 'weapon' ? c.dmg + c.bonus / 2 : 2 }))
        .sort((a, b) => a.v - b.v)
        .slice(0, n);
      for (const { c } of worst) {
        G.attack.toss(p.hand.splice(p.hand.indexOf(c), 1)[0]);
        p.hand.push(G.attack.draw());
      }
      return;
    }
    const sel = new Set();
    await sheet(
      `<p class="eyebrow">Hazine Sandığı</p><h2>Kart değiştir</h2><p>Atmak istediğin en fazla ${n} kartı seç; yerine desteden yenisi gelir.</p>
       <div class="cards">${p.hand.map((c, i) => `<button data-k="${i}" aria-pressed="false"><img src="${img(c)}" alt="${c.name}" /><span class="zm" data-zoom="${c.id}" role="button" aria-label="Büyüt"><svg><use href="#i-zoom" /></svg></span></button>`).join('')}</div>
       <div class="row"><button class="btn btn-ghost" data-skip>Değiştirme</button><button class="btn btn-primary" data-ok disabled>Değiştir</button></div>`,
      (el, done) => {
        const ok = el.querySelector('[data-ok]');
        el.querySelectorAll('[data-k]').forEach(
          (b) =>
            (b.onclick = () => {
              const k = +b.dataset.k;
              if (sel.has(k)) sel.delete(k);
              else if (sel.size < n) sel.add(k);
              b.classList.toggle('sel', sel.has(k));
              b.setAttribute('aria-pressed', sel.has(k));
              ok.disabled = !sel.size;
              ok.innerHTML = sel.size ? `${sel.size} kartı değiştir` : 'Değiştir';
            }),
        );
        ok.onclick = () => done();
        el.querySelector('[data-skip]').onclick = () => {
          sel.clear();
          done();
        };
      },
    );
    const ks = [...sel].sort((a, b) => b - a);
    for (const k of ks) G.attack.toss(p.hand.splice(k, 1)[0]);
    for (let k = 0; k < ks.length; k++) p.hand.push(G.attack.draw());
  }

  // ---------- Human choices ----------
  async function humanAttack(p, t) {
    const need = Math.min(p.oneCard ? 1 : 2, p.hand.length);
    selected = [];
    handMode = { pick: need };
    renderHand();
    const d = t.duel;
    const update = () => {
      const cb = charBonus(p, t);
      const w = selected.reduce((s, i) => s + weaponVal(p.hand[i], t.hab.el, t.koreltme), 0) + cb;
      const needRoll = d.monTotal - w - p.dieMod + 1;
      const ready = selected.length >= need;
      const chance = needRoll <= 1 ? 'zar ne gelirse gelsin öndesin' : needRoll > 20 ? 'zarla bile yetişemezsin' : `zarın en az <b>${needRoll}</b> gelmeli`;
      say(
        ready
          ? `Kartların <b>${w}</b>${cb ? ' (karakter +1 dahil)' : ''} · ${chance}${t.sab ? ' · <span class="bad">kapalı sabotaj var</span>' : ''}`
          : `Canavar <b>${d.monTotal}</b>. Elinden <b>${need}</b> kart seç — üstteki sayılar bu habitattaki güçleri.${p.oneCard ? ' (Kırık Kol: tek kart)' : ''}`,
      );
      $('#actions').innerHTML = `<button class="btn btn-gold" data-go ${ready ? '' : 'disabled'}><span class="ic"><svg><use href="#i-sword" /></svg>Saldır</span><small>${ready ? `${w} + zar` : `${selected.length}/${need} kart`}</small></button>`;
    };
    update();
    return new Promise((resolve) => {
      $('#hand').onclick = (e) => {
        const b = e.target.closest('.card');
        if (!b) return;
        e.stopPropagation();
        const i = +b.dataset.i;
        if (selected.includes(i)) selected = selected.filter((x) => x !== i);
        else if (selected.length < need) selected.push(i);
        else selected = [...selected.slice(1), i];
        renderHand();
        update();
      };
      $('#actions').onclick = (e) => {
        if (!e.target.closest('[data-go]') || selected.length < need) return;
        const picks = selected.map((i) => p.hand[i]);
        $('#hand').onclick = null;
        $('#actions').onclick = null;
        idle('');
        handMode = null;
        selected = [];
        resolve(picks);
      };
    });
  }

  async function humanSabotage(me, target, t) {
    const sabs = me.hand.filter((c) => c.type === 'sabotage');
    let pick = null;
    const d = t.duel;
    return sheet(
      `<p class="eyebrow">Sabotaj fırsatı</p><h2>Sabotaj atacak mısın?</h2>
       <div class="ctx"><img src="${img(t.mon)}" alt="" /><div><b>${target.name}</b> · level ${target.level}<br>${t.mon.name} şu an <b>${d.monTotal}</b> ile saldırıyor</div></div>
       <p>Kartın kapalı gider. Şartı tutmasa bile blöf olarak atabilirsin.</p>
       <div class="cards">${sabs
         .map((c, i) => {
           const ok = sabValid(c, target, t);
           return `<button data-k="${i}" aria-pressed="false"><img src="${img(c)}" alt="${c.name}" /><span class="zm" data-zoom="${c.id}" role="button" aria-label="Büyüt"><svg><use href="#i-zoom" /></svg></span><span class="tg ${ok ? 'ok' : 'no'}">${ok ? 'Geçerli' : 'Blöf'}</span></button>`;
         })
         .join('')}</div>
       <div class="detail" id="sabTxt">Bir kart seç ya da pas geç.</div>
       <div class="row"><button class="btn btn-ghost" data-pass>Pas geç</button><button class="btn btn-primary" data-play disabled>Kapalı at</button></div>`,
      (el, done) => {
        el.querySelectorAll('[data-k]').forEach(
          (b) =>
            (b.onclick = () => {
              el.querySelectorAll('[data-k]').forEach((x) => {
                x.classList.remove('sel');
                x.setAttribute('aria-pressed', 'false');
              });
              b.classList.add('sel');
              b.setAttribute('aria-pressed', 'true');
              pick = sabs[+b.dataset.k];
              el.querySelector('#sabTxt').innerHTML = `<b>${pick.name}</b>: ${pick.text}${sabValid(pick, target, t) ? '' : ' <em>(bu düelloda şartı tutmuyor — blöf olur)</em>'}`;
              el.querySelector('[data-play]').disabled = false;
            }),
        );
        el.querySelector('[data-pass]').onclick = () => done(null);
        el.querySelector('[data-play]').onclick = () => done(pick);
      },
    );
  }

  // ---------- Bots ----------
  const SAB_RANK = ['ugursuz', 'beslenme', 'vudu', 'hirsiz', 'kan', 'hileli', 'evrim', 'kabza', 'koreltme', 'ateskes', 'hortum', 'kasirga', 'yangin', 'deprem', 'adrenalin', 'iksir', 'teleport', 'hafiza', 'panik'];
  function botSabotage(q, target, t, sabs) {
    const others = G.players.filter((x) => x !== q);
    const leader = others.reduce((a, b) => (b.level > a.level ? b : a));
    const threat = target.level >= G.target - 10 || (target === leader && target.level >= q.level);
    if (!threat && Math.random() > 0.12) return null;
    const valid = sabs.filter((c) => sabValid(c, target, t) && c.key !== 'cifte').sort((a, b) => SAB_RANK.indexOf(a.key) - SAB_RANK.indexOf(b.key));
    if (valid.length) return valid[0];
    // Bluff with a dud now and then
    if (threat && Math.random() < 0.3) return sabs[0];
    return null;
  }

  // ============================================================
  // GAME LOOP / SCREENS
  // ============================================================
  async function run() {
    const g = ++gen;
    paused = false;
    logItems.length = 0;
    logRound = 0;
    seenHand = new Set();
    $('#start').hidden = true;
    $('#game').hidden = false;
    $('#modal').hidden = true;
    setRealm(null);
    render();
    seenHand = new Set();
    renderHand();
    const first = G.players[G.turn];
    say(`Zar atıldı: <b>${first.human ? 'sen' : first.name}</b> başlıyor. ${G.target}. seviyeye ilk ulaşan kazanır.`);
    log(`Oyun başladı · hedef ${G.target}. seviye · ${who(first)} başlıyor`);
    await wait(1400);
    while (!G.over && g === gen) {
      const p = G.players[G.turn];
      p.dieMod = p.nextDie ?? 0;
      p.nextDie = 0;
      await playTurn();
    }
    if (g !== gen) return;
    setPhase(null);
    render();
    await endScreen();
  }

  async function endScreen() {
    const w = G.winner;
    if (AUTO) {
      document.body.dataset.result = JSON.stringify({ winner: w.name, round: G.round, levels: G.players.map((p) => p.level) });
      return;
    }
    await banner({ kind: w.human ? 'win' : 'neutral', title: w.human ? 'Büyük Üstat sensin!' : `${w.name} kazandı`, p: w, ms: 1600 });
    const stand = G.players.slice().sort((a, b) => b.level - a.level);
    const again = await sheet(
      `<div class="end"><div class="crown">BÜYÜK ÜSTAT</div>
        <div class="winner"><img src="../assets/chars/${w.ch.id}.webp" alt="" /></div>
        <h2>${w.human ? 'Kazandın!' : `${w.name} kazandı`}</h2>
        <p>${G.round}. turda ${G.target}. seviyeye ulaşıldı.</p>
        <ol class="stand">${stand
          .map(
            (p, k) => `<li style="--c:${ELC[p.ch.el]}"><span class="pos">${k + 1}</span><img src="../assets/chars/${p.ch.id}.webp" alt="" />
              <span class="nm"><b>${p.human ? `Sen · ${p.ch.name}` : p.name}</b><small>${p.wins} zafer · ${p.losses} yenilgi</small></span><span class="lvl">${p.level}</span></li>`,
          )
          .join('')}</ol>
        <div class="row"><button class="btn btn-ghost" data-home>Ana menü</button><button class="btn btn-primary" data-again>Tekrar oyna</button></div></div>`,
      (el, done) => {
        el.querySelector('[data-again]').onclick = () => done(true);
        el.querySelector('[data-home]').onclick = () => done(false);
      },
    );
    if (again) {
      newGame(G.players[0].ch.id, G.target);
      run();
    } else toStart();
  }

  function toStart() {
    gen++;
    paused = false;
    $('#modal').hidden = true;
    $('#game').hidden = true;
    $('#start').hidden = false;
  }

  const RULES = `<p class="eyebrow">Kurallar</p><h2>Nasıl oynanır?</h2>
    <p>Sen ve üç rakip sırayla canavar avlarsınız. Herkes 10. seviyeden başlar; hedef seviyeye ilk ulaşan Büyük Üstat olur.</p>
    <h3>1 · İz sür</h3><p>Bir habitat ve bir canavar açılır. Canavar kendi diyarındaysa <b>+3</b> güç kazanır.</p>
    <h3>2 · Savaş ya da kaç</h3><p>Kaçmak için zar 11+ gelmeli; kaçarsan Kader kartı çekersin. Üst üste iki tur kaçamazsın.</p>
    <h3>3 · Düello</h3><ul class="rules">
      <li>Sağındaki oyuncu canavar için zar atar: <b>canavar gücü + zar</b>.</li>
      <li>Rakiplerden biri kapalı bir <b>sabotaj</b> bırakabilir. Şartı tutmuyorsa etkisizdir — blöf olabilir.</li>
      <li>Sen elinden <b>2 kart</b> seçip zar atarsın. Silah kendi diyarının habitatındaysa bonusu da sayılır.</li>
      <li>Karakterin kendi diyarının canavarına <b>+1</b>. Habitat, canavar ve karakter aynı diyardansa zaferde <b>+2</b> level.</li></ul>
    <h3>4 · Sonuç</h3><p>Kazanırsan canavarın gücü kadar level alırsın; kaybedersen cezası kadar düşersin. 1'in altına inen <b>Yaralı</b> olur: sabotaj atamaz, bonus alamaz; ilk zaferde iyileşir.</p>
    <h3>5 · Dinlen</h3><p>Savaştıysan elini 5 karta tamamlarsın; kaçtıysan tamamlayamazsın.</p>
    <p><b>İpucu:</b> Herhangi bir karta basılı tut ya da köşesindeki büyüteçe dokun — kart büyür.</p>`;

  function openMenu() {
    if (!$('#modal').hidden) return;
    paused = true;
    const resume = () => {
      paused = false;
    };
    sheet(
      `<p class="eyebrow">Duraklatıldı</p><h2>Menü</h2>
       <div class="menu">
         <button class="btn btn-primary" data-v="resume">Oyuna dön</button>
         <button class="btn btn-dark" data-v="log">Oyun günlüğü</button>
         <button class="btn btn-dark" data-v="rules">Nasıl oynanır?</button>
         <button class="btn btn-ghost" data-v="restart">Yeniden başlat</button>
         <button class="btn btn-ghost" data-v="home">Ana menüye dön</button>
       </div>`,
      (el, done) => el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => done(b.dataset.v))),
    ).then(async (v) => {
      if (v === 'rules') await okSheet(RULES, 'Oyuna dön');
      else if (v === 'log') await okSheet(`<p class="eyebrow">Günlük</p><h2>Neler oldu?</h2><ol class="logl">${logItems.slice(-60).join('') || '<li>Henüz bir şey olmadı.</li>'}</ol>`, 'Oyuna dön');
      else if (v === 'restart') {
        newGame(G.players[0].ch.id, G.target);
        return run();
      } else if (v === 'home') return toStart();
      resume();
    });
  }
  $('#menuBtn').onclick = openMenu;
  $('#modal').addEventListener('click', (e) => {
    // tapping the dimmed backdrop closes the pause menu only
    if (e.target === $('#modal') && paused && $('#sheet [data-v="resume"]')) $('#sheet [data-v="resume"]').click();
  });

  const setSpeed = (s) => {
    speed = s;
    $('#speedBtn').textContent = speed + 'x';
    store.set('kk-speed', String(speed));
  };
  $('#speedBtn').textContent = (AUTO ? 1 : speed) + 'x';
  $('#speedBtn').onclick = () => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1);

  // ---------- Start screen ----------
  let chosen = null;
  let target = 30;
  $('#pick').innerHTML = CHARS.map(
    (c) => `<button class="hero" data-c="${c.id}" role="radio" aria-checked="false" style="--c:${ELC[c.el]}">
      <img src="../assets/chars/${c.id}.webp" alt="" />
      <span class="tick"><svg><use href="#i-check" /></svg></span>
      <span class="hero-tx"><b>${c.name}</b><small>${elName(c.el)} uzmanı</small><em>${c.line}</em></span>
    </button>`,
  ).join('');
  $('#pick').onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    chosen = b.dataset.c;
    $('#pick').querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-checked', x === b));
    $('#go').disabled = false;
    $('#go').textContent = `${CHARS.find((c) => c.id === chosen).name} ile başla`;
  };
  $('#target').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    target = +b.dataset.v;
    $('#target').querySelectorAll('button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-checked', x === b);
    });
  };
  $('#go').onclick = () => {
    newGame(chosen, target);
    run();
  };
  $('#rulesLink').onclick = () => okSheet(RULES, 'Anladım');
  if (AUTO) {
    newGame(CHARS[Math.floor(Math.random() * 4)].id, /t=20/.test(location.search) ? 20 : 30);
    run();
  }
})();
