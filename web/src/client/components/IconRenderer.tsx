import React from 'react';
import * as Icons from 'lucide-react';
import { IconConfig } from '../../shared/types';

interface IconRendererProps {
  icon: IconConfig | string;
  className?: string;
  size?: number;
}

/**
 * Resuelve el origen de una imagen. La PWA recibe rutas relativas
 * (/icons/archivo.png) porque comparte origen con el servidor; la app Android
 * recibe el ícono embebido como data URL, porque su HTML vive en
 * file:///android_asset y una ruta relativa apuntaría al paquete local.
 */
function imageSource(value: string): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('http') || raw.startsWith('/')) return raw;
  return `/icons/${raw}.png`;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ icon, className = 'w-6 h-6', size = 24 }) => {
  const iconConfig: IconConfig = typeof icon === 'string'
    ? { kind: 'lucide', value: icon }
    : icon || { kind: 'lucide', value: 'circle' };

  if (iconConfig.kind === 'exe' || iconConfig.kind === 'image') {
    const src = imageSource(iconConfig.value);
    if (src) {
      return (
        <img
          src={src}
          alt=""
          className={`${className} object-contain`}
          style={{ width: size, height: size }}
        />
      );
    }
  }

  // Lucide icon
  const kebabToPascal = (str: string) =>
    str
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

  const iconName = kebabToPascal(iconConfig.value || 'circle');
  const LucideIcon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; size?: number }>>)[iconName] || Icons.Circle;

  return <LucideIcon className={className} size={size} />;
};
