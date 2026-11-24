import './style.css';
import { BathysAudio } from './audio';
import { OceanScene, ExperienceStage } from './oceanScene';
import { DiveArchive } from './archive';

// Build engraved ticks on the depth gauge loader SVG
function buildGaugeTicks(): void {
  const ticksGroup = document.getElementById('gauge-ticks');
  if (!ticksGroup) return;
  for (let i = 0; i <= 26; i++) {
    const deg = -130 + (i / 26) * 260;
    const rad = ((deg - 90) * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = major ? 84 : 90;
    const r2 = 98;
    const x1 = 120 + Math.cos(rad) * r1;
    const y1 = 120 + Math.sin(rad) * r1;
    const x2 = 120 + Math.cos(rad) * r2;
    const y2 = 120 + Math.sin(rad) * r2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    if (major) line.setAttribute('stroke-width', '1.9');
    ticksGroup.appendChild(line);
  }
}

buildGaugeTicks();

const audio = new BathysAudio();
const canvas = document.getElementById('bathys-canvas') as HTMLCanvasElement;
const ocean = new OceanScene(canvas, audio);
const archive = new DiveArchive();

// UI elements
const loaderOverlay = document.getElementById('loader-overlay')!;
const gaugeNeedle = document.getElementById('gauge-needle')!;
const loaderPct = document.getElementById('loader-pct')!;
const loaderDepthText = document.getElementById('loader-depth-text')!;
const illuminatePrompt = document.getElementById('illuminate-prompt')!;
const topHeader = document.getElementById('top-header')!;
const heroOverlay = document.getElementById('hero-overlay')!;
const logoStrip = document.getElementById('logo-strip')!;
const tourCaption = document.getElementById('tour-caption')!;
const tourKicker = document.getElementById('tour-kicker')!;
const tourHeading = document.getElementById('tour-heading')!;
const tourBody = document.getElementById('tour-body')!;
const diveHud = document.getElementById('dive-hud')!;
const hudSpeed = document.getElementById('hud-speed')!;
const hudHeading = document.getElementById('hud-heading')!;
const hudDepth = document.getElementById('hud-depth')!;
const hudView = document.getElementById('hud-view')!;
const cockpitClickHint = document.getElementById('cockpit-click-hint')!;
const locationCard = document.getElementById('location-card')!;
const locTag = document.getElementById('loc-tag')!;
const locTitle = document.getElementById('loc-title')!;
const locDesc = document.getElementById('loc-desc')!;
const navPills = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-pill'));
const soundButtons = [
  document.getElementById('header-sound-btn') as HTMLButtonElement,
  document.getElementById('footer-sound-btn') as HTMLButtonElement,
];
const oceanStage = document.getElementById('ocean-stage')!;
const ovalTransition = document.getElementById('oval-transition')!;
const ovalRimEllipse = document.getElementById('oval-rim-ellipse')!;

// Track scroll gesture cooldown & fresh 4th scroll gesture detection
let scrollLockUntil = 0;
let diveSettledAt = 0;
let lastWheelTime = 0;
let transitioningToArchive = false;

const TOUR_COPY: Record<number, { kicker: string; heading: string; body: string }> = {
  1: {
    kicker: '01 · PANORAMIC VIEWPORT',
    heading: 'UNBROKEN SIGHTLINE',
    body: 'Cast in 112mm optically pure acrylic and framed in brushed dark titanium, the forward pressure dome delivers a 180-degree view of the abyssal floor.',
  },
  2: {
    kicker: '02 · VECTORED PROPULSION',
    heading: 'WHISPER-QUIET THRUST',
    body: 'Four shrouded multi-blade thrusters with champagne-gold rear fairings glide through the midnight zone without disturbing pelagic schools.',
  },
};

function updateNavActive(activeIdx: number): void {
  navPills.forEach((p, i) => p.classList.toggle('active', i === activeIdx));
}

function syncSoundButtons(): void {
  const muted = audio.isMuted();
  for (const btn of soundButtons) {
    btn.classList.toggle('muted', muted);
    const label = btn.querySelector('.sound-label');
    if (label) label.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  }
}

soundButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.start();
    audio.toggleMute();
    syncSoundButtons();
  });
});

