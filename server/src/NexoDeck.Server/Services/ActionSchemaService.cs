using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NexoDeck.Server.Services;

/// <summary>
/// Single source of truth for the action catalog. Loaded from the embedded
/// <c>shared/actionSchemas.json</c>, the same file the admin panel renders from.
/// </summary>
internal sealed class ActionSchemaService
{
    public const int CurrentConfigVersion = 3;

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    private readonly List<CategoryDef> _categories;
    private readonly List<ActionKindDef> _kinds;
    private readonly Dictionary<string, ActionKindDef> _byKind;

    public string RawJson { get; }
    public IReadOnlyList<ActionKindDef> Kinds => _kinds;
    public IReadOnlyList<CategoryDef> Categories => _categories;

    public ActionSchemaService()
    {
        RawJson = LoadEmbedded();
        var doc = JsonSerializer.Deserialize<SchemaDocument>(RawJson, Options)
                  ?? throw new InvalidOperationException("actionSchemas.json is not valid.");
        _categories = doc.Categories ?? [];
        _kinds = doc.Kinds ?? [];
        _byKind = _kinds.ToDictionary(k => k.Kind, StringComparer.OrdinalIgnoreCase);
    }

    private static string LoadEmbedded()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("actionSchemas.json", StringComparison.OrdinalIgnoreCase));
        if (name is null) throw new InvalidOperationException("Embedded actionSchemas.json not found.");
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    public ActionKindDef? Find(string? kind) =>
        kind is not null && _byKind.TryGetValue(kind, out var def) ? def : null;

    public bool IsKnown(string? kind) => Find(kind) is not null;

    public string? SuggestedIcon(string? kind) => Find(kind)?.Icon;

    /// <summary>State key a button of this kind reflects (null when it has none).</summary>
    public string? DeriveStateBinding(string? kind, IDictionary<string, object?>? parameters)
    {
        var def = Find(kind);
        if (def is null) return null;

        if (def.Slider?.StateBinding is { Length: > 0 } sliderBinding) return sliderBinding;

        if (def.StateBinding?.Map is { Count: > 0 } map)
        {
            var value = def.StateBinding.Param is null ? null : ParamReader.GetString(parameters, def.StateBinding.Param);
            if (value is not null && map.TryGetValue(value, out var binding)) return binding;
        }

        return null;
    }

    public bool SupportsToggle(string? kind, IDictionary<string, object?>? parameters) =>
        DeriveStateBinding(kind, parameters) is not null;

    public bool SupportsSlider(string? kind) => Find(kind)?.Slider is not null;

    /// <summary>Required-parameter validation. Unknown kinds are tolerated (legacy config).</summary>
    public List<ActionValidationError> Validate(string? kind, IDictionary<string, object?>? parameters)
    {
        var errors = new List<ActionValidationError>();
        var def = Find(kind);
        if (def is null) return errors;

        foreach (var p in def.Params ?? [])
        {
            if (!IsVisible(p, parameters)) continue;

            var raw = ParamReader.Get(parameters, p.Name);
            var isEmpty = ParamReader.IsEmpty(raw);
            if (isEmpty)
            {
                if (p.Required) errors.Add(new(p.Name, "required", $"Falta completar «{p.Name}»."));
                continue;
            }

            var asString = ParamReader.AsString(raw) ?? "";
            if (p.MaxLength is { } max && asString.Length > max)
            {
                errors.Add(new(p.Name, "too_long", $"«{p.Name}» supera el máximo de {max} caracteres."));
            }

            switch (p.Type)
            {
                case "select" when p.Options is { Count: > 0 } opts:
                    if (opts.All(o => !string.Equals(o.Value, asString, StringComparison.OrdinalIgnoreCase)))
                    {
                        errors.Add(new(p.Name, "invalid_option", $"«{asString}» no es una opción válida."));
                    }
                    break;
                case "number":
                    if (!double.TryParse(asString, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var number))
                    {
                        errors.Add(new(p.Name, "not_a_number", "Ingresá un número."));
                    }
                    else if ((p.Min is { } min && number < min) || (p.Max is { } maxNumber && number > maxNumber))
                    {
                        errors.Add(new(p.Name, "out_of_range", "El número está fuera del rango permitido."));
                    }
                    break;
                case "hotkey":
                    var keys = ParamReader.GetStringList(parameters, p.Name);
                    if (keys.Count == 0)
                    {
                        errors.Add(new(p.Name, "required", "Elegí una combinación de teclas."));
                    }
                    break;
                case "text" when p.Pattern is { Length: > 0 } pattern:
                    if (!System.Text.RegularExpressions.Regex.IsMatch(asString, pattern))
                    {
                        errors.Add(new(p.Name, "invalid_format", "El formato del valor no es válido."));
                    }
                    break;
            }
        }

        return errors;
    }

    private static bool IsVisible(ParamDef p, IDictionary<string, object?>? parameters)
    {
        if (p.ShowIf is null) return true;
        var current = ParamReader.GetString(parameters, p.ShowIf.Param);
        return string.Equals(current, p.ShowIf.Equal, StringComparison.OrdinalIgnoreCase);
    }
}

internal sealed record ActionValidationError(string Param, string Code, string Message);

