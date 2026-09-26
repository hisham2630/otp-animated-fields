/** Point in the field's coordinate space. */
export type Point = { x: number; y: number };

/** Resolved sizes and positions for one layout pass. */
export type OtpGeometry = {
  length: number;
  fit: number;
  boxSize: number;
  gap: number;
  orbitBoxScale: number;
  orbitRadius: number;
  width: number;
  height: number;
};

const EXTENT_FACTOR = 0.75;

export type GeometryTheme = {
  boxSize: number;
  gap: number;
  orbitBoxScale: number;
  orbitRadius?: number;
};

/** Fit `length` boxes to `maxWidth`; shrink proportionally when needed. */
export function resolveGeometry(
  length: number,
  theme: GeometryTheme,
  maxWidth: number,
): OtpGeometry {
  if (length <= 0) {
    throw new Error('length must be positive');
  }

  const naturalRowWidth = length * theme.boxSize + (length - 1) * theme.gap;
  const bounded = Number.isFinite(maxWidth) && maxWidth > 0;
  const fit =
    bounded && maxWidth < naturalRowWidth ? maxWidth / naturalRowWidth : 1;
  const boxSize = theme.boxSize * fit;
  const gap = theme.gap * fit;
  const orbitBoxSize = boxSize * theme.orbitBoxScale;

  // Keep neighbours on the orbit 1.5 boxes apart, center to center.
  const spacingRadius =
    length >= 3 ? (orbitBoxSize * 1.5) / (2 * Math.sin(Math.PI / length)) : 0;
  let orbitRadius = theme.orbitRadius ?? Math.max(boxSize * 0.83, spacingRadius);
  if (bounded) {
    const widestRadius = maxWidth / 2 - orbitBoxSize * EXTENT_FACTOR;
    orbitRadius = Math.max(0, Math.min(orbitRadius, widestRadius));
  }

  const orbitExtent = 2 * (orbitRadius + orbitBoxSize * EXTENT_FACTOR);
  const rowWidth = length * boxSize + (length - 1) * gap;

  return {
    length,
    fit,
    boxSize,
    gap,
    orbitBoxScale: theme.orbitBoxScale,
    orbitRadius,
    width: Math.max(rowWidth, orbitExtent),
    height: Math.max(boxSize, orbitExtent),
  };
}

export function rowWidth(g: OtpGeometry): number {
  'worklet';
  return g.length * g.boxSize + (g.length - 1) * g.gap;
}

export function orbitBoxSize(g: OtpGeometry): number {
  return g.boxSize * g.orbitBoxScale;
}

export function innerRingRadius(g: OtpGeometry): number {
  return g.orbitRadius + orbitBoxSize(g) * 0.19;
}

export function outerRingRadius(g: OtpGeometry): number {
  return g.orbitRadius + orbitBoxSize(g) * 0.62;
}

export function center(g: OtpGeometry): Point {
  'worklet';
  return { x: g.width / 2, y: g.height / 2 };
}

/** Center of box `index` in the idle row. */
export function rowCenter(g: OtpGeometry, index: number): Point {
  'worklet';
  const left = (g.width - rowWidth(g)) / 2;
  return {
    x: left + index * (g.boxSize + g.gap) + g.boxSize / 2,
    y: g.height / 2,
  };
}

/**
 * Base angle on the orbit before rotation.
 * First and last boxes wrap over the top so digits read clockwise.
 */
export function baseAngle(g: OtpGeometry, index: number): number {
  'worklet';
  const step = (2 * Math.PI) / g.length;
  return -Math.PI / 2 + (index - (g.length - 1) / 2) * step;
}

/** Center of box `index` after `turns` revolutions. */
export function orbitCenter(
  g: OtpGeometry,
  index: number,
  turns: number,
  radiusFactor = 1,
): Point {
  'worklet';
  const angle = baseAngle(g, index) + turns * 2 * Math.PI;
  const r = g.orbitRadius * radiusFactor;
  const c = center(g);
  return { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r };
}

/** Cubic ease-in-out, matching Flutter Curves.easeInOutCubic. */
export function easeInOutCubic(t: number): number {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Cubic ease-in, matching Flutter Curves.easeInCubic. */
export function easeInCubic(t: number): number {
  'worklet';
  return t * t * t;
}

function clamp01(v: number): number {
  'worklet';
  return Math.min(1, Math.max(0, v));
}

/**
 * Staggered morph progress for box `index` (0 = row, 1 = orbit).
 * Port of OtpMotion.travel.
 */
export function travel(morph: number, index: number, length: number): number {
  'worklet';
  const delay = length > 1 ? Math.min(0.08, 0.3 / (length - 1)) : 0;
  const window = 1 - delay * (length - 1);
  const local = (morph - delay * index) / window;
  return easeInOutCubic(clamp01(local));
}

/** Success collapse 0→1 over the first 45% of the success animation. */
export function convergence(success: number): number {
  'worklet';
  return easeInCubic(clamp01(success / 0.45));
}

/**
 * Horizontal shake offset as a fraction of amplitude.
 * Shake occupies the first 60% of the error animation; then a pause.
 */
export function shakeOffset(shake: number): number {
  'worklet';
  const t = clamp01(shake / 0.6);
  const swings = 3;
  return Math.sin(t * swings * 2 * Math.PI) * (1 - t);
}
