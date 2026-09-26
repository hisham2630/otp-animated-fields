import {
  resolveGeometry,
  rowCenter,
  orbitCenter,
  travel,
  shakeOffset,
  convergence,
  type GeometryTheme,
} from './geometry';

const theme: GeometryTheme = {
  boxSize: 56,
  gap: 10,
  orbitBoxScale: 0.64,
};

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const g = resolveGeometry(6, theme, 360);
assert(g.fit <= 1, 'fit should be <= 1');
assert(g.boxSize > 0, 'boxSize positive');
assert(g.width >= g.boxSize, 'width covers a box');

const first = rowCenter(g, 0);
const last = rowCenter(g, 5);
assert(first.x < last.x, 'row centers left to right');
assert(Math.abs(first.y - last.y) < 1e-9, 'row centers share y');

const o0 = orbitCenter(g, 0, 0);
const o5 = orbitCenter(g, 5, 0);
const midX = g.width / 2;
const midY = g.height / 2;
// First/last are mirrors about the vertical axis (row wrapped onto the circle).
assert(Math.abs(o0.x + o5.x - 2 * midX) < 1e-6, 'ends symmetric in x');
assert(Math.abs(o0.y - o5.y) < 1e-6, 'ends share y');
assert(
  Math.abs(Math.hypot(o0.x - midX, o0.y - midY) - g.orbitRadius) < 1e-6,
  'first box on orbit',
);

assert(travel(0, 0, 6) === 0, 'travel at morph 0');
assert(travel(1, 5, 6) === 1, 'travel at morph 1');
assert(travel(0.2, 0, 6) > travel(0.2, 5, 6), 'earlier boxes leave first');

assert(Math.abs(shakeOffset(0)) < 1e-9, 'shake starts at 0');
assert(Math.abs(shakeOffset(1)) < 1e-9, 'shake ends at 0');
assert(convergence(0) === 0, 'convergence starts at 0');
assert(convergence(1) === 1, 'convergence ends at 1');

// Narrow width shrinks boxes.
const tight = resolveGeometry(6, theme, 200);
assert(tight.fit < 1, 'tight fit shrinks');
assert(tight.boxSize < theme.boxSize, 'boxSize shrunk');

console.log('geometry.selfcheck: ok');
