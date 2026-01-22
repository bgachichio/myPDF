
import React, { useRef } from 'react';
import { Upload, FileCode, Shield, Zap } from 'lucide-react';

interface LandingPageProps {
  onUpload: (files: File[]) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl w-full">
        <div className="mb-8 inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-full animate-pulse">
          <Upload size={48} />
        </div>
        
        <h2 className="text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">
          Safe, Quick, and Private <br /><span className="text-blue-600">PDF Editing</span>
        </h2>
        
        <p className="text-xl text-gray-500 mb-10 leading-relaxed max-w-xl mx-auto font-medium">
          Your files never leave your browser. Merge, split, compress, and edit PDFs with zero privacy risk.
        </p>

        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={triggerUpload}
            className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-200 transition-all transform hover:-translate-y-1 active:scale-95 text-lg"
          >
            Upload your PDF
          </button>
          <p className="text-sm text-gray-400 font-medium tracking-tight">Supported formats: .pdf</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="application/pdf"
            multiple 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <div className="p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            <Shield className="mx-auto mb-4 text-blue-600" size={32} />
            <h3 className="font-bold text-lg mb-2 text-gray-900">100% Private</h3>
            <p className="text-gray-500 text-sm leading-relaxed">Processing happens locally in your browser. No data is sent to any server.</p>
          </div>
          <div className="p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            <Zap className="mx-auto mb-4 text-blue-600" size={32} />
            <h3 className="font-bold text-lg mb-2 text-gray-900">Lightning Fast</h3>
            <p className="text-gray-500 text-sm leading-relaxed">Instant processing without upload/download lag. Powered by modern web standards.</p>
          </div>
          <div className="p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            <FileCode className="mx-auto mb-4 text-blue-600" size={32} />
            <h3 className="font-bold text-lg mb-2 text-gray-900">Fully Featured</h3>
            <p className="text-gray-500 text-sm leading-relaxed">Rotate, Merge, Split, Compress, and Rename tools all in one workspace.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
