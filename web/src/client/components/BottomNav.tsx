import React from 'react';
import { useDeckStore } from '../store/useDeckStore';
import { ActiveTab } from '../../shared/types';
import { LayoutGrid, Wrench, Layers, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useDeckStore();

  const navItems: { tab: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { tab: 'deck', label: 'Deck', icon: <LayoutGrid size={20} /> },
    { tab: 'utils', label: 'Utilidades', icon: <Wrench size={20} /> },
    { tab: 'profiles', label: 'Perfiles', icon: <Layers size={20} /> },
    { tab: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
  ];

  return (
    <footer className="h-14 min-h-[56px] border-t border-border bg-surface flex items-center justify-around select-none z-20 safe-bottom">
      {navItems.map((item) => {
        const isActive = activeTab === item.tab;
        return (
          <button
            key={item.tab}
            onClick={() => setActiveTab(item.tab)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 gap-1 transition-colors ${
              isActive ? 'text-accent font-semibold' : 'text-muted hover:text-text'
            }`}
          >
            {item.icon}
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </footer>
  );
};
