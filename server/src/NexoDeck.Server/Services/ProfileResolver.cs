namespace NexoDeck.Server.Services;

internal sealed class ProfileResolver
{
    private readonly ConfigService _config;
    private readonly GameDetector _games;
    private readonly object _lock = new();

    public event Action<string, string, bool>? ProfileChanged;

    public string? PinnedProfileId { get; private set; }
    public string ActiveProfileId { get; private set; }
    public string ActiveProcess { get; private set; } = "";
    public bool IsPinned => PinnedProfileId is not null;

    public ProfileResolver(ConfigService config, GameDetector? games = null)
    {
        _config = config;
        _games = games ?? new GameDetector();
        ActiveProfileId = _config.Read().DefaultProfileId;
    }

    public string Resolve(string processName, string? fullPath = null)
    {
        lock (_lock)
        {
            var normalizedProcess = Path.GetFileName(processName).ToLowerInvariant();
            ActiveProcess = normalizedProcess;

            // If a profile is manually pinned, stay on it
            if (PinnedProfileId is not null)
            {
                return ActiveProfileId;
            }

            var cfg = _config.Read();
            var targetProfile = cfg.Profiles.FirstOrDefault(p =>
                p.Match?.Processes is not null &&
                p.Match.Processes.Any(m => string.Equals(Path.GetFileName(m), normalizedProcess, StringComparison.OrdinalIgnoreCase))
            );

            // No explicit match: the Gamer profile catches anything that looks like a game.
            targetProfile ??= cfg.Profiles.FirstOrDefault(p => p.Id == "gamer" && _games.IsGame(normalizedProcess, fullPath));

            var nextProfileId = targetProfile?.Id ?? cfg.DefaultProfileId;
            if (string.IsNullOrEmpty(nextProfileId))
            {
                nextProfileId = "global";
            }

            if (nextProfileId != ActiveProfileId)
            {
                ActiveProfileId = nextProfileId;
                ProfileChanged?.Invoke(ActiveProfileId, ActiveProcess, false);
            }

            return ActiveProfileId;
        }
    }

    /// <summary>
    /// Temporary switch: moves the active profile without pinning it, so the next
    /// foreground app change hands control back to the automatic switching.
    /// </summary>
    public void SelectProfile(string? profileId)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(profileId)) return;

            var cfg = _config.Read();
            if (!cfg.Profiles.Any(p => p.Id == profileId)) return;

            PinnedProfileId = null;
            ActiveProfileId = profileId;
            ProfileChanged?.Invoke(ActiveProfileId, ActiveProcess, false);
        }
    }

    /// <summary>Steps through the configured profiles in order, without pinning.</summary>
    public void CycleProfile(int delta)
    {
        lock (_lock)
        {
            var cfg = _config.Read();
            var count = cfg.Profiles.Count;
            if (count == 0 || delta == 0) return;

            var index = cfg.Profiles.FindIndex(p => p.Id == ActiveProfileId);
            if (index < 0) index = 0;

            var nextIndex = ((index + delta) % count + count) % count;
            SelectProfile(cfg.Profiles[nextIndex].Id);
        }
    }

    public void PinProfile(string? profileId)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(profileId))
            {
                // Unpin
                PinnedProfileId = null;
                var currentProcess = ActiveProcess;
                var oldProfile = ActiveProfileId;
                var resolved = Resolve(currentProcess);
                if (resolved == oldProfile)
                {
                    // Profile didn't switch, but pin state changed
                    ProfileChanged?.Invoke(ActiveProfileId, ActiveProcess, false);
                }
            }
            else
            {
                var cfg = _config.Read();
                var exists = cfg.Profiles.Any(p => p.Id == profileId);
                if (exists)
                {
                    PinnedProfileId = profileId;
                    ActiveProfileId = profileId;
                    ProfileChanged?.Invoke(ActiveProfileId, ActiveProcess, true);
                }
            }
        }
    }
}
