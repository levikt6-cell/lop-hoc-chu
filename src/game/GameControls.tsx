import { useEffect, useRef, useState } from 'react';
import { emitTest, sendControl } from '../live/page';
import type { StageView } from './useGame';
import { GAME, shownTeacherName, type RoomCfg } from './config';

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
const TEN = ['Lan Anh', 'Minh Tuấn', 'Thu Trang', 'Quốc Bảo', 'Ngọc Hân', 'Gia Huy', 'Khánh Linh', 'Hải Yến', 'Đức Anh', 'Bảo Ngọc', 'Thanh Hà', 'Văn Toàn'];
const CHAT = ['khó quá cô ơi', 'chữ gì vậy trời', 'hay quá', 'vào lớp', 'cô xinh quá', 'ủa là gì', '???', 'hihi'];
const fake = (i: number) => ({ username: `hs${i}`, nickname: `${HO[i % HO.length]} ${TEN[i % TEN.length]}`, avatar: '' });
const shuffleWord = (w: string) => [...w].sort(() => Math.random() - 0.5).join('');

const SAMPLE_TEMPLATE = `# Tên chủ đề mẫu (Viết có dấu hoặc không dấu)
# Mỗi dòng: ĐÁP ÁN | gợi ý | độ khó (1 dễ, 2 vừa, 3 khó) | cách viết khác cũng tính đúng (cách nhau dấu phẩy)
> Dòng mô tả chủ đề xuất hiện đầu tiết học cho cả lớp xem.
TRÁI TIM | Con gì đập thì sống, không đập thì chết ngắc. | 1 | TIM
CÁI BÀN | Có mặt mà không có mắt, có bốn chân mà chẳng biết đi. | 1 | BÀN
QUẦN ĐẢO | Quần gì rộng lớn bao la nhất, nằm lênh đênh giữa biển khơi? | 2 | ĐẢO
LÝ THÁI TỔ | Vị vua đặt nền móng dời kinh đô từ Hoa Lư về Thăng Long. | 2 | LÝ CÔNG UẨN
GÃY TAY | Căn bệnh chấn thương khiến bác sĩ bắt buộc phải bó tay điều trị. | 3 | GÃY CÁNH TAY, BỆNH GÃY TAY
QUAN TÀI | Người đóng không nằm, người mua không dùng, người dùng chẳng hay biết. | 3 | ÁO QUAN, QUAN QUÁCH
`;

