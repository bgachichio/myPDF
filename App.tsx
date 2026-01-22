
import React, { useState, useEffect } from 'react';
import { AppView, PDFFile } from './types';
import Sidebar from './components/Sidebar';
import LandingPage from './components/LandingPage';
import Editor from './components/Editor';
import { Heart, ExternalLink } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LANDING);
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const handleFileUpload = (uploadedFiles: File[]) => {
    const newFiles: PDFFile[] = uploadedFiles.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      previewUrl: URL.createObjectURL(f)
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0) {
      setActiveFileId(newFiles[0].id);
      setCurrentView(AppView.EDITOR);
    }
  };

  // Cleanup Blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [files]);

  const handleSidebarClick = (view: AppView) => {
    setCurrentView(view);
  };

  const handleFilesUpdate = (updatedFiles: PDFFile[]) => {
    setFiles(updatedFiles);
  };

  const activeFile = files.find(f => f.id === activeFileId);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 overflow-hidden relative font-inter">
      {/* Support Banner - Non-obstructive positioning */}
      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[60] flex items-center gap-3 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
        <span className="text-[11px] font-bold text-slate-600 tracking-tight flex items-center gap-1.5 whitespace-nowrap">
          Made with <Heart size={12} className="text-red-500 fill-red-500" /> by Brian
        </span>
        <a 
          href="https://paystack.shop/pay/gachichio" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-sm"
        >
          support <ExternalLink size={10} />
        </a>
      </div>

      <Sidebar 
        currentView={currentView} 
        onViewChange={handleSidebarClick} 
        hasFiles={files.length > 0} 
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {currentView === AppView.LANDING ? (
          <LandingPage onUpload={handleFileUpload} />
        ) : (
          <Editor 
            view={currentView}
            files={files}
            activeFile={activeFile}
            onFilesChange={handleFilesUpdate}
            onActiveFileChange={setActiveFileId}
            onUploadMore={handleFileUpload}
          />
        )}
      </main>
    </div>
  );
};

export default App;
