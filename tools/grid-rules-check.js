// Self-check for wwwroot/gridRules.js (panel) which must stay aligned with Services/GridService.cs.
// Run with: node tools/grid-rules-check.js
const assert = require('assert');
const G = require('../server/src/OpenDeck.Server/wwwroot/gridRules.js');

const mk = (id, row, col, rowSpan, colSpan) => ({ id, pos: { row, col, rowSpan, colSpan } });

// Move "Bloquear PC" from (1,3) to an empty (3,3).
let result = G.moveOrSwap([mk('lock', 1, 3), mk('other', 0, 0)], 'lock', 3, 3, 4, 4);
assert.strictEqual(result.ok, true);
assert.strictEqual(result.buttons.find((b) => b.id === 'lock').pos.row, 3);
assert.strictEqual(result.buttons.find((b) => b.id === 'lock').pos.col, 3);

// Dropping on an occupied cell swaps both buttons.
result = G.moveOrSwap([mk('a', 0, 0), mk('b', 2, 2)], 'a', 2, 2, 4, 4);
assert.strictEqual(result.ok, true);
assert.deepStrictEqual(
  [result.buttons.find((b) => b.id === 'a').pos.row, result.buttons.find((b) => b.id === 'b').pos.row],
  [2, 0]);

// Out-of-bounds targets are rejected.
assert.strictEqual(G.moveOrSwap([mk('a', 0, 0)], 'a', 5, 0, 4, 4).ok, false);

// A 2x2 button cannot land where it would overlap two buttons.
assert.strictEqual(G.moveOrSwap([mk('big', 0, 0, 2, 2), mk('x', 1, 1), mk('y', 1, 2)], 'big', 1, 1, 4, 4).ok, false);

// A 2x2 button cannot be swapped into a slot that does not fit it.
assert.strictEqual(G.moveOrSwap([mk('big', 0, 0, 2, 2), mk('edge', 2, 2)], 'big', 2, 2, 3, 3).ok, false);

// Legal swap next to a spanned button.
assert.strictEqual(G.moveOrSwap([mk('big', 0, 0, 2, 2), mk('x', 1, 1)], 'x', 2, 2, 4, 4).ok, true);

// First free cell of a page (used when dropping on a page tab).
assert.deepStrictEqual(
  G.findFirstFree([mk('a', 0, 0)], 4, 3, 1, 1),
  { row: 0, col: 1, rowSpan: 1, colSpan: 1 });
assert.strictEqual(G.findFirstFree([mk('a', 0, 0)], 1, 1, 1, 1), null);

// Shrinking the grid relocates buttons instead of dropping them.
const fixed = G.fixOutOfRange([mk('a', 3, 3), mk('b', 0, 0)], 2, 2);
assert.strictEqual(fixed.buttons.length, 2);
assert.ok(G.fits(fixed.buttons[0].pos, 2, 2));

console.log('grid rules self-check: OK');
