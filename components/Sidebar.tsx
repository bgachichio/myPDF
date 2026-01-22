
import React from 'react';
import { AppView } from '../types';
import { 
  Home, 
  Edit3, 
  FileStack, 
  Scissors, 
  Image as ImageIcon, 
  FileSearch,
  PenTool
} from 'lucide-react';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  hasFiles: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, hasFiles }) => {
  const navItems = [
    { id: AppView.LANDING, label: 'Home', icon: Home },
    { id: AppView.EDITOR, label: 'Edit', icon: Edit3, disabled: !hasFiles },
    { id: AppView.SIGN, label: 'Sign', icon: PenTool, disabled: !hasFiles },
    { id: AppView.MERGE, label: 'Merge', icon: FileStack, disabled: !hasFiles },
    { id: AppView.SPLIT, label: 'Split', icon: Scissors, disabled: !hasFiles },
    { id: AppView.CONVERT, label: 'JPG', icon: ImageIcon, disabled: !hasFiles },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col h-full z-50">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <FileSearch size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">myPDF</h1>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' 
                  : item.disabled 
                    ? 'text-gray-200 cursor-not-allowed' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon size={20} className={currentView === item.id ? 'text-blue-600' : ''} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        
        <div className="p-6 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            v1.0.0
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-t border-gray-200 flex items-center justify-around px-2 z-[70] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            disabled={item.disabled}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all ${
              currentView === item.id 
                ? 'text-blue-600' 
                : item.disabled 
                  ? 'text-gray-200' 
                  : 'text-gray-400 active:bg-gray-50'
            }`}
          >
            <item.icon size={20} className={currentView === item.id ? 'stroke-[2.5px]' : 'stroke-2'} />
            <span className="text-[9px] font-bold uppercase tracking-tighter truncate max-w-full px-1">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
