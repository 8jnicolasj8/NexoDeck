namespace VexaDeck.Server.Services;

/// <summary>
/// Authoritative grid rules: bounds, overlap, swap and out-of-range recovery.
/// The admin panel mirrors these rules in <c>wwwroot/gridRules.js</c>.
/// </summary>
internal static class GridService
{
    internal sealed record MoveResult(bool Ok, List<ButtonConfig> Buttons, string? Error);

    public static bool Fits(PositionConfig pos, GridConfig grid) =>
        pos.Row >= 0 && pos.Col >= 0 &&
        pos.Row + Math.Max(1, pos.RowSpan) <= grid.Rows &&
        pos.Col + Math.Max(1, pos.ColSpan) <= grid.Cols;

    public static bool Overlaps(PositionConfig a, PositionConfig b) =>
        a.Row < b.Row + Math.Max(1, b.RowSpan) && b.Row < a.Row + Math.Max(1, a.RowSpan) &&
        a.Col < b.Col + Math.Max(1, b.ColSpan) && b.Col < a.Col + Math.Max(1, a.ColSpan);

    public static MoveResult MoveOrSwap(List<ButtonConfig> buttons, string buttonId, int row, int col, GridConfig grid)
    {
        var button = buttons.FirstOrDefault(b => b.Id == buttonId);
        if (button is null) return new(false, buttons, "No se encontró el botón.");

        var target = button.Pos with { Row = row, Col = col };
        if (!Fits(target, grid)) return new(false, buttons, "La celda destino está fuera de la grilla.");

        var occupied = buttons
            .Where(b => b.Id != buttonId && Overlaps(b.Pos, target))
            .ToList();

        if (occupied.Count == 0)
        {
            return new(true, buttons.Select(b => b.Id == buttonId ? b with { Pos = target } : b).ToList(), null);
        }

        if (occupied.Count > 1)
        {
            return new(false, buttons, "El botón no cabe en esa celda sin pisar a otro.");
        }

        var other = occupied[0];
        var otherTarget = other.Pos with { Row = button.Pos.Row, Col = button.Pos.Col };
        if (!Fits(otherTarget, grid) || !IsFree(buttons, other.Id, otherTarget, buttonId))
        {
            return new(false, buttons, "El botón no cabe en esa celda sin pisar a otro.");
        }

        return new(true, buttons.Select(b =>
        {
            if (b.Id == buttonId) return b with { Pos = target };
            if (b.Id == other.Id) return b with { Pos = otherTarget };
            return b;
        }).ToList(), null);
    }

    public static bool CanPlace(List<ButtonConfig> buttons, string? ignoreId, PositionConfig target, GridConfig grid) =>
        Fits(target, grid) && IsFree(buttons, ignoreId, target, ignoreId);

    public static List<string> Validate(PageConfig page, GridConfig grid)
    {
        var errors = new List<string>();
        var buttons = page.Buttons;
        foreach (var button in buttons)
        {
            if (!Fits(button.Pos, grid))
            {
                errors.Add($"«{button.Label}» queda fuera de la grilla ({grid.Cols}×{grid.Rows}).");
                continue;
            }

            if (buttons.Any(other => other.Id != button.Id && Overlaps(other.Pos, button.Pos)))
            {
                errors.Add($"«{button.Label}» se superpone con otro botón.");
            }
        }
        return errors;
    }

    /// <summary>Moves every out-of-range/overlapping button to the first free cell. Never drops a button.</summary>
    public static (ProfileConfig Profile, List<string> Warnings) FixOutOfRange(ProfileConfig profile)
    {
        var warnings = new List<string>();
        var pages = profile.Pages.Select(page =>
        {
            var placed = new List<ButtonConfig>();
            var result = new List<ButtonConfig>();

            foreach (var button in page.Buttons)
            {
                var fits = Fits(button.Pos, profile.Grid) &&
                           !placed.Any(other => Overlaps(other.Pos, button.Pos));
                if (fits)
                {
                    placed.Add(button);
                    result.Add(button);
                    continue;
                }

                var free = FindFirstFree(placed, profile.Grid, button.Pos);
                if (free is null)
                {
                    warnings.Add($"«{button.Label}» no pudo reubicarse: la grilla está llena.");
                    placed.Add(button);
                    result.Add(button);
                    continue;
                }

                warnings.Add($"«{button.Label}» se movió a la primera celda libre ({free.Row + 1}, {free.Col + 1}).");
                var moved = button with { Pos = button.Pos with { Row = free.Row, Col = free.Col } };
                placed.Add(moved);
                result.Add(moved);
            }

            return page with { Buttons = result };
        }).ToList();

        return (profile with { Pages = pages }, warnings);
    }

    public static PositionConfig? FindFirstFree(
        IEnumerable<ButtonConfig> placed,
        GridConfig grid,
        PositionConfig template)
    {
        var list = placed.ToList();
        for (var row = 0; row < grid.Rows; row++)
        {
            for (var col = 0; col < grid.Cols; col++)
            {
                var candidate = template with { Row = row, Col = col };
                if (Fits(candidate, grid) && !list.Any(other => Overlaps(other.Pos, candidate)))
                {
                    return candidate;
                }
            }
        }
        return null;
    }

    /// <summary>First free cell of a page where a button with the given span fits.</summary>
    public static PositionConfig? FindFirstFree(PageConfig page, GridConfig grid, int rowSpan = 1, int colSpan = 1)
    {
        for (var row = 0; row < grid.Rows; row++)
        {
            for (var col = 0; col < grid.Cols; col++)
            {
                var candidate = new PositionConfig(row, col, rowSpan, colSpan);
                if (Fits(candidate, grid) && !page.Buttons.Any(other => Overlaps(other.Pos, candidate)))
                {
                    return candidate;
                }
            }
        }
        return null;
    }

    private static bool IsFree(List<ButtonConfig> buttons, string? ignoreId, PositionConfig target, string? alsoIgnoreId) =>
        !buttons.Any(b => b.Id != ignoreId && b.Id != alsoIgnoreId && Overlaps(b.Pos, target));
}
