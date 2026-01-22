
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
    { id: AppView.EDITOR, label: 'Edit & Rename', icon: Edit3, disabled: !hasFiles },
    { id: AppView.SIGN, label: 'Sign Document', icon: PenTool, disabled: !hasFiles },
    { id: AppView.MERGE, label: 'Merge', icon: FileStack, disabled: !hasFiles },
    { id: AppView.SPLIT, label: 'Split Selection', icon: Scissors, disabled: !hasFiles },
    { id: AppView.CONVERT, label: 'PDF to JPG', icon: ImageIcon, disabled: !hasFiles },
  ];

  return (
    <aside className="w-20 md:w-64 bg-white border-r border-gray-200 flex flex-col h-full z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg text-white">
          <FileSearch size={24} />
        </div>
        <h1 className="text-xl font-bold hidden md:block tracking-tight">myPDF</h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            disabled={item.disabled}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
              currentView === item.id 
                ? 'bg-blue-50 text-blue-700 font-semibold' 
                : item.disabled 
                  ? 'text-gray-300 cursor-not-allowed' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <item.icon size={22} className={currentView === item.id ? 'text-blue-600' : ''} />
            <span className="hidden md:block">{item.label}</span>
          </button>
        ))}
      </nav>
      
      <div className="p-6 border-t border-gray-100">
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center md:text-left">
          v1.0.0
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
