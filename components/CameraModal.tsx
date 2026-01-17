
import React, { useRef, useState, useEffect } from 'react';

interface CameraModalProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
  locationName: string;
}

const CameraModal: React.FC<CameraModalProps> = ({ onCapture, onClose, locationName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function setupCamera() {
      if (streamRef.current) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsCameraReady(true);
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        alert("ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งาน");
        onClose();
      }
    }

    if (!capturedImage) {
      setupCamera();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setIsCameraReady(false);
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [onClose, capturedImage]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current && isCameraReady) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col overflow-hidden animate-in fade-in duration-300">
      
      {/* Full Screen Display Area */}
      <div className="absolute inset-0 bg-black overflow-hidden">
        {capturedImage ? (
          <img 
            src={capturedImage} 
            alt="Captured" 
            className="w-full h-full object-cover animate-in fade-in duration-300" 
          />
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              className="w-full h-full object-cover"
            />
            {!isCameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-white bg-black z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-white"></div>
                  <p className="text-sm font-black text-white/60 tracking-widest uppercase">Initializing Camera...</p>
                </div>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Overlaid UI - Top */}
      <div className="relative z-20 p-8 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto max-w-[70%]">
           <span className="bg-black/30 backdrop-blur-md text-white/90 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20 shadow-xl block w-fit">
              {capturedImage ? "ตรวจสอบรูปภาพ" : "เล็งให้ตรงจุดเช็คอิน"}
           </span>
           <h4 className="text-white text-2xl font-black mt-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] truncate">{locationName}</h4>
        </div>

        <button 
          onClick={onClose} 
          className="pointer-events-auto w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 active:scale-90 transition-all shadow-2xl"
          aria-label="Close camera"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Overlaid UI - Bottom (Controls shifted up) */}
      <div className="absolute bottom-20 inset-x-0 px-10 flex justify-center items-center z-20">
        {!capturedImage ? (
          <button 
            onClick={handleCapture}
            disabled={!isCameraReady}
            className={`w-24 h-24 bg-white/20 backdrop-blur-xl rounded-full border-[8px] flex items-center justify-center shadow-2xl active:scale-90 transition-all ${
              isCameraReady ? 'border-white' : 'border-white/20 opacity-50'
            }`}
          >
            <div className={`w-16 h-16 rounded-full shadow-inner ${isCameraReady ? 'bg-white' : 'bg-white/40'}`}></div>
          </button>
        ) : (
          <div className="flex justify-between items-center w-full px-4">
            {/* ปุ่มยกเลิก - วงกลมใส ตัวอักษรขาว */}
            <button 
              onClick={handleRetake}
              className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-xl border-2 border-white/30 text-white font-black text-[11px] active:scale-90 transition-all flex flex-col items-center justify-center gap-1 shadow-2xl"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
              ยกเลิก
            </button>
            
            {/* ปุ่มยืนยัน - วงกลมใส ตัวอักษรขาว ขนาดเท่ากัน */}
            <button 
              onClick={handleConfirm}
              className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-xl border-2 border-white/30 text-white font-black text-[11px] active:scale-90 transition-all flex flex-col items-center justify-center gap-1 shadow-2xl"
            >
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
              ยืนยัน
            </button>
          </div>
        )}
      </div>

      {/* Subtle bottom vignette to ensure buttons are visible on light backgrounds */}
      <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10"></div>
    </div>
  );
};

export default CameraModal;
