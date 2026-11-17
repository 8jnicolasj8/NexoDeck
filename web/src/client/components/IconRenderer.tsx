import React from 'react';
import * as Icons from 'lucide-react';
import { IconConfig } from '../../shared/types';

interface IconRendererProps {
  icon: IconConfig | string;
  className?: string;
  size?: number;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ icon, className = 'w-6 h-6', size = 24 }) => {
  const iconConfig: IconConfig = typeof icon === 'string'
    ? { kind: 'lucide', value: icon }
    : icon || { kind: 'lucide', value: 'circle' };

  if (iconConfig.kind === 'exe' || iconConfig.kind === 'image') {
    return (
      <img
        src={iconConfig.value.startsWith('http') || iconConfig.value.startsWith('/') ? iconConfig.value : `/icons/${iconConfig.value}.png`}
        alt=""
        className={`${className} object-contain`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Lucide icon
  const kebabToPascal = (str: string) =>
    str
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

  const iconName = kebabToPascal(iconConfig.value);
  const LucideIcon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string; size?: number }>>)[iconName] || Icons.Circle;

  return <LucideIcon className={className} size={size} />;
};
