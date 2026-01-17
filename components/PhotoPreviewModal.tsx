
import React from 'react';

interface PhotoPreviewModalProps {
  photoUrl: string;
  onClose: () => void;
}

const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({ photoUrl, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center animate-in zoom-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Styled like CameraModal */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 md:-top-6 md:-right-12 z-[20001] w-12 h-12 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-slate-800 border border-white/50 active:scale-90 transition-all shadow-xl hover:bg-white"
          aria-label="Close preview"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Large Image */}
        <img 
          src={photoUrl} 
          alt="Full size check-in" 
          className="w-full h-full object-contain rounded-3xl shadow-2xl border border-white/10"
        />
      </div>
    </div>
  );
};

export default PhotoPreviewModal;