// Loading progress drives the engraved depth gauge needle (-130 deg -> +130 deg)
ocean.onLoadProgress = (pct) => {
  const angle = -130 + (pct / 100) * 260;
  gaugeNeedle.setAttribute('transform', `rotate(${angle.toFixed(1)} 120 120)`);
  loaderPct.textContent = `${pct}%`;
  loaderDepthText.textContent = `${String(Math.round((pct / 100) * 4000)).padStart(4, '0')} M`;
};

ocean.onLoaded = () => {
  window.setTimeout(() => {
    loaderOverlay.classList.add('done');
    illuminatePrompt.classList.remove('hidden');
  }, 380);
};

// Opening click illuminates ocean & fades in header, hero copy, CTA, and logo strip
ocean.onIlluminated = () => {
  illuminatePrompt.classList.add('fade-out');
  window.setTimeout(() => illuminatePrompt.classList.add('hidden'), 750);

  window.setTimeout(() => {
    topHeader.classList.add('visible');
    heroOverlay.classList.add('visible');
    logoStrip.classList.add('visible');
  }, 550);
};

// Stage transitions
ocean.onStageChanged = (stage: ExperienceStage, settled: boolean) => {
  updateNavActive(stage);
  heroOverlay.classList.toggle('visible', stage === 0);
  logoStrip.classList.toggle('visible', stage === 0);

  if (stage === 1 || stage === 2) {
    const copy = TOUR_COPY[stage];
    tourKicker.textContent = copy.kicker;
    tourHeading.textContent = copy.heading;
    tourBody.textContent = copy.body;
    tourCaption.classList.toggle('visible', settled);
  } else {
    tourCaption.classList.remove('visible');
  }

  if (stage === 3 && settled) {
    diveHud.classList.add('visible');
    diveSettledAt = performance.now();
  } else if (stage < 3) {
    diveHud.classList.remove('visible');
    locationCard.classList.remove('visible');
  }
};

// Live telemetry in playable dive mode
ocean.onTelemetry = (speedKts, headingDeg, depthM, inCockpit) => {
  hudSpeed.textContent = `${speedKts.toFixed(1)} KTS`;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinal = dirs[Math.round(headingDeg / 45) % 8];
  hudHeading.textContent = `${String(Math.round(headingDeg)).padStart(3, '0')}° ${cardinal}`;
  hudDepth.textContent = `${depthM.toLocaleString()} M`;
  hudView.textContent = inCockpit ? 'COCKPIT' : 'CHASE';
  cockpitClickHint.classList.toggle('hidden', !inCockpit);
};

// Location-triggered descriptions (one at a time)
ocean.onLocationChanged = (note) => {
  if (!note) {
    locationCard.classList.remove('visible');
    return;
  }
  locTag.textContent = note.tag;
  locTitle.textContent = note.title;
  locDesc.textContent = note.desc;
  locationCard.classList.add('visible');
};

// Hero CTA starts Move 1
document.getElementById('hero-cta')?.addEventListener('click', (e) => {
  e.stopPropagation();
  (e.currentTarget as HTMLButtonElement).blur();
  audio.playUiTick();
  ocean.goToStage(1);
});

// Header stage pills
navPills.forEach((pill) => {
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    pill.blur();
    const st = Number(pill.dataset.stage);
    audio.playUiTick();
    if (st === 4) {
      openArchiveWithOvalTransition();
    } else {
      if (archive.isOpened()) {
        closeArchiveToOcean(false);
      }
      ocean.goToStage(st as ExperienceStage);
    }
  });
});

// Explicit "Scroll to Dive Archive" cue button
document.getElementById('scroll-archive-cue')?.addEventListener('click', (e) => {
  e.stopPropagation();
  (e.currentTarget as HTMLButtonElement).blur();
  audio.playUiTick();
  openArchiveWithOvalTransition();
});

