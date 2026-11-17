using System.Diagnostics;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace OpenDeck.Server.Services;

internal sealed class AudioService : IDisposable
{
    public event Action<string, object>? StateChanged;

    private readonly MMDeviceEnumerator _enumerator;
    private MMDevice? _defaultPlayback;
    private MMDevice? _defaultCapture;
    private AudioEndpointVolumeNotificationDelegate? _playbackCallback;
    private AudioEndpointVolumeNotificationDelegate? _captureCallback;
    private readonly object _lock = new();

    public AudioService()
    {
        _enumerator = new MMDeviceEnumerator();
        AttachDevices();
    }

    private void AttachDevices()
    {
        lock (_lock)
        {
            try
            {
                DetachDevices();

                if (_enumerator.HasDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia))
                {
                    _defaultPlayback = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                    _playbackCallback = data =>
                    {
                        StateChanged?.Invoke("audio.muted", data.Muted);
                        StateChanged?.Invoke("audio.masterVolume", (int)Math.Round(data.MasterVolume * 100));
                    };
                    _defaultPlayback.AudioEndpointVolume.OnVolumeNotification += _playbackCallback;
                }

                if (_enumerator.HasDefaultAudioEndpoint(DataFlow.Capture, Role.Communications))
                {
                    _defaultCapture = _enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
                    _captureCallback = data =>
                    {
                        StateChanged?.Invoke("mic.muted", data.Muted);
                    };
                    _defaultCapture.AudioEndpointVolume.OnVolumeNotification += _captureCallback;
                }
            }
            catch { }
        }
    }

    private void DetachDevices()
    {
        if (_defaultPlayback is not null && _playbackCallback is not null)
        {
            try { _defaultPlayback.AudioEndpointVolume.OnVolumeNotification -= _playbackCallback; } catch { }
            _defaultPlayback.Dispose();
            _defaultPlayback = null;
        }

        if (_defaultCapture is not null && _captureCallback is not null)
        {
            try { _defaultCapture.AudioEndpointVolume.OnVolumeNotification -= _captureCallback; } catch { }
            _defaultCapture.Dispose();
            _defaultCapture = null;
        }
    }

    public Dictionary<string, object> GetInitialStates()
    {
        var states = new Dictionary<string, object>();
        lock (_lock)
        {
            try
            {
                if (_defaultPlayback is not null)
                {
                    states["audio.muted"] = _defaultPlayback.AudioEndpointVolume.Mute;
                    states["audio.masterVolume"] = (int)Math.Round(_defaultPlayback.AudioEndpointVolume.MasterVolumeLevelScalar * 100);
                }
            }
            catch { }

            try
            {
                if (_defaultCapture is not null)
                {
                    states["mic.muted"] = _defaultCapture.AudioEndpointVolume.Mute;
                }
            }
            catch { }
        }
        return states;
    }

    public void SetMasterVolume(float percent)
    {
        lock (_lock)
        {
            try
            {
                if (_defaultPlayback is not null)
                {
                    var scalar = Math.Clamp(percent / 100f, 0f, 1f);
                    _defaultPlayback.AudioEndpointVolume.MasterVolumeLevelScalar = scalar;
                    StateChanged?.Invoke("audio.masterVolume", (int)Math.Round(scalar * 100));
                }
            }
            catch { }
        }
    }

    public bool ToggleMasterMute()
    {
        lock (_lock)
        {
            try
            {
                if (_defaultPlayback is not null)
                {
                    var current = _defaultPlayback.AudioEndpointVolume.Mute;
                    _defaultPlayback.AudioEndpointVolume.Mute = !current;
                    StateChanged?.Invoke("audio.muted", !current);
                    return !current;
                }
            }
            catch { }
            return false;
        }
    }

    public bool ToggleMicMute()
    {
        lock (_lock)
        {
            try
            {
                if (_defaultCapture is not null)
                {
                    var current = _defaultCapture.AudioEndpointVolume.Mute;
                    _defaultCapture.AudioEndpointVolume.Mute = !current;
                    StateChanged?.Invoke("mic.muted", !current);
                    return !current;
                }
            }
            catch { }
            return false;
        }
    }

    public void SetAppVolume(string processName, float percent)
    {
        lock (_lock)
        {
            try
            {
                if (_defaultPlayback is null) return;
                var scalar = Math.Clamp(percent / 100f, 0f, 1f);
                var sessions = _defaultPlayback.AudioSessionManager.Sessions;
                for (var i = 0; i < sessions.Count; i++)
                {
                    var session = sessions[i];
                    if (MatchesProcess(session, processName))
                    {
                        session.SimpleAudioVolume.Volume = scalar;
                    }
                }
            }
            catch { }
        }
    }

    public bool ToggleAppMute(string processName)
    {
        lock (_lock)
        {
            try
            {
                if (_defaultPlayback is null) return false;
                var sessions = _defaultPlayback.AudioSessionManager.Sessions;
                var newMute = false;
                for (var i = 0; i < sessions.Count; i++)
                {
                    var session = sessions[i];
                    if (MatchesProcess(session, processName))
                    {
                        newMute = !session.SimpleAudioVolume.Mute;
                        session.SimpleAudioVolume.Mute = newMute;
                    }
                }
                return newMute;
            }
            catch { }
            return false;
        }
    }

    public void CycleDefaultPlaybackDevice() => CycleDefaultDevice("output", []);

    public IReadOnlyList<AudioDeviceInfo> GetDevices(string flow)
    {
        var dataFlow = IsInput(flow) ? DataFlow.Capture : DataFlow.Render;
        var result = new List<AudioDeviceInfo>();
        lock (_lock)
        {
            try
            {
                var defaultId = IsInput(flow) ? _defaultCapture?.ID : _defaultPlayback?.ID;
                var devices = _enumerator.EnumerateAudioEndPoints(dataFlow, DeviceState.Active);
                foreach (var device in devices)
                {
                    try
                    {
                        result.Add(new AudioDeviceInfo(device.ID, device.FriendlyName, IsInput(flow) ? "input" : "output", device.ID == defaultId));
                    }
                    finally { device.Dispose(); }
                }
            }
            catch (Exception ex)
            {
                AppLog.Warn($"Could not enumerate audio devices: {ex.Message}");
            }
        }
        return result;
    }

    public bool SetDefaultDevice(string flow, string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) return false;
        var dataFlow = IsInput(flow) ? DataFlow.Capture : DataFlow.Render;
        lock (_lock)
        {
            try
            {
                var devices = _enumerator.EnumerateAudioEndPoints(dataFlow, DeviceState.Active);
                MMDevice? match = null;
                foreach (var device in devices)
                {
                    if (device.ID == deviceId) { match = device; break; }
                }
                if (match is null) return false;

                try { SetDefaultEndpoint(match.ID, Role.Multimedia); SetDefaultEndpoint(match.ID, Role.Communications); }
                finally { match.Dispose(); }

                AttachDevices();
                NotifyStates();
                return true;
            }
            catch (Exception ex)
            {
                AppLog.Warn($"Could not set default audio device: {ex.Message}");
                return false;
            }
        }
    }

    public bool CycleDefaultDevice(string flow, IReadOnlyList<string> pool)
    {
        var dataFlow = IsInput(flow) ? DataFlow.Capture : DataFlow.Render;
        lock (_lock)
        {
            try
            {
                var devices = _enumerator.EnumerateAudioEndPoints(dataFlow, DeviceState.Active).ToList();
                if (devices.Count <= 1) return false;

                var allowed = pool.Count == 0
                    ? devices
                    : devices.Where(device => pool.Contains(device.ID)).ToList();
                if (allowed.Count == 0) allowed = devices;
                if (allowed.Count <= 1) return false;

                var currentId = IsInput(flow) ? _defaultCapture?.ID : _defaultPlayback?.ID;
                var currentIndex = allowed.FindIndex(device => device.ID == currentId);
                var next = allowed[(currentIndex + 1) % allowed.Count];
                var nextId = next.ID;
                foreach (var device in devices) device.Dispose();

                SetDefaultEndpoint(nextId, Role.Multimedia);
                SetDefaultEndpoint(nextId, Role.Communications);
                AttachDevices();
                NotifyStates();
                return true;
            }
            catch (Exception ex)
            {
                AppLog.Warn($"Could not cycle audio device: {ex.Message}");
                return false;
            }
        }
    }

    private static bool IsInput(string flow) =>
        flow.Equals("input", StringComparison.OrdinalIgnoreCase) ||
        flow.Equals("capture", StringComparison.OrdinalIgnoreCase);

    private void NotifyStates()
    {
        foreach (var (key, value) in GetInitialStates())
        {
            StateChanged?.Invoke(key, value);
        }
    }

    private static bool MatchesProcess(AudioSessionControl session, string target)
    {
        try
        {
            var pid = (int)session.GetProcessID;
            if (pid != 0)
            {
                using var proc = Process.GetProcessById(pid);
                if (proc.ProcessName.Contains(target, StringComparison.OrdinalIgnoreCase) ||
                    $"{proc.ProcessName}.exe".Equals(target, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }
        catch { }
        return false;
    }

    [ComImport]
    [Guid("870c9978-4447-4142-818b-4f0a40f840e6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat(string pszDeviceName, IntPtr ppFormat);
        [PreserveSig] int GetDeviceFormat(string pszDeviceName, int bDefault, IntPtr ppFormat);
        [PreserveSig] int ResetDeviceFormat(string pszDeviceName);
        [PreserveSig] int SetDeviceFormat(string pszDeviceName, IntPtr pEndpointFormat, IntPtr pMixFormat);
        [PreserveSig] int GetProcessingPeriod(string pszDeviceName, int bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
        [PreserveSig] int SetProcessingPeriod(string pszDeviceName, IntPtr pmftPeriod);
        [PreserveSig] int GetShareMode(string pszDeviceName, IntPtr pMode);
        [PreserveSig] int SetShareMode(string pszDeviceName, IntPtr mode);
        [PreserveSig] int GetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
        [PreserveSig] int SetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
        [PreserveSig] int SetDefaultEndpoint(string pszDeviceName, Role role);
        [PreserveSig] int SetEndpointVisibility(string pszDeviceName, int bVisible);
    }

    [ComImport]
    [Guid("870c9978-4447-4142-818b-4f0a40f840e6")]
    private class PolicyConfigClient { }

    private static void SetDefaultEndpoint(string deviceId, Role role)
    {
        try
        {
            var policyConfig = (IPolicyConfig)new PolicyConfigClient();
            policyConfig.SetDefaultEndpoint(deviceId, role);
        }
        catch { }
    }

    public void Dispose()
    {
        DetachDevices();
        _enumerator.Dispose();
    }
}

internal sealed record AudioDeviceInfo(string Id, string Name, string Flow, bool IsDefault);
