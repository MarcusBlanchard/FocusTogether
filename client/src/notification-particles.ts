/**
 * Canvas particle background for Tauri notification windows (vanilla HTML).
 * Theme via window.__NOTIFICATION_PARTICLES__ before this module loads.
 */

import "./notification-shell.css";

export interface NotificationParticleConfig {
  color?: string;
  particleCount?: number;
  animationSpeed?: number;
  alpha?: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  baseSize: number;
  phase: number;
  speed: number;
  vx: number;
  vy: number;
  angle: number;
}

interface RuntimeSettings extends Required<NotificationParticleConfig> {}

function initParticle(width: number, height: number): Particle {
  const baseSize = 4 + Math.random() * 6;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    size: baseSize,
    baseSize,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.6,
    vx: (0.2 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1),
    vy: (0.1 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1),
    angle: Math.random() * Math.PI * 2,
  };
}

function initParticles(width: number, height: number, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) particles.push(initParticle(width, height));
  return particles;
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.6, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const defaultCfg: RuntimeSettings = {
  color: "#ffffff",
  particleCount: 40,
  animationSpeed: 1,
  alpha: 0.15,
};

function readWindowConfig(): RuntimeSettings {
  const w = window as Window & {
    __NOTIFICATION_PARTICLES__?: NotificationParticleConfig;
  };
  const c = w.__NOTIFICATION_PARTICLES__ || {};
  return {
    color: c.color ?? defaultCfg.color,
    particleCount: Math.max(
      10,
      Math.min(500, c.particleCount ?? defaultCfg.particleCount),
    ),
    animationSpeed: c.animationSpeed ?? defaultCfg.animationSpeed,
    alpha: c.alpha ?? defaultCfg.alpha,
  };
}

export function startNotificationParticles(canvas: HTMLCanvasElement): {
  setColor: (color: string, alpha?: number) => void;
  setAnimationSpeed: (n: number) => void;
  stop: () => void;
} {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      setColor: () => {},
      setAnimationSpeed: () => {},
      stop: () => {},
    };
  }

  let settings: RuntimeSettings = readWindowConfig();
  const particlesRef: { current: Particle[] } = { current: [] };
  const sizeRef = { width: 0, height: 0 };
  let animationId = 0;

  const resize = () => {
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    canvas.width = width;
    canvas.height = height;
    sizeRef.width = width;
    sizeRef.height = height;
    particlesRef.current = initParticles(
      width,
      height,
      settings.particleCount,
    );
  };

  resize();
  window.addEventListener("resize", resize);

  const animate = (time: number) => {
    const { width, height } = sizeRef;
    const { color, animationSpeed, alpha } = settings;
    const speedMult = animationSpeed;
    const elapsed = time * 0.001 * speedMult;

    ctx.clearRect(0, 0, width, height);

    for (const p of particlesRef.current) {
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;
      p.size = p.baseSize * (0.8 + 0.2 * Math.sin(elapsed * p.speed + p.phase));

      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      drawDiamond(ctx, p.x, p.y, p.size, p.angle);
      ctx.restore();
    }

    animationId = requestAnimationFrame(animate);
  };

  animationId = requestAnimationFrame(animate);

  return {
    setColor(color: string, alphaOverride?: number) {
      settings = {
        ...settings,
        color,
        ...(alphaOverride !== undefined ? { alpha: alphaOverride } : {}),
      };
    },
    setAnimationSpeed(n: number) {
      settings = { ...settings, animationSpeed: n };
    },
    stop() {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    },
  };
}

declare global {
  interface Window {
    __NOTIFICATION_PARTICLES__?: NotificationParticleConfig;
    __notificationParticles?: ReturnType<typeof startNotificationParticles>;
  }
}

function boot() {
  const canvas = document.getElementById(
    "particle-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;

  const api = startNotificationParticles(canvas);
  window.__notificationParticles = api;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
