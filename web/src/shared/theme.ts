import { MetricId } from './types';

export function getMetricColor(metric: MetricId, value: number, defaultAccent: string): string {
  if (metric.endsWith('.temp')) {
    if (value > 85) return '#FF3B4E'; // Danger
    if (value >= 70) return '#FFB020'; // Warn
    return defaultAccent;
  }

  if (metric.endsWith('.load') || metric.endsWith('.used') || metric.endsWith('.usage') || metric === 'gpu.vram') {
    if (value > 80) return '#FF3B4E'; // Danger
    if (value >= 60) return '#FFB020'; // Warn
    return defaultAccent;
  }

  return defaultAccent;
}

export function formatMetricValue(metric: MetricId, value: number | undefined): { display: string; unit: string } {
  if (value === undefined || isNaN(value)) {
    return { display: '--', unit: '' };
  }

  switch (metric) {
    case 'cpu.load':
    case 'gpu.load':
    case 'gpu.vram':
    case 'ram.used':
    case 'disk.usage':
      return { display: `${Math.round(value)}`, unit: '%' };

    case 'cpu.temp':
    case 'gpu.temp':
      return { display: `${Math.round(value)}`, unit: '°C' };

    case 'ram.used_gb':
    case 'ram.total_gb':
      return { display: value.toFixed(1), unit: 'GB' };

    case 'ping.app':
    case 'ping.internet':
      return { display: `${Math.round(value)}`, unit: 'ms' };

    case 'net.down':
    case 'net.up': {
      // bytes per second
      if (value >= 1024 * 1024) {
        return { display: (value / (1024 * 1024)).toFixed(1), unit: 'MB/s' };
      }
      if (value >= 1024) {
        return { display: (value / 1024).toFixed(0), unit: 'KB/s' };
      }
      return { display: `${Math.round(value)}`, unit: 'B/s' };
    }

    default:
      return { display: `${value}`, unit: '' };
  }
}

export function getMetricLabel(metric: MetricId): string {
  switch (metric) {
    case 'cpu.load': return 'CPU';
    case 'cpu.temp': return 'TEMP';
    case 'gpu.load': return 'GPU';
    case 'gpu.temp': return 'GPU TEMP';
    case 'gpu.vram': return 'VRAM';
    case 'ram.used': return 'RAM';
    case 'ram.used_gb': return 'RAM';
    case 'disk.usage': return 'DISCO';
    case 'net.down': return 'BAJADA';
    case 'net.up': return 'SUBIDA';
    case 'ping.app': return 'PING APP';
    case 'ping.internet': return 'INTERNET';
    default: return metric.toUpperCase();
  }
}
