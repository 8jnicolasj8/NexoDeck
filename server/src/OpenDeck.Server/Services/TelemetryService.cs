using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using LibreHardwareMonitor.Hardware;

namespace OpenDeck.Server.Services;

internal sealed class TelemetryService : IDisposable
{
    private readonly Computer? _computer;
    private readonly object _lock = new();
    private NetworkInterface? _activeNic;
    private long _lastBytesRecv;
    private long _lastBytesSent;
    private DateTime _lastNetworkSample = DateTime.UtcNow;
    private bool _computerOpened;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;

        public static MEMORYSTATUSEX Create()
        {
            var result = new MEMORYSTATUSEX();
            result.dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>();
            return result;
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    public TelemetryService()
    {
        try
        {
            // E3: only open the hardware types the slots and temperature alerts actually read.
            // RAM comes from GlobalMemoryStatusEx and network from IP statistics, so neither
            // LHM memory nor LHM storage is needed.
            _computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMemoryEnabled = false,
                IsStorageEnabled = false,
                IsNetworkEnabled = false
            };
            _computer.Open();
            _computerOpened = true;
        }
        catch
        {
            _computerOpened = false;
        }

        DetectActiveNetworkInterface();
    }

    public Dictionary<string, object> GetMetrics()
    {
        lock (_lock)
        {
            var metrics = new Dictionary<string, object>();

            // 1. RAM via GlobalMemoryStatusEx (reliable and fast)
            var memStatus = MEMORYSTATUSEX.Create();
            if (GlobalMemoryStatusEx(ref memStatus))
            {
                var totalGb = memStatus.ullTotalPhys / (1024.0 * 1024.0 * 1024.0);
                var usedGb = (memStatus.ullTotalPhys - memStatus.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0);
                metrics["ram.used"] = Math.Round((double)memStatus.dwMemoryLoad, 1);
                metrics["ram.used_gb"] = Math.Round(usedGb, 1);
                metrics["ram.total_gb"] = Math.Round(totalGb, 1);
            }

            // 2. Hardware sensors from LibreHardwareMonitor
            if (_computerOpened && _computer is not null)
            {
                try
                {
                    foreach (var hardware in _computer.Hardware)
                    {
                        hardware.Update();
                        foreach (var sub in hardware.SubHardware)
                        {
                            sub.Update();
                        }

                        if (hardware.HardwareType is HardwareType.Cpu)
                        {
                            foreach (var sensor in hardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Load &&
                                    (sensor.Name.Contains("Total", StringComparison.OrdinalIgnoreCase) ||
                                     sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) ||
                                     !metrics.ContainsKey("cpu.load")) &&
                                    sensor.Value.HasValue)
                                {
                                    metrics["cpu.load"] = Math.Round(sensor.Value.Value, 1);
                                }
                                else if (sensor.SensorType == SensorType.Temperature &&
                                         (sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) ||
                                          sensor.Name.Contains("Average", StringComparison.OrdinalIgnoreCase) ||
                                          sensor.Name.Contains("Core (Max)", StringComparison.OrdinalIgnoreCase) ||
                                          !metrics.ContainsKey("cpu.temp")) &&
                                         sensor.Value.HasValue)
                                {
                                    metrics["cpu.temp"] = Math.Round(sensor.Value.Value, 1);
                                }
                            }
                        }
                        else if (hardware.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel)
                        {
                            foreach (var sensor in hardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Load &&
                                    (sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) ||
                                     sensor.Name.Contains("GPU", StringComparison.OrdinalIgnoreCase) ||
                                     !metrics.ContainsKey("gpu.load")) &&
                                    sensor.Value.HasValue)
                                {
                                    metrics["gpu.load"] = Math.Round(sensor.Value.Value, 1);
                                }
                                else if (sensor.SensorType == SensorType.Temperature &&
                                         (sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) ||
                                          sensor.Name.Contains("GPU", StringComparison.OrdinalIgnoreCase) ||
                                          !metrics.ContainsKey("gpu.temp")) &&
                                         sensor.Value.HasValue)
                                {
                                    metrics["gpu.temp"] = Math.Round(sensor.Value.Value, 1);
                                }
                                else if (sensor.SensorType == SensorType.Load &&
                                         (sensor.Name.Contains("Memory", StringComparison.OrdinalIgnoreCase) ||
                                          sensor.Name.Contains("VRAM", StringComparison.OrdinalIgnoreCase)) &&
                                         sensor.Value.HasValue)
                                {
                                    metrics["gpu.vram"] = Math.Round(sensor.Value.Value, 1);
                                }
                            }
                        }
                        else if (hardware.HardwareType is HardwareType.Storage)
                        {
                            foreach (var sensor in hardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Load &&
                                    (sensor.Name.Contains("Total", StringComparison.OrdinalIgnoreCase) ||
                                     sensor.Name.Contains("Used", StringComparison.OrdinalIgnoreCase) ||
                                     !metrics.ContainsKey("disk.usage")) &&
                                    sensor.Value.HasValue)
                                {
                                    metrics["disk.usage"] = Math.Round(sensor.Value.Value, 1);
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Degrade gracefully if sensor reading throws
                }
            }

            // Defaults if CPU load wasn't found in LHM
            if (!metrics.ContainsKey("cpu.load"))
            {
                metrics["cpu.load"] = 0.0;
            }

            // 3. Network metrics (passive delta)
            ComputeNetworkMetrics(metrics);

            return metrics;
        }
    }

    private void DetectActiveNetworkInterface()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                            n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .ToList();

            // Find interface with IPv4 default gateway
            var candidate = interfaces.FirstOrDefault(n =>
                n.GetIPProperties().GatewayAddresses.Any(g => g.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork))
                ?? interfaces.FirstOrDefault();

            if (candidate is not null)
            {
                _activeNic = candidate;
                var stats = candidate.GetIPStatistics();
                _lastBytesRecv = stats.BytesReceived;
                _lastBytesSent = stats.BytesSent;
                _lastNetworkSample = DateTime.UtcNow;
            }
        }
        catch
        {
            _activeNic = null;
        }
    }

    private void ComputeNetworkMetrics(Dictionary<string, object> metrics)
    {
        try
        {
            if (_activeNic is null || _activeNic.OperationalStatus != OperationalStatus.Up)
            {
                DetectActiveNetworkInterface();
            }

            if (_activeNic is not null)
            {
                var now = DateTime.UtcNow;
                var elapsed = (now - _lastNetworkSample).TotalSeconds;
                if (elapsed >= 0.4)
                {
                    var stats = _activeNic.GetIPStatistics();
                    var deltaRecv = stats.BytesReceived - _lastBytesRecv;
                    var deltaSent = stats.BytesSent - _lastBytesSent;

                    if (deltaRecv >= 0 && deltaSent >= 0)
                    {
                        metrics["net.down"] = Math.Round(deltaRecv / elapsed, 0);
                        metrics["net.up"] = Math.Round(deltaSent / elapsed, 0);
                    }
                    else
                    {
                        metrics["net.down"] = 0.0;
                        metrics["net.up"] = 0.0;
                    }

                    _lastBytesRecv = stats.BytesReceived;
                    _lastBytesSent = stats.BytesSent;
                    _lastNetworkSample = now;
                }
            }
        }
        catch
        {
            metrics["net.down"] = 0.0;
            metrics["net.up"] = 0.0;
        }

        if (!metrics.ContainsKey("net.down")) metrics["net.down"] = 0.0;
        if (!metrics.ContainsKey("net.up")) metrics["net.up"] = 0.0;
    }

    public void Dispose()
    {
        if (_computerOpened && _computer is not null)
        {
            try
            {
                _computer.Close();
            }
            catch { }
        }
    }
}