// Shrinking oval transition with soft champagne-gold rim glow (no flash/flames!)
function openArchiveWithOvalTransition(): void {
  if (transitioningToArchive || archive.isOpened()) return;
  transitioningToArchive = true;
  updateNavActive(4);

  // Capture a live snapshot from the player's current ocean view for "The Vessel" entry
  if (ocean.isIlluminated()) {
    try {
      const snap = ocean.captureSnapshot();
      if (snap && snap.length > 1000) {
        archive.setEntryImage('vessel', snap);
      }
    } catch {
      // keep default rendered image
    }
  }

  diveHud.classList.remove('visible');
  heroOverlay.classList.remove('visible');
  tourCaption.classList.remove('visible');
  logoStrip.classList.remove('visible');

  ovalTransition.style.opacity = '1';
  const start = performance.now();
  const duration = 950;

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Shrink oval from 78% down to 0% while blurring & darkening outer edges
    const rx = Math.max(0.2, 78 * (1 - ease));
    const ry = Math.max(0.2, 72 * (1 - ease));
    ovalRimEllipse.setAttribute('rx', rx.toFixed(2));
    ovalRimEllipse.setAttribute('ry', ry.toFixed(2));
    ovalTransition.style.background = `radial-gradient(ellipse ${rx.toFixed(1)}% ${ry.toFixed(1)}% at 50% 50%, rgba(10,13,18,0) 64%, rgba(12,14,18,${(0.35 + ease * 0.65).toFixed(2)}) 100%)`;
    oceanStage.style.filter = `blur(${(ease * 8).toFixed(1)}px) brightness(${(1 - ease * 0.55).toFixed(2)})`;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      ocean.setArchivePaused(true);
      archive.open();
      ovalTransition.style.opacity = '0';
      oceanStage.style.filter = 'none';
      transitioningToArchive = false;
    }
  };
  requestAnimationFrame(step);
}

function closeArchiveToOcean(resetToTop: boolean): void {
  archive.close();
  ocean.setArchivePaused(false);
  oceanStage.style.filter = 'none';
  if (resetToTop) {
    ocean.goToStage(0);
    updateNavActive(0);
  } else {
    // Restore visitor's last dive position & cockpit/chase view!
    const st = ocean.getStage();
    updateNavActive(st);
    if (st === 3) {
      diveHud.classList.add('visible');
      diveSettledAt = performance.now();
    } else if (st === 0) {
      heroOverlay.classList.add('visible');
      logoStrip.classList.add('visible');
    }
  }
}

archive.onReturnToOcean = () => closeArchiveToOcean(false);
archive.onBackToTop = () => closeArchiveToOcean(true);
archive.onUiTick = () => audio.playUiTick();

// Deliberate scroll-driven camera moves (1, 2, 3) + fresh 4th scroll gesture for Dive Archive
window.addEventListener(
  'wheel',
  (e) => {
    if (archive.isOpened() || transitioningToArchive) return;
    if (!ocean.isIlluminated()) return;

    const now = performance.now();
    const gapSinceLastWheel = now - lastWheelTime;
    lastWheelTime = now;

    if (ocean.isCameraMoving() || now < scrollLockUntil) return;
    if (Math.abs(e.deltaY) < 16) return;

    const st = ocean.getStage();
    if (e.deltaY > 0) {
      if (st < 3) {
        scrollLockUntil = now + 900;
        ocean.goToStage((st + 1) as ExperienceStage);
      } else if (st === 3) {
        // Fresh fourth scroll gesture only: ignore leftover trackpad momentum!
        const settledLongEnough = now - diveSettledAt > 1200;
        const isFreshGesture = gapSinceLastWheel > 260;
        if (settledLongEnough && isFreshGesture) {
          openArchiveWithOvalTransition();
        }
      }
    } else if (e.deltaY < 0 && st > 0) {
      scrollLockUntil = now + 900;
      ocean.goToStage((st - 1) as ExperienceStage);
    }
  },
  { passive: true }
);
