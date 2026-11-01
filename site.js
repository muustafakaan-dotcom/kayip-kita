(() => {
  const { cards, characters, elements } = window.KK;
  const img = (id) => `assets/cards/${id}.webp`;
  const COLORS = { orman: 'var(--orman)', su: 'var(--su)', yer: 'var(--yer)', gok: 'var(--gok)' };
  const BLURB = {
    orman: 'Fısıldayan ağaçların arasında Kadim Ent ve Cerberus bekler.',
    su: 'Batık şehirlerin karanlığında Megalodon ve Katil Kraken dolaşır.',
    yer: 'Magma köprülerinin altında Şahmeran ve Zebani uyanır.',
    gok: 'Fırtınanın gözünde Kral Griffon ve Şimşek Ejderhası süzülür.',
  };

  // Realms
  document.getElementById('realms').innerHTML = Object.entries(elements)
    .map(([k, e]) => {
      const mons = cards.filter((c) => c.type === 'monster' && c.el === k).sort((a, b) => b.power - a.power).slice(0, 4);
      return `<article class="realm" style="--c:${COLORS[k]};${k === 'gok' ? '--ct:var(--gok-light);' : ''}--img:url('assets/realms/${k}.webp')">
        <h3>${e.name}</h3>
        <p>${BLURB[k]}</p>
        <div class="mons">${mons.map((m) => `<img src="${img(m.id)}" alt="${m.name}" loading="lazy">`).join('')}</div>
      </article>`;
    })
    .join('');

  // Characters
  document.getElementById('chars').innerHTML = characters
    .map(
      (c) => `<article class="char" style="--c:${COLORS[c.el]}">
        <img src="assets/chars/${c.id}.webp" alt="${c.name}" loading="lazy">
        <div><span class="tag" style="--c2:${c.el === 'su' ? '#2f6f99' : COLORS[c.el]}">${elements[c.el].name} uzmanı</span><h3>${c.name}</h3><p>${c.line}</p></div>
      </article>`,
    )
    .join('');

  // Gallery
  const TYPES = [
    ['all', 'Tümü'],
    ['monster', 'Canavarlar'],
    ['habitat', 'Habitatlar'],
    ['weapon', 'Silahlar'],
    ['sabotage', 'Sabotajlar'],
    ['fate', 'Kader'],
  ];
  const filters = document.getElementById('filters');
  const gallery = document.getElementById('gallery');
  const describe = (c) =>
    c.type === 'monster'
      ? `${c.name} · Güç ${c.power} · Ceza −${c.penalty}`
      : c.type === 'weapon'
        ? `${c.name} · Hasar ${c.dmg}${c.bonus ? ` · Habitat bonusu +${c.bonus}` : ' · Nötr'}`
        : c.text
          ? `${c.name} — ${c.text}`
          : c.name;
  const render = (t) => {
    filters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t)));
    gallery.innerHTML = cards
      .filter((c) => t === 'all' || c.type === t)
      .map((c) => `<button data-id="${c.id}" aria-label="${c.name}"><img src="${img(c.id)}" alt="${c.name}" loading="lazy"></button>`)
      .join('');
  };
  filters.innerHTML = TYPES.map(([t, l]) => `<button role="tab" data-t="${t}">${l}</button>`).join('');
  filters.addEventListener('click', (e) => e.target.dataset.t && render(e.target.dataset.t));
  render('monster');

  // Lightbox
  const lb = document.getElementById('lightbox');
  gallery.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = cards.find((x) => x.id === b.dataset.id);
    lb.querySelector('img').src = `assets/cards-hd/${c.id}.webp`;
    lb.querySelector('img').alt = c.name;
    lb.querySelector('p').textContent = describe(c);
    lb.hidden = false;
  });
  const close = () => (lb.hidden = true);
  lb.addEventListener('click', close);
  addEventListener('keydown', (e) => e.key === 'Escape' && close());

  // Autoplay video when visible (muted)
  const v = document.querySelector('#video video');
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) v.play().catch(() => {});
    else v.pause();
  }, { threshold: 0.5 }).observe(v);
})();
