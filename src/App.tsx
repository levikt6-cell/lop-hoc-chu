import { useEffect, useRef, useState } from 'react';
import { IS_STAGE } from './live/page';
import { StageFrame } from './live/StageFrame';
import { Dashboard } from './live/Dashboard';
import { useGame } from './game/useGame';
import { GameStage } from './game/GameStage';
import { GameControls } from './game/GameControls';

export default function App() {
  const game = useGame();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.3);
  const [mood, setMood] = useState<'angry' | 'happy' | 'sad' | null>(null);
  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Lắng nghe lệnh điều khiển trên CẢ TRANG STAGE VÀ DASHBOARD
  useEffect(() => {
    const es = new EventSource('/api/tiktok/events');

    es.addEventListener('control', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.action === 'custom') {
          // Điều khiển âm lượng (chỉ Stage mới có audioRef)
          if (data.text?.startsWith('vol:')) {
            const newVol = parseFloat(data.text.replace('vol:', ''));
            if (audioRef.current) audioRef.current.volume = newVol;
          }

          // Điều khiển cảm xúc cô giáo (nhận trên cả 2 màn hình)
          if (data.text?.startsWith('mood:')) {
            const newMood = data.text.replace('mood:', '') as 'angry' | 'happy' | 'sad' | 'none';
            if (moodTimerRef.current) clearTimeout(moodTimerRef.current);

            if (newMood === 'none') {
              setMood(null);
            } else {
              setMood(newMood);
              // Tự động tắt hiệu ứng sau 7 giây
              moodTimerRef.current = setTimeout(() => setMood(null), 7000);
            }
          }
        }
      } catch {}
    });

    return () => {
      es.close();
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    };
  }, []);

  // 2. Mở khóa âm thanh (chỉ cần chạy trên trang Stage)
  useEffect(() => {
    if (!IS_STAGE) return;
    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.volume = 0.3;
        audioRef.current.play().catch(() => {});
      }
      window.removeEventListener('click', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    return () => window.removeEventListener('click', unlockAudio);
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'custom', text: `vol:${val}` }),
    }).catch(() => {});
  };

  // Lớp phủ hiển thị hiệu ứng cảm xúc
  const renderMoodOverlay = () => {
    if (!mood) return null;
    return (
      <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
        {mood === 'angry' && (
          <div className="effect-angry-lightning absolute inset-0 flex flex-col items-center justify-start pt-16">
            <span className="animate-bounce text-6xl drop-shadow-[0_0_20px_rgba(255,255,255,0.9)]">⚡🌩️⚡</span>
            <span className="mt-3 rounded-full border border-red-500 bg-red-950/85 px-4 py-1.5 text-xs font-extrabold tracking-wide text-red-200 shadow-xl">
              😡 CÔ ĐANG RẤT TỨC GIẬN!
            </span>
          </div>
        )}
        {mood === 'happy' && (
          <div className="effect-happy-flowers absolute inset-0 flex flex-col items-center justify-start pt-16">
            <span className="animate-pulse text-6xl drop-shadow-[0_0_20px_rgba(244,114,182,0.9)]">🌸🌺🌼🌻</span>
            <span className="mt-3 rounded-full border border-pink-400 bg-pink-950/85 px-4 py-1.5 text-xs font-extrabold tracking-wide text-pink-200 shadow-xl">
              🥰 CÔ GIÁO ĐANG RẤT VUI!
            </span>
          </div>
        )}
        {mood === 'sad' && (
          <div className="effect-sad-rain absolute inset-0 flex flex-col items-center justify-start pt-16">
            <span className="animate-pulse text-6xl drop-shadow-[0_0_20px_rgba(59,130,246,0.9)]">🌧️💧🌧️</span>
            <span className="mt-3 rounded-full border border-blue-400 bg-slate-950/85 px-4 py-1.5 text-xs font-extrabold tracking-wide text-blue-200 shadow-xl">
              😢 CÔ ĐANG BUỒN LẮM ĐẤY...
            </span>
          </div>
        )}
      </div>
    );
  };

  // --------------------------------------------------------
  // A. MÀN HÌNH STAGE THẬT (TikTok LIVE Studio / OBS)
  // --------------------------------------------------------
  if (IS_STAGE) {
    return (
      <div
        className="relative flex h-screen w-screen cursor-pointer select-none items-center justify-center bg-black"
        onClick={() => {
          if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
        }}
      >
        <audio ref={audioRef} src="/assets/nhac.mp3" loop preload="auto" />
        <StageFrame>
          <div className="relative h-full w-full overflow-hidden">
            <GameStage game={game} />
            {renderMoodOverlay()}
          </div>
        </StageFrame>
      </div>
    );
  }

  // --------------------------------------------------------
  // B. MÀN HÌNH BẢNG ĐIỀU KHIỂN (Dashboard)
  // --------------------------------------------------------
  return (
    <Dashboard
      status={game.status}
      channelName={game.channelName}
      preview={
        <StageFrame maxHeight={window.innerHeight - 40}>
          <div className="relative h-full w-full overflow-hidden">
            <GameStage game={game} />
            {/* Hiển thị hiệu ứng trực tiếp ngay trên khung Preview của Dashboard */}
            {renderMoodOverlay()}
          </div>
        </StageFrame>
      }
      extra={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-white shadow-lg">
            <span className="text-sm font-medium">🎵 Nhạc:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 cursor-pointer accent-pink-500"
            />
            <span className="w-9 text-right text-xs font-bold text-pink-300">
              {Math.round(volume * 100)}%
            </span>
          </div>

          <GameControls view={game.view} stageCount={game.stageCount} />
        </div>
      }
    />
  );
}