function RoomSettings() {
  const [cfg, setCfg] = useState<RoomCfg>(GAME.defaultRoom);
  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [mins, setMins] = useState('');
  const [danceText, setDanceText] = useState('');
  const [danceSec, setDanceSec] = useState('');
  const [bdText, setBdText] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const load = (r: Partial<RoomCfg>) => setCfg({ ...GAME.defaultRoom, ...r });

  useEffect(() => {
    fetch('/api/room-settings').then((r) => r.json()).then(load).catch(() => {});
  }, []);

  const save = async (patch: Partial<RoomCfg>, done: string) => {
    const r = await fetch('/api/room-settings', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(patch) 
    }).then((x) => x.json());
    setMsg(r.success ? done : r.error);
    if (r.success) load(r.room);
    return r.success as boolean;
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setMsg('Đang tải ảnh lên...');
    const r = await fetch('/api/room-bg', { method: 'POST', headers: { 'Content-Type': f.type }, body: f })
      .then((x) => x.json())
      .catch(() => ({ success: false, error: 'Ảnh quá lớn hoặc không đúng loại (PNG, JPG, WEBP, tối đa 12 MB)' }));
    setMsg(r.success ? 'Đã đổi nền lớp' : r.error);
    if (r.success) load(r.room);
    if (file.current) file.current.value = '';
  };

  const resetBg = async () => {
    const r = await fetch('/api/room-bg', { method: 'DELETE' }).then((x) => x.json());
    setMsg('Đã về nền gốc');
    load(r.room);
  };

  const input = 'min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-1';
  const row = 'flex items-center gap-1.5';
  const label = 'w-24 shrink-0 text-slate-400';

  return (
    <div className="space-y-2 rounded-2xl bg-slate-900 p-3 text-xs ring-1 ring-slate-800">
      <div className="flex justify-between font-semibold text-slate-200">
        <span>🏫 Cài đặt lớp</span>
        <span className="font-normal text-amber-300">{msg}</span>
      </div>
      <div className={row}>
        <span className={label}>Người đứng lớp</span>
        <select
          className={input}
          value={cfg.teacher}
          onChange={(e) => {
            const teacher = e.target.value as RoomCfg['teacher'];
            const patch: Partial<RoomCfg> = { teacher, teacherVoice: teacher === 'thay' ? 'nam' : 'nu' };
            if (teacher === 'thay' && /^cô(\s|$)/i.test(cfg.teacherName)) patch.teacherName = GAME.defaultThayName;
            if (teacher === 'co' && /^thầy(\s|$)/i.test(cfg.teacherName)) patch.teacherName = GAME.defaultRoom.teacherName;
            save(patch, teacher === 'thay' ? 'Đã đổi sang thầy giáo (giọng nam)' : 'Đã đổi sang cô Ngân');
          }}
        >
          <option value="co">👩‍🏫 Cô Ngân (giọng nữ)</option>
          <option value="thay">👨‍🏫 Thầy giáo (giọng nam)</option>
        </select>
      </div>
      <div className={row}>
        <span className={label}>Tên {cfg.teacher === 'thay' ? 'thầy' : 'cô'} giáo</span>
        <input className={input} placeholder={shownTeacherName(cfg)} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <Btn disabled={!name.trim()} onClick={() => save({ teacherName: name }, 'Đã đổi tên').then((ok) => ok && setName(''))}>
          Lưu
        </Btn>
      </div>
      <div className={row}>
        <span className={label}>Giọng đọc</span>
        <select className={input} disabled={cfg.teacher === 'thay'} value={cfg.teacher === 'thay' ? 'nam' : cfg.teacherVoice} onChange={(e) => save({ teacherVoice: e.target.value as RoomCfg['teacherVoice'] }, 'Đã đổi giọng')}>
          <option value="nu">Nữ (HoaiMy)</option>
          <option value="nam">Nam (NamMinh)</option>
        </select>
      </div>
      <div className={row}>
        <span className={label}>Chữ bảng đỏ</span>
        <input className={input} placeholder={cfg.motto} maxLength={40} value={motto} onChange={(e) => setMotto(e.target.value)} />
        <Btn disabled={!motto.trim()} onClick={() => save({ motto }, 'Đã đổi chữ bảng đỏ').then((ok) => ok && setMotto(''))}>
          Lưu
        </Btn>
      </div>
      <div className={row}>
        <span className={label}>Cuộc thi</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={cfg.everest} onChange={(e) => save({ everest: e.target.checked }, e.target.checked ? 'Đã bật Everest' : 'Đã tắt Everest')} />
          🏔️ Everest
        </label>
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" checked={cfg.chuong} onChange={(e) => save({ chuong: e.target.checked }, e.target.checked ? 'Đã bật Rung Chuông Đồng' : 'Đã tắt Rung Chuông Đồng')} />
          🔔 Rung Chuông Đồng
        </label>
      </div>
      <div className={row}>
        <span className={label}>😅 Đứng phạt</span>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={cfg.standWrong}
            onChange={(e) => save({ standWrong: e.target.checked }, e.target.checked ? 'Đã bật đứng phạt' : 'Đã tắt đứng phạt (các bạn đang đứng về chỗ)')}
          />
          Gõ sai thì lên bục đứng phạt {GAME.standQuestions} câu (tối đa {GAME.standMax} bạn)
        </label>
      </div>
      <div className={row}>
        <span className={label}>👮 Giám thị</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={cfg.supervisor} onChange={(e) => save({ supervisor: e.target.checked }, e.target.checked ? 'Đã bật thầy giám thị' : 'Đã tắt thầy giám thị')} />
          Đưa bạn ngồi im quá
        </label>
        <input className="w-14 rounded-lg bg-slate-800 px-2 py-1" type="number" min={1} max={60} placeholder={String(cfg.supervisorMin)} value={mins} onChange={(e) => setMins(e.target.value)} />
        <span className="text-slate-400">phút ra ngoài</span>
        <Btn disabled={!mins} onClick={() => save({ supervisorMin: Number(mins) }, 'Đã đổi số phút giám thị').then((ok) => ok && setMins(''))}>
          Lưu
        </Btn>
      </div>
      <div className={row}>
        <span className={label}>💃 Nhảy múa</span>
        <select className={input} value={cfg.dance} onChange={(e) => save({ dance: e.target.value as RoomCfg['dance'] }, 'Đã đổi giờ ra chơi nhảy múa')}>
          <option value="off">Tắt</option>
          <option value="mix">Xen kẽ với trò ra chơi khác</option>
          <option value="always">Mọi giờ ra chơi đều nhảy</option>
        </select>
        <input className="w-14 rounded-lg bg-slate-800 px-2 py-1" type="number" min={10} max={120} placeholder={String(cfg.danceSec)} value={danceSec} onChange={(e) => setDanceSec(e.target.value)} />
        <span className="text-slate-400">giây</span>
        <Btn disabled={!danceSec} onClick={() => save({ danceSec: Number(danceSec) }, 'Đã đổi thời gian nhảy').then((ok) => ok && setDanceSec(''))}>
          Lưu
        </Btn>
      </div>
      <div className={row}>
        <span className={label}>Thông báo nhảy</span>
        <input className={input} placeholder={cfg.danceText} maxLength={80} value={danceText} onChange={(e) => setDanceText(e.target.value)} />
        <Btn disabled={!danceText.trim()} onClick={() => save({ danceText }, 'Đã đổi thông báo nhảy múa').then((ok) => ok && setDanceText(''))}>
          Lưu
        </Btn>
      </div>
      <div className={row}>
        <span className={label}>🎂 Biểu ngữ SN</span>
        <input className={input} placeholder={cfg.birthdayText} maxLength={60} value={bdText} onChange={(e) => setBdText(e.target.value)} />
        <Btn disabled={!bdText.trim()} onClick={() => save({ birthdayText: bdText }, 'Đã đổi chữ biểu ngữ sinh nhật').then((ok) => ok && setBdText(''))}>
          Lưu
        </Btn>
      </div>
      <div className="pl-[102px] text-slate-500">Biểu ngữ sinh nhật: gõ {'{ten}'} để chèn tên bạn đó vào giữa câu, không gõ thì tên hiện ở dòng dưới.</div>
      <div className={row}>
        <span className={label}>Nền lớp học</span>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <Btn onClick={() => file.current?.click()}>Chọn ảnh...</Btn>
        {cfg.bg && <Btn onClick={resetBg}>Về nền gốc</Btn>}
        <span className="text-slate-500">Ảnh dọc 9:16, tối đa 12 MB</span>
      </div>
    </div>
  );
}

