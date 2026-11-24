export interface ArchiveEntry {
  id: string;
  indexLabel: string;
  title: string;
  subtitle: string;
  image: string;
  emblemCaption: string;
  emblemSvg: string;
  kicker: string;
  fieldNote: string;
  specs: string;
}

const ENTRIES: ArchiveEntry[] = [
  {
    id: 'vessel',
    indexLabel: 'ENTRY 01',
    title: 'The Vessel',
    subtitle: 'Carbon-titanium composite hull engineered for 4,000-meter quiet reconnaissance.',
    image: './images/archive_vessel.png',
    emblemCaption: 'HULL PROFILE · MK-IV',
    emblemSvg: `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="52" rx="34" ry="18"/><path d="M22 52 C28 38, 44 36, 56 38"/><circle cx="52" cy="30" r="8"/><line x1="65" y1="22" x2="65" y2="32"/><circle cx="65" cy="20" r="2.2"/><path d="M78 52 L92 48 L92 56 Z"/><circle cx="38" cy="54" r="6"/></svg>`,
    kicker: 'FIELD LOG 01 · PRESSURE HULL',
    fieldNote:
      'Constructed around a continuous forged titanium spine wrapped in acoustic-damping carbon weave, BATHYS MK-IV maintains laminar flow at 6 knots while keeping hydrophone signature below ambient ocean noise.',
    specs: 'MAX DEPTH: 4,000 M  ·  ENDURANCE: 14 HRS  ·  THRUSTERS: 4× VECTORED',
  },
  {
    id: 'cockpit',
    indexLabel: 'ENTRY 02',
    title: 'Inside the Cockpit',
    subtitle: 'Unobstructed panoramic acrylic sightline paired with recessed analog telemetry.',
    image: './images/archive_cockpit.png',
    emblemCaption: 'OPTICAL DOME · 180°',
    emblemSvg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="36"/><circle cx="50" cy="50" r="24" stroke-dasharray="3 4"/><line x1="50" y1="50" x2="68" y2="34"/><circle cx="50" cy="50" r="4"/><path d="M22 66 Q50 56 78 66"/></svg>`,
    kicker: 'FIELD LOG 02 · PILOT STATION',
    fieldNote:
      'Seated directly behind optically pure cast acrylic, the pilot reads live velocity, magnetic heading, and beam power from softly backlit brass-bezel dials calibrated to preserve dark-adapted night vision.',
    specs: 'VIEWPORT: 112 MM CAST ACRYLIC  ·  CABIN: 1 ATM PRESSURIZED  ·  LIGHTING: 2700K AMBER',
  },
  {
    id: 'marine-life',
    indexLabel: 'ENTRY 03',
    title: 'Marine Life',
    subtitle: 'Benthic flora and pelagic schools illuminated only as the headlamps sweep past.',
    image: './images/archive_marine.png',
    emblemCaption: 'BENTHIC FLORA & FAUNA',
    emblemSvg: `<svg viewBox="0 0 100 100"><path d="M18 52 C34 32, 62 32, 76 52 C62 72, 34 72, 18 52 Z"/><path d="M74 52 L90 38 L86 52 L90 66 Z"/><circle cx="34" cy="48" r="2.6"/><path d="M36 78 C36 66, 44 64, 42 54"/><path d="M56 82 C58 70, 50 66, 54 56"/></svg>`,
    kicker: 'FIELD LOG 03 · ECOSYSTEM SURVEY',
    fieldNote:
      'In the perpetual midnight blue below 3,800 meters, olive kelp fronds, dusky violet sea fans, pink tube sponges, and pelagic schools reveal their true chromatic spectra only inside BATHYS’s high-CRI beams.',
    specs: 'SPECIES LOGGED: 3 PELAGIC · 1 APEX SHARK · 4 BENTHIC FLORA',
  },
  {
    id: 'wreck',
    indexLabel: 'ENTRY 04',
    title: 'The Wreck',
    subtitle: 'An iron hull resting at an angle in abyssal sediment, ribs exposed to the current.',
    image: './images/archive_wreck.png',
    emblemCaption: 'SECTOR 04 · SS VANGUARD',
    emblemSvg: `<svg viewBox="0 0 100 100"><path d="M16 62 L84 48 L74 74 L24 78 Z"/><line x1="34" y1="58" x2="36" y2="76"/><line x1="48" y1="55" x2="50" y2="75"/><line x1="62" y1="52" x2="64" y2="74"/><path d="M56 53 L58 34 L72 31 L74 50"/><line x1="28" y1="60" x2="22" y2="34"/></svg>`,
    kicker: 'FIELD LOG 04 · SUNKEN WRECK',
    fieldNote:
      'Settled at a 14-degree list with its lower bow buried in fine benthic silt, the steel hull’s torn midship opening exposes structural ribs encrusted with rusticles and deep-sea anemones.',
    specs: 'LENGTH: 24 M  ·  BEARING: 024° NNE  ·  SEDIMENT DEPTH: 1.4 M',
  },
];

interface TrailDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
}

export class DiveArchive {
  private section: HTMLElement;
  private grid: HTMLElement;
  private mainImg: HTMLImageElement;
  private peekPrevImg: HTMLImageElement;
  private peekNextImg: HTMLImageElement;
  private counterEl: HTMLElement;
  private indexEl: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private emblemSvgEl: HTMLElement;
  private emblemCapEl: HTMLElement;
  private dotsWrap: HTMLElement;
  private glassCard: HTMLElement;
  private glassInner: HTMLElement;
  private glassRim: HTMLElement;
  private emblemTile: HTMLElement;
  private emblemGlint: HTMLElement;

  // Modal
  private modal: HTMLElement;
  private modalImg: HTMLImageElement;
  private modalKicker: HTMLElement;
  private modalTitle: HTMLElement;
  private modalNote: HTMLElement;
  private modalSpecs: HTMLElement;

  // Cursor particle trail
  private trailCanvas: HTMLCanvasElement;
  private trailCtx: CanvasRenderingContext2D;
  private dots: TrailDot[] = [];
  private lastMouseX = -1000;
  private lastMouseY = -1000;

  private activeIndex = 0;
  private isOpen = false;
  private wheelCooldown = 0;
  private touchStartY = 0;

  public onReturnToOcean?: () => void;
  public onBackToTop?: () => void;
  public onUiTick?: () => void;

  constructor() {
    this.section = document.getElementById('archive-section')!;
    this.grid = this.section.querySelector('.archive-grid')!;
    this.mainImg = document.getElementById('archive-main-img') as HTMLImageElement;
    this.peekPrevImg = document.getElementById('peek-prev-img') as HTMLImageElement;
    this.peekNextImg = document.getElementById('peek-next-img') as HTMLImageElement;
    this.counterEl = document.getElementById('archive-counter')!;
    this.indexEl = document.getElementById('archive-entry-index')!;
    this.titleEl = document.getElementById('archive-entry-title')!;
    this.subEl = document.getElementById('archive-entry-sub')!;
    this.emblemSvgEl = document.getElementById('archive-emblem-svg')!;
    this.emblemCapEl = document.getElementById('archive-emblem-caption')!;
    this.dotsWrap = document.getElementById('archive-dots')!;
    this.glassCard = document.getElementById('archive-glass-card')!;
    this.glassInner = document.getElementById('archive-card-inner')!;
    this.glassRim = document.getElementById('glass-rim-highlight')!;
    this.emblemTile = document.getElementById('archive-emblem-tile')!;
    this.emblemGlint = document.getElementById('emblem-glint')!;

    this.modal = document.getElementById('entry-modal')!;
    this.modalImg = document.getElementById('modal-img') as HTMLImageElement;
    this.modalKicker = document.getElementById('modal-kicker')!;
    this.modalTitle = document.getElementById('modal-title')!;
    this.modalNote = document.getElementById('modal-note')!;
    this.modalSpecs = document.getElementById('modal-specs')!;

    this.trailCanvas = document.getElementById('cursor-trail-canvas') as HTMLCanvasElement;
    this.trailCtx = this.trailCanvas.getContext('2d')!;

    this.buildDots();
    this.renderEntry(0, false);
    this.bindInteractions();
    this.resizeTrail();
    this.animateTrail();
  }

  public setEntryImage(id: string, dataUrl: string): void {
    const entry = ENTRIES.find((e) => e.id === id);
    if (entry) {
      entry.image = dataUrl;
      if (ENTRIES[this.activeIndex].id === id) {
        this.mainImg.src = dataUrl;
      }
    }
  }

  public open(): void {
    this.isOpen = true;
    this.section.scrollTop = 0;
    this.section.classList.add('active');
    this.wheelCooldown = performance.now() + 700;
  }

  public close(): void {
    this.isOpen = false;
    this.section.classList.remove('active');
    this.closeModal();
  }

  public isOpened(): boolean {
    return this.isOpen;
  }

  private buildDots(): void {
    this.dotsWrap.innerHTML = '';
    ENTRIES.forEach((_, idx) => {
      const btn = document.createElement('button');
      btn.className = 'archive-dot';
      btn.setAttribute('aria-label', `Entry ${idx + 1}`);
      btn.addEventListener('click', () => this.goToEntry(idx));
      this.dotsWrap.appendChild(btn);
    });
  }

  private goToEntry(idx: number): void {
    const clamped = Math.max(0, Math.min(ENTRIES.length - 1, idx));
    if (clamped === this.activeIndex) return;
    this.onUiTick?.();
    this.renderEntry(clamped, true);
  }

  private renderEntry(idx: number, animate: boolean): void {
    this.activeIndex = idx;
    const apply = () => {
      const entry = ENTRIES[idx];
      const prev = ENTRIES[(idx - 1 + ENTRIES.length) % ENTRIES.length];
      const next = ENTRIES[(idx + 1) % ENTRIES.length];

      this.mainImg.src = entry.image;
      this.mainImg.alt = entry.title;
      this.peekPrevImg.src = prev.image;
      this.peekNextImg.src = next.image;

      this.counterEl.textContent = `0${idx + 1} / 0${ENTRIES.length}`;
      this.indexEl.textContent = entry.indexLabel;
      this.titleEl.textContent = entry.title;
      this.subEl.textContent = entry.subtitle;
      this.emblemSvgEl.innerHTML = entry.emblemSvg;
      this.emblemCapEl.textContent = entry.emblemCaption;

      const dotButtons = this.dotsWrap.querySelectorAll('.archive-dot');
      dotButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
    };

    if (animate) {
      this.grid.classList.add('switching');
      window.setTimeout(() => {
        apply();
        this.grid.classList.remove('switching');
      }, 210);
    } else {
      apply();
    }
  }

  private openModal(): void {
    const entry = ENTRIES[this.activeIndex];
    this.modalImg.src = entry.image;
    this.modalImg.alt = entry.title;
    this.modalKicker.textContent = entry.kicker;
    this.modalTitle.textContent = entry.title;
    this.modalNote.textContent = entry.fieldNote;
    this.modalSpecs.textContent = entry.specs;
    this.modal.classList.remove('hidden');
    this.onUiTick?.();
  }

  private closeModal(): void {
    this.modal.classList.add('hidden');
  }

  private bindInteractions(): void {
    window.addEventListener('resize', () => this.resizeTrail());

    // View entry button & card click
    document.getElementById('archive-view-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal();
    });
    this.glassCard.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal();
    });
    this.emblemTile.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal();
    });
    document.getElementById('modal-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeModal();
    });
    document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeModal();
    });

    // Footer actions
    document.getElementById('footer-return-ocean')?.addEventListener('click', () => {
      this.onUiTick?.();
      this.onReturnToOcean?.();
    });
    document.getElementById('footer-back-top')?.addEventListener('click', () => {
      this.onUiTick?.();
      this.onBackToTop?.();
    });

    // Curved-glass hover swell, outward rim bow, highlight & inner parallax on large image card
    this.glassCard.addEventListener('pointermove', (e) => {
      const rect = this.glassCard.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width; // 0..1
      const ny = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - ny) * 10;
      const ry = (nx - 0.5) * 12;

      this.glassInner.classList.add('hovered');
      this.glassInner.style.transform = `scale(1.035) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      this.mainImg.style.transform = `translate(${((0.5 - nx) * 14).toFixed(1)}px, ${((0.5 - ny) * 10).toFixed(1)}px) scale(1.04)`;
      this.glassRim.style.background = `radial-gradient(circle at ${(nx * 100).toFixed(1)}% ${(ny * 100).toFixed(1)}%, rgba(242, 220, 178, 0.24) 0%, rgba(201, 165, 103, 0.06) 38%, transparent 70%)`;
    });

    this.glassCard.addEventListener('pointerleave', () => {
      this.glassInner.classList.remove('hovered');
      this.glassInner.style.transform = 'scale(1) rotateX(0deg) rotateY(0deg)';
      this.mainImg.style.transform = 'translate(0px, 0px) scale(1)';
    });

    // Smaller tilt & edge glint on square emblem tile
    this.emblemTile.addEventListener('pointermove', (e) => {
      const rect = this.emblemTile.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - ny) * 9;
      const ry = (nx - 0.5) * 9;
      this.emblemTile.style.transform = `perspective(700px) scale(1.03) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      this.emblemGlint.style.background = `radial-gradient(circle at ${(nx * 100).toFixed(1)}% ${(ny * 100).toFixed(1)}%, rgba(242, 220, 178, 0.22) 0%, transparent 65%)`;
    });

    this.emblemTile.addEventListener('pointerleave', () => {
      this.emblemTile.style.transform = 'perspective(700px) scale(1) rotateX(0deg) rotateY(0deg)';
    });

    // Scroll through entries; after final entry allow normal scroll down into footer!
    this.section.addEventListener(
      'wheel',
      (e) => {
        if (!this.isOpen || !this.modal.classList.contains('hidden')) return;
        const now = performance.now();
        const atTop = this.section.scrollTop <= 4;

        // If already scrolled down into footer, let normal scrolling bring user back to top
        if (!atTop) return;

        if (e.deltaY > 18) {
          if (this.activeIndex < ENTRIES.length - 1) {
            e.preventDefault();
            if (now > this.wheelCooldown) {
              this.wheelCooldown = now + 520;
              this.goToEntry(this.activeIndex + 1);
            }
          }
          // On last entry, do NOT preventDefault so user scrolls naturally into the compact charcoal footer!
        } else if (e.deltaY < -18) {
          if (this.activeIndex > 0) {
            e.preventDefault();
            if (now > this.wheelCooldown) {
              this.wheelCooldown = now + 520;
              this.goToEntry(this.activeIndex - 1);
            }
          }
        }
      },
      { passive: false }
    );

    // Touch swipe support for archive
    this.section.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
    });
    this.section.addEventListener('touchend', (e) => {
      if (!this.isOpen) return;
      const dy = this.touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 48 && this.section.scrollTop <= 4) {
        if (dy > 0 && this.activeIndex < ENTRIES.length - 1) {
          this.goToEntry(this.activeIndex + 1);
        } else if (dy < 0 && this.activeIndex > 0) {
          this.goToEntry(this.activeIndex - 1);
        }
      }
    });

    // Cursor trail particles across empty background
    this.section.addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const speed = this.lastMouseX < 0 ? 4 : Math.hypot(e.clientX - this.lastMouseX, e.clientY - this.lastMouseY);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      const count = Math.min(6, Math.max(1, Math.floor(speed / 9)));
      const spread = Math.min(26, 4 + speed * 0.32);
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * spread;
        this.dots.push({
          x: e.clientX + Math.cos(ang) * dist,
          y: e.clientY + Math.sin(ang) * dist,
          vx: Math.cos(ang) * (0.2 + Math.random() * 0.65),
          vy: Math.sin(ang) * (0.2 + Math.random() * 0.65),
          r: 1.4 + Math.random() * 2.1,
          life: 0,
          maxLife: 24 + Math.random() * 20,
        });
      }
      if (this.dots.length > 160) {
        this.dots.splice(0, this.dots.length - 160);
      }
    });
  }

  private resizeTrail(): void {
    this.trailCanvas.width = window.innerWidth;
    this.trailCanvas.height = window.innerHeight;
  }

  private animateTrail = (): void => {
    requestAnimationFrame(this.animateTrail);
    if (!this.isOpen) return;

    const ctx = this.trailCtx;
    ctx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);

    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life += 1;
      if (d.life >= d.maxLife) {
        this.dots.splice(i, 1);
        continue;
      }
      d.x += d.vx;
      d.y += d.vy;
      d.vx *= 0.96;
      d.vy *= 0.96;
      const alpha = (1 - d.life / d.maxLife) * 0.42;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 - d.life / d.maxLife * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(224, 198, 150, ${alpha.toFixed(3)})`;
      ctx.fill();
    }
  };
}
