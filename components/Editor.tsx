
import React, { useState, useEffect, useRef } from 'react';
import { AppView, PDFFile } from '../types';
import { 
  Download, 
  RotateCw, 
  Minimize2, 
  Trash2, 
  Edit2,
  Check,
  Plus,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
  PenTool,
  Undo2,
  Redo2,
  Loader2,
  CheckCircle2,
  Circle,
  MousePointer2,
  MoveDiagonal,
  FileSearch,
  Upload as UploadIcon
} from 'lucide-react';
import { 
  mergePDFs, 
  rotatePDF, 
  compressPDF, 
  splitPDF, 
  convertToImages,
  applySignature
} from '../services/pdfEngine';

import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

interface EditorProps {
  view: AppView;
  files: PDFFile[];
  activeFile: PDFFile | undefined;
  onFilesChange: (files: PDFFile[]) => void;
  onActiveFileChange: (id: string | null) => void;
  onUploadMore: (files: File[]) => void;
}

const PDFPage: React.FC<{ 
  pdf: any; 
  pageNum: number; 
  scale: number; 
  isSignMode: boolean;
  isSplitMode: boolean;
  isSelected: boolean;
  onToggleSelect: (idx: number) => void;
  stagedSignature: any;
  onSignAt: (pageNum: number, x: number, y: number) => void;
  onUpdateStaged: (updates: any) => void;
  onConfirmSignature: () => void;
  onCancelStaged: () => void;
}> = ({ 
  pdf, pageNum, scale, isSignMode, isSplitMode, isSelected, onToggleSelect, 
  stagedSignature, onSignAt, onUpdateStaged, onConfirmSignature, onCancelStaged 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragState, setDragState] = useState<any>(null);

  useEffect(() => {
    let renderTask: any = null;
    const renderPage = async () => {
      if (!canvasRef.current || !pdf) return;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        canvas.height = viewport.height * dpr;
        canvas.width = viewport.width * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        if (context) {
          context.scale(dpr, dpr);
          renderTask = page.render({ canvasContext: context, viewport, canvas });
          await renderTask.promise;
        }
      } catch (e) {}
    };
    renderPage();
    return () => renderTask?.cancel();
  }, [pdf, pageNum, scale]);

  const handleDrag = (e: any) => {
    if (!dragState || !stagedSignature) return;
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    if (!clientX || !clientY) return;

    const dx = (clientX - dragState.startX) / scale;
    const dy = (clientY - dragState.startY) / scale;

    if (dragState.type === 'move') {
      onUpdateStaged({ x: dragState.initialX + dx, y: dragState.initialY + dy });
    } else {
      onUpdateStaged({ 
        width: Math.max(40, dragState.initialW + dx), 
        height: Math.max(20, dragState.initialH + dy) 
      });
    }
  };

  useEffect(() => {
    if (dragState) {
      const end = () => setDragState(null);
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', end);
      window.addEventListener('touchmove', handleDrag);
      window.addEventListener('touchend', end);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', end);
        window.removeEventListener('touchmove', handleDrag);
        window.removeEventListener('touchend', end);
      };
    }
  }, [dragState]);

  return (
    <div 
      className={`bg-white shadow-2xl rounded-xl mb-6 md:mb-8 border relative group transition-all duration-300 ${isSignMode || isSplitMode ? 'cursor-crosshair' : 'border-slate-200'} ${isSelected ? 'ring-4 md:ring-8 ring-blue-500/20' : ''}`}
      onClick={(e) => {
        if (isSignMode && !stagedSignature) {
          const rect = canvasRef.current!.getBoundingClientRect();
          onSignAt(pageNum, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
        } else if (isSplitMode) onToggleSelect(pageNum - 1);
      }}
    >
      <canvas ref={canvasRef} className="mx-auto block rounded-xl max-w-full" />
      
      {isSplitMode && (
        <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-white rounded-full p-1.5 md:p-2 shadow-xl border border-slate-100 transition-transform active:scale-90 cursor-pointer">
          {isSelected ? (
            <CheckCircle2 className="text-blue-600 md:w-7 md:h-7" size={24} />
          ) : (
            <Circle className="text-slate-200 md:w-7 md:h-7" size={24} />
          )}
        </div>
      )}

      {stagedSignature && (
        <div 
          className="absolute border-2 border-blue-500 bg-blue-500/10 shadow-2xl group/sig rounded-md"
          style={{
            left: stagedSignature.x * scale,
            top: stagedSignature.y * scale,
            width: stagedSignature.width * scale,
            height: stagedSignature.height * scale,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {stagedSignature.dataUrl && (
            <img src={stagedSignature.dataUrl} className="w-full h-full object-contain pointer-events-none" alt="Signature Preview" />
          )}
          
          <div 
            className="absolute inset-0 cursor-move flex items-center justify-center opacity-0 group-hover/sig:opacity-100 transition-opacity bg-blue-500/5"
            onMouseDown={(e) => setDragState({ type: 'move', startX: e.clientX, startY: e.clientY, initialX: stagedSignature.x, initialY: stagedSignature.y })}
            onTouchStart={(e) => setDragState({ type: 'move', startX: e.touches[0].clientX, startY: e.touches[0].clientY, initialX: stagedSignature.x, initialY: stagedSignature.y })}
          >
            <MousePointer2 size={14} className="text-blue-600" />
          </div>

          <div 
            className="absolute -right-3 -bottom-3 w-6 h-6 md:w-7 md:h-7 bg-blue-600 rounded-full cursor-nwse-resize flex items-center justify-center text-white shadow-lg border-2 border-white hover:scale-110 transition-transform"
            onMouseDown={(e) => { e.stopPropagation(); setDragState({ type: 'resize', startX: e.clientX, startY: e.clientY, initialW: stagedSignature.width, initialH: stagedSignature.height }); }}
            onTouchStart={(e) => { e.stopPropagation(); setDragState({ type: 'resize', startX: e.touches[0].clientX, startY: e.touches[0].clientY, initialW: stagedSignature.width, initialH: stagedSignature.height }); }}
          >
            <MoveDiagonal size={12} className="md:w-3.5 md:h-3.5" />
          </div>

          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center bg-slate-900 text-white rounded-xl p-0.5 md:p-1 gap-1 shadow-2xl">
            <button 
              onClick={(e) => { e.stopPropagation(); onConfirmSignature(); }} 
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider"
            >
              <Check size={12} /> OK
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onCancelStaged(); }} 
              className="p-1.5 hover:bg-white/10 text-slate-400 rounded-lg"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-2 right-2 md:bottom-4 md:left-4 bg-slate-900/40 backdrop-blur-md px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-black text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
        Page {pageNum}
      </div>
    </div>
  );
};

const SignaturePad: React.FC<any> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { 
      ctx.lineCap = 'round'; 
      ctx.lineWidth = 3; 
      ctx.strokeStyle = '#000'; 
    }
  }, []);

  const getPos = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => onSave(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-2xl max-w-xl w-full border border-slate-100 animate-in zoom-in-95 duration-200 mx-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-black text-xl md:text-2xl tracking-tight text-slate-800">Add Signature</h3>
        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={20} /></button>
      </div>

      <div className="flex flex-col gap-4 md:gap-6">
        <div className="relative group">
          <canvas 
            ref={canvasRef} 
            width={500} 
            height={200} 
            className="w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-[1.5rem] cursor-crosshair shadow-inner"
            onMouseDown={(e) => { setDrawing(true); setHasDrawn(true); canvasRef.current?.getContext('2d')?.beginPath(); const p = getPos(e); canvasRef.current?.getContext('2d')?.moveTo(p.x, p.y); }}
            onMouseMove={(e) => { if (!drawing) return; const p = getPos(e); canvasRef.current?.getContext('2d')?.lineTo(p.x, p.y); canvasRef.current?.getContext('2d')?.stroke(); }}
            onMouseUp={() => setDrawing(false)}
            onTouchStart={(e) => { setDrawing(true); setHasDrawn(true); canvasRef.current?.getContext('2d')?.beginPath(); const p = getPos(e); canvasRef.current?.getContext('2d')?.moveTo(p.x, p.y); }}
            onTouchMove={(e) => { if (!drawing) return; const p = getPos(e); canvasRef.current?.getContext('2d')?.lineTo(p.x, p.y); canvasRef.current?.getContext('2d')?.stroke(); }}
            onTouchEnd={() => setDrawing(false)}
          />
          {!hasDrawn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300 gap-1 md:gap-2">
              <PenTool size={24} className="md:w-8 md:h-8" />
              <p className="text-[10px] md:text-sm font-bold uppercase tracking-widest">Draw here</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button 
            onClick={() => { canvasRef.current?.getContext('2d')?.clearRect(0,0,500,200); setHasDrawn(false); }} 
            className="w-full sm:w-auto px-4 py-2 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
          >
            Reset
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <UploadIcon size={14} /> Upload Image
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
        </div>

        <button 
          onClick={() => hasDrawn && onSave(canvasRef.current!.toDataURL())} 
          disabled={!hasDrawn}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 md:py-5 rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 text-base md:text-lg uppercase tracking-wider"
        >
          Confirm
        </button>
      </div>
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ view, files, activeFile, onFilesChange, onActiveFileChange, onUploadMore }) => {
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [processing, setProcessing] = useState(false);
  const [history, setHistory] = useState<Record<string, { past: File[], future: File[] }>>({});
  const [stagedSignature, setStagedSignature] = useState<any>(null);
  const [showSignPad, setShowSignPad] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    if (activeFile) {
      activeFile.file.arrayBuffer().then(buffer => {
        pdfjsLib.getDocument({ data: buffer }).promise.then(doc => {
          setPdf(doc);
          setNumPages(doc.numPages);
          setTempName(activeFile.name.replace('.pdf', ''));
        });
      });
    } else { 
      setPdf(null); 
    }
  }, [activeFile?.file, activeFile?.id]);

  const pushHistory = (id: string, file: File) => {
    setHistory(h => {
      const current = h[id] || { past: [], future: [] };
      return { 
        ...h, 
        [id]: { past: [...current.past, file], future: [] } 
      };
    });
  };

  const handleUndo = () => {
    if (!activeFile) return;
    const h = history[activeFile.id];
    if (!h || h.past.length === 0) return;
    const last = h.past[h.past.length - 1];
    const newPast = h.past.slice(0, -1);
    const newFuture = [activeFile.file, ...h.future];
    setHistory({ ...history, [activeFile.id]: { past: newPast, future: newFuture } });
    const newFile = new File([last], activeFile.name, { type: 'application/pdf' });
    onFilesChange(files.map(f => f.id === activeFile.id ? { ...f, file: newFile, previewUrl: URL.createObjectURL(newFile) } : f));
  };

  const handleRedo = () => {
    if (!activeFile) return;
    const h = history[activeFile.id];
    if (!h || h.future.length === 0) return;
    const next = h.future[0];
    const newFuture = h.future.slice(1);
    const newPast = [...h.past, activeFile.file];
    setHistory({ ...history, [activeFile.id]: { past: newPast, future: newFuture } });
    const newFile = new File([next], activeFile.name, { type: 'application/pdf' });
    onFilesChange(files.map(f => f.id === activeFile.id ? { ...f, file: newFile, previewUrl: URL.createObjectURL(newFile) } : f));
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeFile, history]);

  const handleAction = async (fn: () => Promise<any>) => {
    if (!activeFile) return;
    setProcessing(true);
    try {
      const res = await fn();
      if (res.success && res.data) {
        if (Array.isArray(res.data)) {
          res.data.forEach((b: any, i: number) => {
            const mimeType = view === AppView.CONVERT ? 'image/jpeg' : 'application/pdf';
            const url = URL.createObjectURL(new Blob([b], { type: mimeType }));
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = `${activeFile.name.replace('.pdf','')}_part_${i+1}.${view === AppView.CONVERT ? 'jpg' : 'pdf'}`; 
            a.click();
          });
        } else {
          pushHistory(activeFile.id, activeFile.file);
          const newFile = new File([res.data], activeFile.name, { type: 'application/pdf' });
          onFilesChange(files.map(f => f.id === activeFile.id ? { ...f, file: newFile, previewUrl: URL.createObjectURL(newFile) } : f));
        }
      }
    } catch (e) { console.error(e); }
    setProcessing(false);
  };

  const handleRename = () => {
    if (!activeFile) return;
    const finalName = tempName.trim().endsWith('.pdf') ? tempName.trim() : `${tempName.trim()}.pdf`;
    onFilesChange(files.map(f => f.id === activeFile.id ? { ...f, name: finalName } : f));
    setIsRenaming(false);
  };

  const currentHistory = activeFile ? history[activeFile.id] : null;

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden relative">
      {/* Desktop Workspace Sidebar */}
      <div className="w-72 bg-white border-r hidden xl:flex flex-col shadow-sm">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Workspace</span>
          <button 
            onClick={() => document.getElementById('up')?.click()} 
            className="p-1.5 hover:bg-blue-600 hover:text-white text-blue-600 rounded-lg transition-all shadow-sm bg-white border border-blue-100"
            title="Upload More"
          >
            <Plus size={18}/>
          </button>
          <input id="up" type="file" className="hidden" multiple accept=".pdf" onChange={e => e.target.files && onUploadMore(Array.from(e.target.files))} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {files.map(f => (
            <div 
              key={f.id} 
              onClick={() => onActiveFileChange(f.id)} 
              className={`p-4 rounded-2xl cursor-pointer group transition-all border-2 ${activeFile?.id === f.id ? 'bg-blue-50 border-blue-600/10 shadow-lg scale-[1.02]' : 'hover:bg-slate-50 border-transparent'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`p-2 rounded-xl ${activeFile?.id === f.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <FileText size={18} />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className={`text-sm font-bold truncate ${activeFile?.id === f.id ? 'text-blue-900' : 'text-slate-600'}`}>{f.name}</span>
                    <span className="text-[10px] font-black text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onFilesChange(files.filter(x => x.id !== f.id)); if (activeFile?.id === f.id) onActiveFileChange(null); }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 rounded-lg"><Trash2 size={16}/></button>
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <div className="py-20 text-center px-6">
              <FileSearch size={40} className="mx-auto mb-4 text-slate-200" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-loose">No documents.<br/>Upload to start.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
        {/* Main Toolbar */}
        <div className="h-14 md:h-20 bg-white/90 backdrop-blur-xl border-b px-3 md:px-10 flex items-center justify-between sticky top-0 z-40 shadow-sm overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 md:gap-6 flex-shrink-0">
            <div className="flex items-center gap-2 md:gap-4">
              {isRenaming ? (
                <div className="flex items-center gap-1 md:gap-2">
                  <input 
                    value={tempName} 
                    onChange={e => setTempName(e.target.value)} 
                    className="px-2 py-1 md:px-3 md:py-2 bg-slate-100 border-2 border-blue-500 rounded-lg md:rounded-xl font-bold focus:outline-none w-24 md:w-48 text-xs md:text-sm"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleRename()}
                  />
                  <button onClick={handleRename} className="p-1 md:p-2 bg-blue-600 text-white rounded-lg"><Check size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1 md:gap-3 group cursor-pointer" onClick={() => activeFile && setIsRenaming(true)}>
                  <h2 className="font-black text-xs md:text-xl tracking-tight text-slate-800 truncate max-w-[80px] md:max-w-[300px]">{activeFile?.name || 'Workspace'}</h2>
                  {activeFile && <Edit2 size={12} className="text-slate-300 md:opacity-0 md:group-hover:opacity-100" />}
                </div>
              )}
            </div>
            
            <div className="h-6 md:h-8 w-[1px] bg-slate-200" />

            <div className="flex items-center gap-0.5 md:gap-1 bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl">
              <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="p-1 md:p-2 hover:bg-white rounded-md md:rounded-lg text-slate-600" title="Zoom Out"><ZoomOut size={14} className="md:w-4 md:h-4"/></button>
              <span className="text-[8px] md:text-[10px] font-black w-8 md:w-12 text-center text-slate-500 uppercase">{Math.round(scale*100)}%</span>
              <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className="p-1 md:p-2 hover:bg-white rounded-md md:rounded-lg text-slate-600" title="Zoom In"><ZoomIn size={14} className="md:w-4 md:h-4"/></button>
            </div>

            <div className="flex items-center gap-0.5 md:gap-1 bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl">
              <button onClick={handleUndo} disabled={!currentHistory || currentHistory.past.length === 0} className="p-1 md:p-2 hover:bg-white rounded-md md:rounded-lg text-slate-600 disabled:opacity-30" title="Undo"><Undo2 size={14} className="md:w-4 md:h-4"/></button>
              <button onClick={handleRedo} disabled={!currentHistory || currentHistory.future.length === 0} className="p-1 md:p-2 hover:bg-white rounded-md md:rounded-lg text-slate-600 disabled:opacity-30" title="Redo"><Redo2 size={14} className="md:w-4 md:h-4"/></button>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 ml-4">
            {activeFile && (
              <>
                <button onClick={() => handleAction(() => rotatePDF(activeFile.file, 90))} className="p-1.5 md:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg md:rounded-xl" title="Rotate 90°"><RotateCw size={14} className="md:w-[18px] md:h-[18px]"/></button>
                <button onClick={() => handleAction(() => compressPDF(activeFile.file))} className="p-1.5 md:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg md:rounded-xl" title="Compress"><Minimize2 size={14} className="md:w-[18px] md:h-[18px]"/></button>
                
                {view === AppView.SPLIT && (
                  <button onClick={() => handleAction(() => splitPDF(activeFile.file, Array.from(selectedPages).sort()))} disabled={selectedPages.size === 0} className="px-3 md:px-6 py-1.5 md:py-3 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-lg md:rounded-xl shadow-lg disabled:opacity-50">Split {selectedPages.size}</button>
                )}
                
                {view === AppView.MERGE && <button onClick={() => handleAction(() => mergePDFs(files.map(f => f.file)))} className="px-3 md:px-6 py-1.5 md:py-3 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-lg md:rounded-xl shadow-lg">Merge All</button>}

                {view === AppView.CONVERT && <button onClick={() => handleAction(() => convertToImages(activeFile.file))} className="px-3 md:px-6 py-1.5 md:py-3 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-lg md:rounded-xl shadow-lg">Convert to JPG</button>}

                <button 
                  onClick={() => { const url = URL.createObjectURL(activeFile.file); const a = document.createElement('a'); a.href = url; a.download = activeFile.name; a.click(); }}
                  className="px-3 md:px-6 py-1.5 md:py-3 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-lg md:rounded-xl flex items-center gap-1 md:gap-2 shadow-lg"
                >
                  <Download size={14} className="md:w-4 md:h-4"/> <span className="hidden sm:inline">Download</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile File Switcher (Horizontal scrollable workspace) */}
        {files.length > 0 && (
          <div className="xl:hidden bg-white border-b overflow-x-auto no-scrollbar py-2 px-3 flex gap-2">
            {files.map(f => (
              <button 
                key={f.id} 
                onClick={() => onActiveFileChange(f.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full border flex items-center gap-2 transition-all ${activeFile?.id === f.id ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-md' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white'}`}
              >
                <FileText size={12} />
                <span className="text-[10px] truncate max-w-[80px]">{f.name}</span>
              </button>
            ))}
            <button 
              onClick={() => document.getElementById('up-mob')?.click()}
              className="flex-shrink-0 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-blue-600 hover:bg-blue-50"
            >
              <Plus size={14} />
            </button>
            <input id="up-mob" type="file" className="hidden" multiple accept=".pdf" onChange={e => e.target.files && onUploadMore(Array.from(e.target.files))} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar flex flex-col items-center">
          {processing && (
            <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-[80] flex flex-col items-center justify-center animate-in fade-in">
              <div className="p-6 md:p-10 bg-white rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 text-center mx-6">
                <Loader2 className="animate-spin text-blue-600 md:w-14 md:h-14" size={40} />
                <h4 className="font-black text-sm md:text-xl text-slate-800 uppercase tracking-widest">Processing...</h4>
              </div>
            </div>
          )}

          {pdf ? (
            <div className="max-w-full inline-block">
              {view === AppView.SIGN && !stagedSignature && (
                <div className="mb-6 p-4 bg-blue-600 rounded-2xl text-white shadow-xl flex items-center justify-center gap-3 animate-bounce max-w-xs mx-auto text-center">
                  <PenTool size={18} />
                  <p className="font-black text-[10px] uppercase tracking-widest leading-tight">Tap where you want to place signature</p>
                </div>
              )}
              {Array.from({ length: numPages }).map((_, i) => (
                <PDFPage 
                  key={i} pdf={pdf} pageNum={i+1} scale={scale} 
                  isSignMode={view === AppView.SIGN} isSplitMode={view === AppView.SPLIT} 
                  isSelected={selectedPages.has(i)} onToggleSelect={idx => setSelectedPages(p => { const s = new Set(p); if(s.has(idx)) s.delete(idx); else s.add(idx); return s; })}
                  stagedSignature={stagedSignature?.pageNum === i+1 ? stagedSignature : null}
                  onSignAt={(p, x, y) => { setStagedSignature({ pageNum: p, x, y, width: 140, height: 50, dataUrl: '' }); setShowSignPad(true); }}
                  onUpdateStaged={u => setStagedSignature((s: any) => ({ ...s, ...u }))}
                  onConfirmSignature={() => handleAction(() => applySignature(activeFile!.file, stagedSignature.dataUrl, stagedSignature.pageNum, stagedSignature.x, stagedSignature.y, stagedSignature.width)).then(() => setStagedSignature(null))}
                  onCancelStaged={() => setStagedSignature(null)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-10 md:mt-32 text-center max-w-sm px-6">
              <div className="p-6 md:p-10 bg-white rounded-[2rem] md:rounded-[3rem] shadow-inner mb-6 md:mb-8 border border-slate-100">
                <FileSearch size={48} className="md:w-[72px] md:h-[72px] mx-auto text-slate-200" strokeWidth={1} />
              </div>
              <h3 className="text-lg md:text-2xl font-black text-slate-800 mb-2 md:mb-4 uppercase tracking-tighter">Workspace Empty</h3>
              <p className="text-slate-500 font-medium text-xs md:text-sm leading-relaxed">Select a document from the workspace or upload a new one to begin.</p>
            </div>
          )}
        </div>
      </div>

      {showSignPad && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <SignaturePad onCancel={() => { setShowSignPad(false); setStagedSignature(null); }} onSave={(d: string) => { setStagedSignature((s: any) => ({ ...s, dataUrl: d })); setShowSignPad(false); }} />
        </div>
      )}
    </div>
  );
};

export default Editor;