export function GameControls({ view, stageCount = 0 }: { view: StageView | null; stageCount?: number }) {
  const [sent, setSent] = useState(0);
  const [running, setRunning] = useState(false);
  const [bdName, setBdName] = useState('');
  const [customText, setCustomText] = useState('');

  const downloadSampleTemplate = () => {
    const blob = new Blob([SAMPLE_TEMPLATE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-cau-hoi-lop-hoc-chu.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const flood = async (n: number) => {
    if (!view?.answer || running) return;
    setRunning(true);
    setSent(0);
    const answer = view.answer.toLowerCase();
    const start = Date.now();
    let done = 0;
    await Promise.all(
      Array.from({ length: n }, (_, i) => {
        const r = Math.random();
        const comment = r < 0.15 ? answer : r < 0.35 ? shuffleWord(answer) : CHAT[i % CHAT.length];
        const delay = Math.random() * 20_000;
        return new Promise<void>((ok) =>
          setTimeout(async () => {
            await emitTest('chat', { ...fake(i), comment, createTime: start + delay - Math.random() * 1500 }).catch(() => {});
            setSent(++done);
            ok();
          }, delay),
        );
      }),
    );
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      {stageCount === 0 && (
        <div className="rounded-lg bg-amber-600 p-2.5 text-xs font-semibold text-white">
          ⚠️ Chưa mở màn hình Live (Stage). Hãy mở link: <code className="bg-black/30 px-1 py-0.5 rounded">/?view=stage</code> trên tab khác hoặc OBS để các nút có hiệu lực!
        </div>
      )}
      {stageCount > 1 && <div className="rounded-lg bg-red-600 p-2 text-white">Đang mở {stageCount} trang stage, sẽ có 2 giọng. Đóng bớt đi.</div>}
      
      <RoomSettings />

      {view && (
        <div className="rounded-lg bg-slate-800 p-3 text-sm leading-6">
          <div>
            Ván {view.round} · câu {view.qNo}/{view.total} · {view.phase}
          </div>
          <div>
            Đáp án (chỉ mình thấy): <b className="text-amber-300">{view.answer || '—'}</b>
          </div>
          <div>
            Bot nhận câu này: <b>{view.stats.received}</b> comment · {view.stats.attempts} lượt trả lời · {view.correctCount} đúng
            {(view.stats.early ?? 0) > 0 && <span className="text-amber-300"> · {view.stats.early} gửi lúc cô còn đọc</span>}
            {(view.stats.noMarks ?? 0) > 0 && <span className="text-amber-300"> · {view.stats.noMarks} gõ thiếu dấu</span>}
          </div>
          <div>
            Đang chơi: <b>{view.players}</b> bạn
            {view.players < GAME.smallRoomPlayers && <span className="text-amber-300"> · phòng vắng: có người đúng là {GAME.smallRoomEndAfterSec} giây sau chốt câu</span>}
          </div>
          {view.topic && <div>Chủ đề đang chơi: <b className="text-emerald-400">{view.topic}</b></div>}
          {sent > 0 && <div>Giả lập đã gửi: {sent}</div>}
        </div>
      )}

      {/* 1. KHỐI NHẬP CHỮ TRỰC TIẾP CHO CÔ GIÁO ĐỌC */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 p-2.5 ring-1 ring-slate-800">
        <span className="text-xs font-semibold text-slate-400">🎤 Cô nói với người xem:</span>
        <input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customText.trim()) {
              sendControl('speak', customText.trim());
              setCustomText('');
            }
          }}
          placeholder="Nhập câu bạn muốn cô giáo nói..."
          className="flex-1 min-w-[240px] rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <Btn
          disabled={!customText.trim()}
          onClick={() => {
            if (customText.trim()) {
              sendControl('speak', customText.trim());
              setCustomText('');
            }
          }}
        >
          🗣️ Cô đọc ngay
        </Btn>
      </div>

      {/* 2. CỤM CẢM XÚC CÔ GIÁO */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 p-2.5 ring-1 ring-slate-800">
        <span className="text-xs font-semibold text-slate-400">🎭 Cảm xúc cô giáo:</span>
        <button
          onClick={() => sendControl('custom', 'mood:angry')}
          className="rounded-lg bg-red-800 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow transition-all active:scale-95"
        >
          ⚡ Tức giận (Sấm sét)
        </button>
        <button
          onClick={() => sendControl('custom', 'mood:happy')}
          className="rounded-lg bg-pink-600 hover:bg-pink-500 px-3 py-1.5 text-xs font-bold text-white shadow transition-all active:scale-95"
        >
          🌸 Vui vẻ (Hoa nở)
        </button>
        <button
          onClick={() => sendControl('custom', 'mood:sad')}
          className="rounded-lg bg-blue-700 hover:bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all active:scale-95"
        >
          🌧️ Buồn bã (Mưa phùn)
        </button>
        <button
          onClick={() => sendControl('custom', 'mood:none')}
          className="rounded-lg bg-slate-700 hover:bg-slate-600 px-2.5 py-1.5 text-xs font-bold text-slate-300 shadow transition-all active:scale-95"
        >
          🛑 Tắt
        </button>
      </div>

      {/* 3. CỤM NÚT ĐIỀU CHỈNH 3 MỨC ĐỘ CÂU HỎI VÀ NÚT TẢI FILE MẪU */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 p-2.5 ring-1 ring-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">🎯 Mức độ câu hỏi:</span>
          <button
            onClick={() => sendControl('custom', 'set_diff:1')}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-emerald-600 active:scale-95"
          >
            🟢 Dễ (Khởi động)
          </button>
          <button
            onClick={() => sendControl('custom', 'set_diff:2')}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-amber-500 active:scale-95"
          >
            🟡 Vừa (Tăng tốc)
          </button>
          <button
            onClick={() => sendControl('custom', 'set_diff:3')}
            className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-rose-600 active:scale-95"
          >
            🔴 Khó (Về đích)
          </button>
        </div>

        <button
          onClick={downloadSampleTemplate}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-cyan-600 active:scale-95"
        >
          📥 Tải file câu hỏi mẫu
        </button>
      </div>

      {/* Thao tác live */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => confirm(`Bỏ câu "${view?.answer}"? Câu này sẽ không bao giờ được hỏi lại.`) && sendControl('custom', 'ban')}
          disabled={!view?.answer || !!view.math || !['question', 'bonus', 'reveal'].includes(view.phase)}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40"
        >
          🚫 Bỏ câu này
        </button>
        <input
          value={bdName}
          onChange={(e) => setBdName(e.target.value)}
          placeholder="Tên bạn sinh nhật"
          className="w-48 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <Btn
          onClick={() => {
            if (bdName.trim()) sendControl('custom', `birthday:${bdName.trim()}`);
            setBdName('');
          }}
        >
          🎂 Chúc sinh nhật
        </Btn>
        <a href="/bao-cao" target="_blank" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600">
          📊 Báo cáo hôm nay
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => sendControl('custom', 'skip')}>⏭ Qua phần tiếp</Btn>
        <Btn onClick={() => sendControl('custom', 'newRound')}>🔄 Ván mới</Btn>
        <Btn onClick={() => sendControl('custom', 'goodbye')}>👋 Chào tạm biệt (xuống live)</Btn>
        <Btn onClick={() => emitTest('chat', { ...fake(Math.floor(Math.random() * 50)), comment: view?.answer.toLowerCase() ?? '' })}>✅ 1 bạn trả lời đúng</Btn>
        <Btn onClick={() => emitTest('chat', { ...fake(Math.floor(Math.random() * 50)), comment: 'vào lớp' })}>🙋 1 bạn vào lớp</Btn>
        <Btn onClick={() => emitTest('gift', { ...fake(3), giftName: 'Hoa hồng', giftId: 1, diamondCount: 1, repeatCount: 1 })}>🌹 Tặng hoa</Btn>
        <Btn onClick={() => emitTest('gift', { ...fake(4), giftName: 'Mũ', giftId: 2, diamondCount: 99, repeatCount: 1 })}>🎁 Quà to</Btn>
        <Btn onClick={() => emitTest('like', { ...fake(5), likeCount: 300 })}>❤️ 300 tim</Btn>
        <Btn onClick={() => emitTest('chat', { ...fake(Math.floor(Math.random() * 50)), comment: 'hôm nay sinh nhật con cô ơi' })}>🎂 Thử: 1 bạn báo sinh nhật</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:rps')}>✊ Ra chơi: oẳn tù tì</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:callup')}>📢 Ra chơi: kiểm tra miệng</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:pick')}>⚖️ Ra chơi: chọn phe</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:roll')}>🙋 Ra chơi: điểm danh</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:heart')}>❤️ Ra chơi: thả tim</Btn>
        <Btn onClick={() => sendControl('custom', 'recess:dance')}>💃 Ra chơi: nhảy múa thả tim</Btn>
        {(() => {
          const why = !view
            ? 'chưa mở trang stage'
            : !view.seats.length
              ? 'lớp chưa có bạn nào ngồi'
              : view.phase === 'show' || view.phase === 'team' || (view.phase === 'recess' && view.recess?.game === 'dance')
                ? 'đang game lớn / chọn tổ / nhảy múa'
                : view.escort
                  ? 'thầy đang đưa 1 bạn ra'
                  : '';
          return (
            <span className="flex items-center gap-1">
              <Btn disabled={!!why} onClick={() => sendControl('custom', 'escort')}>
                👮 Thử: giám thị đưa bạn im lâu nhất ra
              </Btn>
              {why && <span className="text-xs text-amber-300">({why})</span>}
            </span>
          );
        })()}
        <Btn onClick={() => emitTest('like', { ...fake(6), likeCount: 15 })}>❤️ 15 tim</Btn>
        <Btn onClick={() => sendControl('custom', 'show:everest')}>🏔️ Game: Đường lên đỉnh Everest</Btn>
        <Btn onClick={() => sendControl('custom', 'show:chuong')}>🔔 Game: Rung Chuông Đồng</Btn>
        <Btn onClick={() => Array.from({ length: 10 }, (_, i) => emitTest('chat', { ...fake(i), comment: view?.show?.step === 'stake' ? ['10', '20'][i % 2] : 'ABCD'[Math.floor(Math.random() * 4)] }))}>
          🎲 Thử game: 10 bạn gõ A/B/C/D
        </Btn>
        <Btn onClick={() => flood(100)} disabled={running}>👥 100 người cùng đoán</Btn>
        <Btn onClick={() => flood(1000)} disabled={running}>👥 1000 người cùng đoán</Btn>
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-40">
      {children}
    </button>
  );
}