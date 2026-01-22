
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center bg-white overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl w-full py-10 md:py-0">
        <div className="mb-6 md:mb-8 inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-full animate-pulse">
          <Upload size={40} className="md:w-12 md:h-12" />
        </div>
        
        <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4 md:mb-6 tracking-tight leading-tight px-4">
          Safe, Quick, and Private <br /><span className="text-blue-600">PDF Editing</span>
        </h2>
        
        <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10 leading-relaxed max-w-xl mx-auto font-medium px-4">
          Your files never leave your browser. Merge, split, compress, and edit PDFs with zero privacy risk.
        </p>

        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={triggerUpload}
            className="w-full sm:w-auto px-8 md:px-10 py-4 md:py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-100 transition-all transform hover:-translate-y-1 active:scale-95 text-base md:text-lg"
          >
            Upload your PDF
          </button>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Supported: .pdf</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="application/pdf"
            multiple 
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-8 mt-16 md:mt-20 px-4">
          <div className="p-6 md:p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            {/* Combined duplicate className attributes into one */}
            <Shield className="mx-auto mb-3 md:mb-4 text-blue-600 md:w-8 md:h-8" size={24} />
            <h3 className="font-bold text-base md:text-lg mb-1 md:mb-2 text-gray-900">100% Private</h3>
            <p className="text-gray-500 text-xs md:text-sm leading-relaxed">Local browser processing. No data is sent to servers.</p>
          </div>
          <div className="p-6 md:p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            {/* Combined duplicate className attributes into one */}
            <Zap className="mx-auto mb-3 md:mb-4 text-blue-600 md:w-8 md:h-8" size={24} />
            <h3 className="font-bold text-base md:text-lg mb-1 md:mb-2 text-gray-900">Lightning Fast</h3>
            <p className="text-gray-500 text-xs md:text-sm leading-relaxed">No upload lag. Powered by modern web standards.</p>
          </div>
          <div className="p-6 md:p-8 rounded-[2rem] border border-gray-100 bg-gray-50/50 transition-all hover:shadow-md">
            {/* Combined duplicate className attributes into one */}
            <FileCode className="mx-auto mb-3 md:mb-4 text-blue-600 md:w-8 md:h-8" size={24} />
            <h3 className="font-bold text-base md:text-lg mb-1 md:mb-2 text-gray-900">Fully Featured</h3>
            <p className="text-gray-500 text-xs md:text-sm leading-relaxed">Merge, Split, Compress, and Rename in one workspace.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;