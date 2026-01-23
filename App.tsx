
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import MapView from './components/MapView';
import CameraModal from './components/CameraModal';
import PhotoPreviewModal from './components/PhotoPreviewModal';
import { CHECKIN_POINTS, DISTANCE_THRESHOLD_METERS } from './constants';
import { AppState, CheckInRecord, UserLocation, LocationPoint } from './types';
import { sendCheckInNotification, TELEGRAM_CHAT_ID, CheckInPayload } from './services/backendService';

const COUNTDOWN_DURATION_MINUTES = 16;
const COUNTDOWN_DURATION_SECONDS = COUNTDOWN_DURATION_MINUTES * 60;
const STORAGE_KEY = 'geo_checkin_persistence_v1';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    points: CHECKIN_POINTS,
    currentLocation: null,
    checkIns: [],
    isCameraOpen: false,
    selectedPointId: null,
    isLoading: false,
    error: null,
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isWaitingForSave, setIsWaitingForSave] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const sirenNodesRef = useRef<{ osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null>(null);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const startSirenLoop = async () => {
    try {
      const ctx = initAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();

      osc.type = 'triangle';
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.6, now);
      lfoGain.gain.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.3, now + 0.1);

      osc.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start();
      osc.start();
      sirenNodesRef.current = { osc, lfo, gain: mainGain };
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  const stopSirenLoop = () => {
    if (sirenNodesRef.current) {
      const { osc, lfo, gain } = sirenNodesRef.current;
      const ctx = initAudioContext();
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
          osc.disconnect();
          lfo.disconnect();
          gain.disconnect();
        } catch (e) { }
      }, 200);
      sirenNodesRef.current = null;
    }
  };

  const formatThaiDate = (dateSource: Date | string | number) => {
    const d = new Date(dateSource);
    const dayName = new Intl.DateTimeFormat('th-TH', { weekday: 'long' }).format(d);
    const dayNum = d.getDate();
    const monthName = new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(d);
    const year = new Intl.DateTimeFormat('th-TH', { year: 'numeric' }).format(d).replace('พ.ศ. ', '').trim();
    return `${dayName} ${dayNum} ${monthName} ${year}`;
  };

  const formatThaiTime = (dateSource: Date | string | number) => {
    const d = new Date(dateSource);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  // Restoration logic on mount (Modified for Daily Reset)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.checkIns && Array.isArray(parsed.checkIns) && parsed.checkIns.length > 0) {
          const lastCheckIn = parsed.checkIns[parsed.checkIns.length - 1];

          // --- ตรวจสอบว่าเป็นข้อมูลของ "วันนี้" หรือไม่ ---
          const checkInDate = new Date(lastCheckIn.timestamp).toDateString();
          const todayDate = new Date().toDateString();

          if (checkInDate === todayDate) {
            // เป็นของวันนี้ กู้คืนสถานะตามปกติ
            setState(prev => ({
              ...prev,
              checkIns: parsed.checkIns,
              selectedPointId: lastCheckIn.pointId
            }));

            const startTime = new Date(lastCheckIn.timestamp).getTime();
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            const remaining = COUNTDOWN_DURATION_SECONDS - elapsedSeconds;

            if (remaining > 0) {
              setCountdownSeconds(remaining);
            } else {
              setIsWaitingForSave(true);
            }
          } else {
            // ไม่ใช่ของวันนี้ (ข้ามวันแล้ว) ล้างข้อมูลทิ้ง
            localStorage.removeItem(STORAGE_KEY);
            console.log("Daily reset: ข้อมูลของวันเก่าถูกลบออกแล้ว");
          }
        }
      } catch (e) {
        console.error("Failed to load persistence data", e);
      }
    }
  }, []);

  // Persistence logic whenever checkIns change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ checkIns: state.checkIns }));
  }, [state.checkIns]);

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Improved Countdown Logic using absolute timestamp comparison
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const currentCheckIn = state.checkIns.find(c => c.pointId === state.selectedPointId);

    if (currentCheckIn && !isWaitingForSave) {
      const updateTimer = () => {
        const startTime = new Date(currentCheckIn.timestamp).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, COUNTDOWN_DURATION_SECONDS - elapsed);

        setCountdownSeconds(remaining);

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          startSirenLoop();
          setIsWaitingForSave(true);
        }
      };

      updateTimer(); // Initial sync
      timerRef.current = window.setInterval(updateTimer, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.checkIns, state.selectedPointId, isWaitingForSave]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const selectedPoint = useMemo(() => {
    return state.points.find(p => p.id === state.selectedPointId);
  }, [state.points, state.selectedPointId]);

  const currentCheckIn = useMemo(() => {
    return selectedPoint ? state.checkIns.find(c => c.pointId === selectedPoint.id) : null;
  }, [selectedPoint, state.checkIns]);

  // Logic to cancel countdown if user leaves the radius
  useEffect(() => {
    if (countdownSeconds !== null && countdownSeconds > 0 && !isWaitingForSave && state.currentLocation && selectedPoint) {
      const dist = calculateDistance(
        state.currentLocation.lat,
        state.currentLocation.lng,
        selectedPoint.lat,
        selectedPoint.lng
      );

      if (dist > DISTANCE_THRESHOLD_METERS) {
        // Reset countdown and remove current check-in record
        setCountdownSeconds(null);
        setState(prev => ({
          ...prev,
          checkIns: prev.checkIns.filter(c => c.pointId !== selectedPoint.id),
          error: "คุณออกนอกรัศมี! การนับถอยหลังถูกยกเลิก"
        }));

        // Clear error after 5 seconds
        setTimeout(() => {
          setState(prev => ({ ...prev, error: null }));
        }, 5000);
      }
    }
  }, [state.currentLocation, countdownSeconds, isWaitingForSave, selectedPoint]);

  const handleSaveData = async () => {
    if (isSending) return;

    stopSirenLoop();

    if (selectedPoint && currentCheckIn && state.currentLocation) {
      setIsSending(true);
      setSendResult(null);
      try {
        const durationMs = COUNTDOWN_DURATION_SECONDS * 1000;
        const payload: CheckInPayload = {
          chatId: TELEGRAM_CHAT_ID,
          locationName: selectedPoint.name,
          period: currentPeriodInfo?.periodId.toString() || '',
          periodStartTime: selectedPoint.startTime,
          periodEndTime: selectedPoint.endTime,
          lat: state.currentLocation.lat.toFixed(6),
          lng: state.currentLocation.lng.toFixed(6),
          distance: calculateDistance(state.currentLocation.lat, state.currentLocation.lng, selectedPoint.lat, selectedPoint.lng).toFixed(0),
          checkInTime: `${formatThaiDate(currentCheckIn.timestamp)} เวลา ${formatThaiTime(currentCheckIn.timestamp)}`,
          checkOutTime: `${formatThaiDate(new Date(currentCheckIn.timestamp).getTime() + durationMs)} เวลา ${formatThaiTime(new Date(currentCheckIn.timestamp).getTime() + durationMs)}`,
          photo: currentCheckIn.photoUrl
        };

        await sendCheckInNotification(payload);

        setSendResult('success');

        setTimeout(() => {
          setState(prev => ({
            ...prev,
            checkIns: prev.checkIns.filter(c => c.pointId !== selectedPoint.id)
          }));
          setIsWaitingForSave(false);
          setCountdownSeconds(null);
          setSendResult(null);
        }, 2000);

      } catch (err) {
        console.error("Failed to send notification:", err);
        setSendResult('error');
      } finally {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: "เบราว์เซอร์ไม่รองรับ GPS" }));
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState(prev => ({
          ...prev,
          currentLocation: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          },
          error: null
        }));
      },
      (err) => {
        let errorMsg = "ไม่สามารถระบุตำแหน่งได้";
        switch (err.code) {
          case 1: errorMsg = "กรุณาอนุญาตสิทธิ์เข้าถึงพิกัด"; break;
          case 2: errorMsg = "ไม่พบสัญญาณ GPS"; break;
          case 3: errorMsg = "หมดเวลาการค้นหาตำแหน่ง"; break;
          default: errorMsg = `ข้อผิดพลาด GPS: ${err.message}`;
        }
        setState(prev => ({ ...prev, error: errorMsg }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const isWithinTimeSlot = (startTime: string, endTime: string) => {
    const now = currentTime;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(endH, endM, 0, 0);
    if (endDate < startDate) return now >= startDate || now <= endDate;
    return now >= startDate && now <= endDate;
  };

  const activePoints = useMemo(() => {
    return state.points.filter(p => isWithinTimeSlot(p.startTime, p.endTime));
  }, [state.points, currentTime]);

  useEffect(() => {
    if (!state.currentLocation || activePoints.length === 0) return;
    if (countdownSeconds !== null || isWaitingForSave) return;

    let nearestPoint: LocationPoint | null = null;
    let minDistance = Infinity;
    activePoints.forEach(point => {
      const dist = calculateDistance(state.currentLocation!.lat, state.currentLocation!.lng, point.lat, point.lng);
      if (dist < minDistance) { minDistance = dist; nearestPoint = point; }
    });

    if (nearestPoint && state.selectedPointId !== (nearestPoint as LocationPoint).id) {
      setState(prev => ({ ...prev, selectedPointId: (nearestPoint as LocationPoint).id }));
    }
  }, [state.currentLocation, activePoints, state.selectedPointId, countdownSeconds, isWaitingForSave]);

  const currentPeriodInfo = useMemo(() => {
    if (activePoints.length === 0) return null;
    const point = activePoints.find(p => p.id === state.selectedPointId) || activePoints[0];
    return { periodId: (point as any).periodId, startTime: point.startTime, endTime: point.endTime };
  }, [activePoints, state.selectedPointId]);

  const handlePointSelect = useCallback((id: number) => {
    if (countdownSeconds !== null || isWaitingForSave) return;
    setState(prev => ({ ...prev, selectedPointId: id }));
  }, [countdownSeconds, isWaitingForSave]);

  const handleCapturePhoto = useCallback((photoBase64: string) => {
    initAudioContext();

    setState(prev => {
      const selectedPoint = prev.points.find(p => p.id === prev.selectedPointId);
      if (!selectedPoint) return prev;
      const checkInTime = new Date().toISOString();
      const newCheckIn: CheckInRecord = {
        pointId: selectedPoint.id,
        timestamp: checkInTime,
        photoUrl: photoBase64,
      };

      setCountdownSeconds(COUNTDOWN_DURATION_SECONDS);
      setIsWaitingForSave(false);
      setSendResult(null);

      return {
        ...prev,
        checkIns: [...prev.checkIns, newCheckIn],
        isCameraOpen: false
      };
    });
  }, []);

  const handleCloseCamera = useCallback(() => {
    setState(prev => ({ ...prev, isCameraOpen: false }));
  }, []);

  const getPointStatus = (point: LocationPoint) => {
    const checked = state.checkIns.find(c => c.pointId === point.id);
    if (checked) return 'CHECKED';
    const distance = state.currentLocation ? calculateDistance(state.currentLocation.lat, state.currentLocation.lng, point.lat, point.lng) : Infinity;
    const onTime = isWithinTimeSlot(point.startTime, point.endTime);
    if (!onTime) return 'CLOSED';
    if (distance > DISTANCE_THRESHOLD_METERS) return 'TOO_FAR';
    return 'AVAILABLE';
  };

  const status = selectedPoint ? getPointStatus(selectedPoint) : null;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">
              {currentPeriodInfo ? (
                <>ช่วงเวลา <span className="text-indigo-600">{currentPeriodInfo.periodId}</span></>
              ) : "ไม่อยู่ในช่วงเวลา"}
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {currentPeriodInfo ? `${currentPeriodInfo.startTime} - ${currentPeriodInfo.endTime} น.` : "กรุณารอเวลา"}
            </p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-sm font-black tabular-nums text-slate-700">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${state.currentLocation ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
              {state.currentLocation ? 'Live Tracking' : 'Searching GPS...'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <section className="flex-1 min-h-[35vh] md:min-h-0 relative p-4">
          <MapView
            points={activePoints} userLocation={state.currentLocation}
            selectedPointId={state.selectedPointId} onSelectPoint={handlePointSelect}
            checkInRadius={DISTANCE_THRESHOLD_METERS}
          />

          {countdownSeconds !== null && !isWaitingForSave && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
              <div className="relative group animate-in zoom-in-95 fade-in duration-500 pointer-events-auto flex items-center justify-center">
                <div className="absolute -inset-6 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute inset-[-12px] bg-white rounded-full shadow-[0_15px_35px_-10px_rgba(0,0,0,0.15)] border border-slate-100/50"></div>
                <svg className="w-40 h-40 -rotate-90 relative drop-shadow-sm overflow-visible" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                  <circle cx="60" cy="60" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - countdownSeconds / COUNTDOWN_DURATION_SECONDS)} strokeLinecap="round" className="text-indigo-600 transition-all duration-1000 ease-linear" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-indigo-700 tabular-nums tracking-tighter drop-shadow-sm">{formatCountdown(countdownSeconds)}</span>
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">MIN : SEC</span>
                </div>
              </div>
            </div>
          )}

          {state.error && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-black border-2 border-white text-center min-w-[280px] animate-in slide-in-from-top duration-300">
              {state.error}
            </div>
          )}
        </section>

        <aside className="w-full md:w-96 bg-white border-l shadow-2xl flex flex-col z-10 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 flex flex-col">
            {!selectedPoint ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4 animate-pulse">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <p className="text-slate-500 font-bold">กำลังค้นหาจุดที่ใกล้ที่สุด...</p>
              </div>
            ) : (
              <div className="space-y-6 flex-1">
                <div>
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <h2 className="text-xl font-black text-slate-900 leading-tight">{selectedPoint.name}</h2>
                    <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-md shadow-sm border ${status === 'CHECKED' ? 'bg-green-100 text-green-700 border-green-200' :
                        status === 'AVAILABLE' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          status === 'TOO_FAR' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-100 text-red-700 border-red-200'
                      }`}>
                      {status === 'CHECKED' && 'เช็คอินสำเร็จ'}
                      {status === 'AVAILABLE' && 'พร้อมเช็คอิน'}
                      {status === 'TOO_FAR' && 'ไม่อยู่ในระยะ'}
                      {status === 'CLOSED' && 'นอกเวลา'}
                    </span>
                  </div>
                  {state.currentLocation && (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-6">
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center shadow-sm">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Latitude</p>
                          <p className="text-[10px] font-bold text-purple-600 tabular-nums">{state.currentLocation.lat.toFixed(6)}</p>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center shadow-sm">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Longitude</p>
                          <p className="text-[10px] font-bold text-purple-600 tabular-nums">{state.currentLocation.lng.toFixed(6)}</p>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center shadow-sm">
                          <p className="text-[8px] font-black text-slate-400 uppercase">ระยะห่าง</p>
                          <p className="text-[10px] font-bold text-orange-600 tabular-nums">
                            {`${calculateDistance(state.currentLocation.lat, state.currentLocation.lng, selectedPoint.lat, selectedPoint.lng).toFixed(0)}ม.`}
                          </p>
                        </div>
                      </div>
                      {status === 'CHECKED' && currentCheckIn && (
                        <div className="flex gap-4 items-stretch mb-6">
                          <div className="flex-1">
                            <div className="h-full bg-white p-3 rounded-xl border-l-4 border-indigo-500 shadow-sm border-y border-r border-slate-100 space-y-2">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block leading-none">เวลาเช็คอิน</span>
                              <span className="text-[11px] text-slate-700 font-bold block leading-tight">{formatThaiDate(currentCheckIn.timestamp)}</span>
                              <div className="grid grid-cols-2 gap-2 pt-5 border-t border-slate-50">
                                <div className="bg-green-50/40 p-1.5 rounded-lg border border-green-100/50 flex flex-col justify-center">
                                  <span className="text-[8px] font-black text-green-600 uppercase tracking-tighter block leading-none mb-1">เวลาเช็คอินเข้า</span>
                                  <span className="text-[10px] font-black text-green-500 tabular-nums">{formatThaiTime(currentCheckIn.timestamp)}</span>
                                </div>
                                <div className="bg-red-50/40 p-1.5 rounded-lg border border-red-100/50 flex flex-col justify-center">
                                  <span className="text-[8px] font-black text-red-600 uppercase tracking-tighter block leading-none mb-1">เวลาเช็คอินออก</span>
                                  <span className={`text-[10px] font-black tabular-nums ${countdownSeconds !== null && countdownSeconds > 0 ? 'text-amber-500 italic' : 'text-red-500'}`}>
                                    {countdownSeconds !== null && countdownSeconds > 0 ? (
                                      '-- : -- : --'
                                    ) : (
                                      formatThaiTime(new Date(currentCheckIn.timestamp).getTime() + COUNTDOWN_DURATION_SECONDS * 1000)
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <button onClick={() => setIsPreviewOpen(true)} className="group relative block w-24 h-full rounded-2xl overflow-hidden shadow-lg border-2 border-white ring-1 ring-slate-100 transition-transform active:scale-95">
                              <img src={currentCheckIn?.photoUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="เช็คอิน" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                              </div>
                              <div className="absolute inset-x-0 bottom-0 bg-black/40 text-white text-[7px] py-1 text-center font-bold backdrop-blur-sm">
                                คลิกเพื่อดูภาพขยาย
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="space-y-4">
                  {status !== 'CHECKED' && (
                    <div className="space-y-4">
                      <button onClick={() => setState(prev => ({ ...prev, isCameraOpen: true }))} disabled={status !== 'AVAILABLE'} className={`w-full py-6 rounded-3xl font-black text-xl flex flex-col items-center gap-1 transition-all active:scale-95 shadow-lg ${status === 'AVAILABLE' ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}>
                        ถ่ายรูปเพื่อเช็คอิน
                      </button>
                      {status === 'TOO_FAR' && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                          <p className="text-amber-800 text-xs font-black italic">คุณยังอยู่นอกระยะเช็คอิน</p>
                          <p className="text-amber-600 text-[9px] mt-1 font-bold">กรุณาเข้าใกล้รัศมีวงกลมบนแผนที่</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-auto pt-6 text-center">
              <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">ระบบเช็คอินพิกัดด้วยภาพถ่าย</p>
            </div>
          </div>
        </aside>
      </main>

      {/* Summary Modal before saving */}
      {isWaitingForSave && selectedPoint && currentCheckIn && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-500 p-4 overflow-hidden">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-500 w-full max-w-sm max-h-[95vh] overflow-hidden flex flex-col">

            <div className="p-5 border-b text-center bg-slate-50/50">
              <span className="text-lg font-black uppercase tracking-[0.1em] text-slate-800 block">สรุปข้อมูลการเข้าพิกัด</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">

              <div className="text-center px-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">ชื่อพิกัดที่คุณยืนอยู่</span>
                <h3 className="text-2xl font-black text-slate-900 leading-tight">{selectedPoint.name}</h3>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => setIsPreviewOpen(true)}
                  className="group relative w-full h-40 rounded-2xl overflow-hidden shadow-lg border-4 border-white ring-1 ring-slate-100 active:scale-[0.98] transition-all"
                >
                  <img src={currentCheckIn.photoUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Capture Preview" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <svg className="w-10 h-10 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-black/40 text-white text-[8px] py-1 text-center font-bold backdrop-blur-sm">
                    คลิกเพื่อดูภาพขยาย
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 p-2 rounded-2xl border border-slate-100 text-center flex flex-col justify-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">ช่วงเวลา</span>
                  <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">
                    {currentPeriodInfo ? `${currentPeriodInfo.startTime} - ${currentPeriodInfo.endTime}` : '-'}
                  </span>
                  <div className="pt-1 border-t border-slate-200/50 mt-0.5">
                    <span className="text-[11px] font-black text-indigo-600 leading-none">
                      {currentPeriodInfo ? `${currentPeriodInfo.periodId}` : '-'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded-2xl border border-slate-100 text-center flex flex-col justify-center">
                  <div className="mb-1.5">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter block leading-none mb-0.5">Latitude</span>
                    <span className="text-[9px] font-bold tabular-nums text-purple-600 leading-none">{state.currentLocation ? state.currentLocation.lat.toFixed(6) : '-'}</span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-200/50">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter block leading-none mb-0.5">Longitude</span>
                    <span className="text-[9px] font-bold tabular-nums text-purple-600 leading-none">{state.currentLocation ? state.currentLocation.lng.toFixed(6) : '-'}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded-2xl border border-slate-100 text-center flex flex-col justify-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">ระยะห่าง</span>
                  <span className="text-[13px] font-black tabular-nums text-orange-600 leading-none mb-0.5">
                    {state.currentLocation ? calculateDistance(state.currentLocation.lat, state.currentLocation.lng, selectedPoint.lat, selectedPoint.lng).toFixed(0) : '-'}
                  </span>
                  <span className="text-[7px] font-bold text-orange-400 uppercase leading-none">เมตร</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left space-y-3">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">เวลาเช็คอิน</span>
                  <span className="text-[12px] font-black text-slate-800 block leading-tight">{formatThaiDate(currentCheckIn.timestamp)}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">เวลาเช๊คอินเข้า</span>
                    <span className="text-[12px] font-black text-green-500 tabular-nums leading-none">{formatThaiTime(currentCheckIn.timestamp)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">เวลาเช๊คอินออก</span>
                    <span className="text-[12px] font-black text-red-500 tabular-nums leading-none">{formatThaiTime(new Date(currentCheckIn.timestamp).getTime() + COUNTDOWN_DURATION_SECONDS * 1000)}</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="p-5 bg-white border-t">
              {sendResult === 'success' ? (
                <div className="space-y-3">
                  <div className="bg-emerald-500 text-white p-6 rounded-2xl flex flex-col items-center justify-center gap-2 animate-in zoom-in-95 shadow-lg shadow-emerald-200">
                    <div className="flex items-center gap-3">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      <span className="text-xl font-black uppercase">บันทึกข้อมูลเข้าระบบเเล้ว!</span>
                    </div>
                  </div>
                </div>
              ) : sendResult === 'error' ? (
                <div className="space-y-3">
                  <div className="bg-red-500 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-1 animate-in shake shadow-lg shadow-red-200">
                    <div className="flex items-center gap-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                      <span className="text-lg font-black uppercase">การส่งข้อมูลผิดพลาด</span>
                    </div>
                    <span className="text-[9px] font-bold text-red-100 uppercase">กรุณาตรวจสอบการตั้งค่า Webhook</span>
                  </div>
                  <button onClick={handleSaveData} className="w-full py-4 rounded-2xl bg-slate-900 text-white font-bold active:scale-95 transition-all shadow-xl">ลองใหม่อีกครั้ง</button>
                </div>
              ) : (
                <button
                  onClick={handleSaveData}
                  disabled={isSending || !state.currentLocation}
                  className="w-full py-6 rounded-2xl bg-emerald-500 text-white flex flex-col items-center justify-center gap-1 shadow-xl active:scale-95 transition-all hover:bg-emerald-600 animate-pulse-gentle disabled:bg-slate-300 disabled:animate-none"
                >
                  {isSending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="text-xl font-black uppercase tracking-tight">กำลังประมวลผล...</span>
                    </div>
                  ) : !state.currentLocation ? (
                    <span className="text-sm font-black uppercase tracking-tight">กรุณารอสัญญาณ GPS...</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xl font-black uppercase tracking-tight">บันทึกข้อมูล</span>
                      </div>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state.isCameraOpen && selectedPoint && (
        <CameraModal locationName={selectedPoint.name} onClose={handleCloseCamera} onCapture={handleCapturePhoto} />
      )}
      {isPreviewOpen && currentCheckIn && (
        <PhotoPreviewModal photoUrl={currentCheckIn.photoUrl} onClose={() => setIsPreviewOpen(false)} />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        @keyframes pulse-gentle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-pulse-gentle {
          animation: pulse-gentle 1.5s ease-in-out infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-in.shake {
          animation: shake 0.3s ease-in-out 3;
        }
      `}</style>
    </div>
  );
};

export default App;
