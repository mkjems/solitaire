/**
 * The win celebration: gold foil and sparks burst from the foundations, then
 * a gentle fall of gold across the table. Drawn on a canvas above the cards
 * that removes itself when the last particle has gone.
 */

import type { Point } from './layout';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds before the particle appears. */
  delay: number;
  life: number;
  age: number;
  size: number;
  colour: string;
  spark: boolean;
  spin: number;
  phase: number;
}

const FOIL = ['#f6e09a', '#e6c879', '#cfa850', '#b8903c', '#fff3c4', '#f1d27c'];
const GRAVITY = 900;

export function celebrate(container: HTMLElement, origins: readonly Point[], cardW: number): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const width = container.clientWidth;
  const height = container.clientHeight;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration';
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(ratio, ratio);

  const scale = Math.max(0.6, Math.min(1.6, cardW / 110));
  const particles: Particle[] = [];
  const add = (p: Omit<Particle, 'age' | 'spin' | 'phase'>): void => {
    particles.push({ ...p, age: 0, spin: 4 + Math.random() * 8, phase: Math.random() * Math.PI * 2 });
  };

  // Bursts from each foundation, one after another.
  origins.forEach((origin, i) => {
    // The foundations sit near the top of the screen, so the burst is kept
    // low enough to stay in view and then drifts down over the table.
    const room = Math.max(60, origin.y - 10);
    for (let k = 0; k < 54; k++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const speed = (0.5 + Math.random() * 0.9) * Math.min(620 * scale, room * 2.4);
      add({
        x: origin.x + (Math.random() - 0.5) * cardW * 0.6,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        delay: 0.45 + i * 0.12 + Math.random() * 0.08,
        life: 2.6 + Math.random() * 1.8,
        size: (3 + Math.random() * 4) * scale,
        colour: FOIL[Math.floor(Math.random() * FOIL.length)] as string,
        spark: Math.random() < 0.35,
      });
    }
  });

  // Then gold drifting down across the whole table.
  const rain = Math.round(Math.min(160, width / 9));
  for (let k = 0; k < rain; k++) {
    add({
      x: Math.random() * width,
      y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 60,
      vy: 40 + Math.random() * 120,
      delay: 1.1 + Math.random() * 1.6,
      life: 3.2 + Math.random() * 1.4,
      size: (3 + Math.random() * 4) * scale,
      colour: FOIL[Math.floor(Math.random() * FOIL.length)] as string,
      spark: Math.random() < 0.2,
    });
  }

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);

    let alive = 0;
    for (const p of particles) {
      if (p.delay > 0) {
        p.delay -= dt;
        alive++;
        continue;
      }
      p.age += dt;
      if (p.age > p.life) continue;
      alive++;

      // Foil flutters: strong air drag, so it floats rather than drops.
      const drag = p.spark ? 1.2 : 2.6;
      p.vx -= p.vx * drag * dt;
      p.vy += GRAVITY * (p.spark ? 0.5 : 0.28) * dt - p.vy * drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.phase += p.spin * dt;

      const fade = Math.min(1, (p.life - p.age) / 0.6) * Math.min(1, p.age / 0.08);
      if (p.spark) {
        const twinkle = 0.55 + 0.45 * Math.sin(p.phase * 2.3);
        ctx.globalAlpha = fade * twinkle;
        const r = p.size * 1.6;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        glow.addColorStop(0, '#fffbe8');
        glow.addColorStop(0.3, p.colour);
        glow.addColorStop(1, 'rgba(230,200,121,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      } else {
        // A small rectangle of foil turning in the air.
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.phase * 0.6);
        const w = p.size * Math.abs(Math.cos(p.phase));
        ctx.fillStyle = Math.cos(p.phase) > 0 ? p.colour : '#9c7a32';
        ctx.fillRect(-w / 2, -p.size * 0.35, Math.max(0.6, w), p.size * 0.7);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    if (alive > 0 && canvas.isConnected) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Removes any celebration still running, for a new game. */
export function stopCelebration(container: HTMLElement): void {
  for (const canvas of container.querySelectorAll('canvas.celebration')) canvas.remove();
}
