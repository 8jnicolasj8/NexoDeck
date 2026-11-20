/* Grid rules shared by the panel and the Node self-test.
   Keep behavior aligned with Services/GridService.cs (authoritative copy). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GridRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const span = (value) => Math.max(1, Number(value) || 1);

  function fits(pos, cols, rows) {
    return pos.row >= 0 && pos.col >= 0 &&
      pos.row + span(pos.rowSpan) <= rows &&
      pos.col + span(pos.colSpan) <= cols;
  }

  function overlaps(a, b) {
    return a.row < b.row + span(b.rowSpan) && b.row < a.row + span(a.rowSpan) &&
      a.col < b.col + span(b.colSpan) && b.col < a.col + span(a.colSpan);
  }

  function isFree(buttons, ignoreIds, target) {
    return !buttons.some((button) => !ignoreIds.includes(button.id) && overlaps(button.pos, target));
  }

  function moveOrSwap(buttons, buttonId, row, col, cols, rows) {
    const button = buttons.find((item) => item.id === buttonId);
    if (!button) return { ok: false, buttons, error: 'missing' };

    const target = Object.assign({}, button.pos, { row, col });
    if (!fits(target, cols, rows)) return { ok: false, buttons, error: 'out_of_bounds' };

    const occupied = buttons.filter((item) => item.id !== buttonId && overlaps(item.pos, target));
    if (occupied.length === 0) {
      return {
        ok: true,
        buttons: buttons.map((item) => item.id === buttonId ? Object.assign({}, item, { pos: target }) : item)
      };
    }

    if (occupied.length > 1) return { ok: false, buttons, error: 'blocked' };

    const other = occupied[0];
    const otherTarget = Object.assign({}, other.pos, { row: button.pos.row, col: button.pos.col });
    if (!fits(otherTarget, cols, rows) || !isFree(buttons, [other.id, button.id], otherTarget)) {
      return { ok: false, buttons, error: 'blocked' };
    }

    return {
      ok: true,
      buttons: buttons.map((item) => {
        if (item.id === buttonId) return Object.assign({}, item, { pos: target });
        if (item.id === other.id) return Object.assign({}, item, { pos: otherTarget });
        return item;
      })
    };
  }

  function findFirstFree(buttons, cols, rows, rowSpan, colSpan) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const candidate = { row, col, rowSpan: span(rowSpan), colSpan: span(colSpan) };
        if (fits(candidate, cols, rows) && isFree(buttons, [], candidate)) return candidate;
      }
    }
    return null;
  }

  function fixOutOfRange(buttons, cols, rows) {
    const placed = [];
    const warnings = [];
    buttons.forEach((button) => {
      const fitsNow = fits(button.pos, cols, rows) && isFree(placed, [], button.pos);
      if (fitsNow) {
        placed.push(button);
        return;
      }
      const free = findFirstFree(placed, cols, rows, button.pos.rowSpan, button.pos.colSpan);
      if (!free) {
        warnings.push(button.label || button.id);
        placed.push(button);
        return;
      }
      warnings.push(button.label || button.id);
      placed.push(Object.assign({}, button, { pos: Object.assign({}, button.pos, free) }));
    });

    return { buttons: placed, warnings };
  }

  function validate(buttons, cols, rows) {
    const errors = [];
    buttons.forEach((button, index) => {
      if (!fits(button.pos, cols, rows)) errors.push({ index, reason: 'out_of_bounds' });
      if (buttons.some((other, otherIndex) => otherIndex !== index && overlaps(other.pos, button.pos))) {
        errors.push({ index, reason: 'overlap' });
      }
    });
    return errors;
  }

  return { fits, overlaps, moveOrSwap, findFirstFree, fixOutOfRange, validate };
});