internal sealed class SchemaDocument
{
    public int Version { get; init; }
    public List<CategoryDef>? Categories { get; init; }
    public List<ActionKindDef>? Kinds { get; init; }
}

internal sealed class CategoryDef
{
    public string Id { get; init; } = "";
    public string LabelKey { get; init; } = "";
}

internal sealed class ActionKindDef
{
    public string Kind { get; init; } = "";
    public string Category { get; init; } = "";
    public string LabelKey { get; init; } = "";
    public string Icon { get; init; } = "circle";
    public List<ParamDef>? Params { get; init; }
    public List<ActionPreset>? Presets { get; init; }
    public StateBindingRule? StateBinding { get; init; }
    public SliderRule? Slider { get; init; }
    public string? HelpKey { get; init; }
}

internal sealed class ParamDef
{
    public string Name { get; init; } = "";
    public string Type { get; init; } = "text";
    public string LabelKey { get; init; } = "";
    public bool Required { get; init; }
    public JsonElement? Default { get; init; }
    public string? PlaceholderKey { get; init; }
    public string? HelpKey { get; init; }
    public string? WarnKey { get; init; }
    public string? Pattern { get; init; }
    public int? MaxLength { get; init; }
    public int? MaxKeys { get; init; }
    public double? Min { get; init; }
    public double? Max { get; init; }
    public double? Step { get; init; }
    public bool Counter { get; init; }
    public bool AllowCreate { get; init; }
    public bool AllowAuto { get; init; }
    public List<OptionDef>? Options { get; init; }
    public ShowIfRule? ShowIf { get; init; }
}

internal sealed class OptionDef
{
    public string Value { get; init; } = "";
    public string LabelKey { get; init; } = "";
}

internal sealed class ShowIfRule
{
    public string Param { get; init; } = "";
    [JsonPropertyName("equals")]
    public string Equal { get; init; } = "";
}

internal sealed class StateBindingRule
{
    public string? Param { get; init; }
    public Dictionary<string, string>? Map { get; init; }
}

internal sealed class SliderRule
{
    public double Min { get; init; }
    public double Max { get; init; } = 100;
    public double Step { get; init; } = 1;
    public string? StateBinding { get; init; }
}

internal sealed class ActionPreset
{
    public string Group { get; init; } = "";
    public string LabelKey { get; init; } = "";
    public List<string> Keys { get; init; } = [];
}

/// <summary>Reads untyped JSON parameter values the way the WebSocket/admin APIs deliver them.</summary>
internal static class ParamReader
{
    public static object? Get(IDictionary<string, object?>? parameters, string name) =>
        parameters is not null && parameters.TryGetValue(name, out var value) ? value : null;

    public static bool IsEmpty(object? value) => value switch
    {
        null => true,
        string s => string.IsNullOrWhiteSpace(s),
        bool => false,
        JsonElement e => e.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => true,
            JsonValueKind.String => string.IsNullOrWhiteSpace(e.GetString()),
            JsonValueKind.Array => e.GetArrayLength() == 0,
            JsonValueKind.Object => !e.EnumerateObject().Any(),
            _ => false
        },
        System.Collections.ICollection c => c.Count == 0,
        _ => false
    };

    public static string? AsString(object? value) => value switch
    {
        null => null,
        string s => s,
        JsonElement e => e.ValueKind switch
        {
            JsonValueKind.String => e.GetString(),
            JsonValueKind.Number => e.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => e.GetRawText()
        },
        bool b => b ? "true" : "false",
        _ => Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture)
    };

    public static string? GetString(IDictionary<string, object?>? parameters, string name) =>
        AsString(Get(parameters, name));

    public static bool GetBool(IDictionary<string, object?>? parameters, string name, bool fallback = false)
    {
        var value = Get(parameters, name);
        return value switch
        {
            null => fallback,
            bool b => b,
            string s => bool.TryParse(s, out var parsed) ? parsed : fallback,
            JsonElement e => e.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(e.GetString(), out var parsed) && parsed,
                _ => fallback
            },
            _ => fallback
        };
    }

    public static double GetDouble(IDictionary<string, object?>? parameters, string name, double fallback)
    {
        var value = Get(parameters, name);
        return value switch
        {
            null => fallback,
            double d => d,
            float f => f,
            int i => i,
            long l => l,
            JsonElement e when e.ValueKind == JsonValueKind.Number && e.TryGetDouble(out var parsed) => parsed,
            _ => double.TryParse(AsString(value), System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : fallback
        };
    }

    public static List<string> GetStringList(IDictionary<string, object?>? parameters, string name)
    {
        var value = Get(parameters, name);
        switch (value)
        {
            case null:
                return [];
            case string s:
                return s.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            case JsonElement e when e.ValueKind == JsonValueKind.Array:
                return e.EnumerateArray()
                    .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.GetRawText())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Select(item => item!)
                    .ToList();
            case JsonElement e when e.ValueKind == JsonValueKind.String:
                return (e.GetString() ?? "").Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            case IEnumerable<string> list:
                return list.ToList();
            case System.Collections.IEnumerable enumerable:
                return enumerable.Cast<object?>()
                    .Select(AsString)
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Select(item => item!)
                    .ToList();
            default:
                return [];
        }
    }
}
