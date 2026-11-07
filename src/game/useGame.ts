import { useEffect, useRef, useState } from 'react';
import { useLiveEvents } from '../live/useLiveEvents';
import type { GiftEvent, LiveStatus } from '../live/types';
import { voice, speakableName } from '../live/voice';
import { containsBanned } from '../live/bannedWords';
import { NameBatcher } from '../live/scoreboard';
import { GiftThanker, OncePerPerson } from '../live/chatter';
import { IS_STAGE } from '../live/page';
import { GAME, shownTeacherName, type RoomCfg } from './config';
import { QUESTIONS, SHOW_BANK } from './bank';
import { Classroom, plain, type ClassView, type RecessGame, type Say } from './quiz';
import type { ShowKind } from './show';
import { sfx } from './sfx';

const MUTED = new URLSearchParams(window.location.search).get('mute') === '1';

export type WeekRow = { username: string; nickname: string; points: number };
export type StageView = ClassView & { weekTop: WeekRow[]; todayTop: WeekRow[]; talkTop: WeekRow[]; cfg: RoomCfg };

function dayBoard(saved: WeekRow[], pending: Map<string, { nickname: string; points: number }>): WeekRow[] {
  const all = new Map(saved.map((r) => [r.username, { ...r }]));
  for (const [username, p] of pending) {
    const cur = all.get(username) ?? { username, nickname: p.nickname, points: 0 };
    cur.points += p.points;
    cur.nickname = p.nickname || cur.nickname;
    all.set(username, cur);
  }
  return [...all.values()].sort((a, b) => b.points - a.points).slice(0, 5);
}

// Hàm gửi tín hiệu cảm xúc tự động tới màn hình Stage
function triggerAutoMood(mood: 'angry' | 'happy' | 'sad') {
  if (!IS_STAGE) return;
  fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'custom', text: `mood:${mood}` }),
  }).catch(() => {});
}

export function useGame() {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [view, setView] = useState<StageView | null>(null);
  const [lastGift, setLastGift] = useState<(GiftEvent & { at: number }) | null>(null);
  const [stageCount, setStageCount] = useState(0);
  const [channelName, setChannelName] = useState(GAME.defaultChannelName);

  const roomRef = useRef<Classroom | null>(null);
  const cfg = useRef<RoomCfg>(GAME.defaultRoom);
  const applyCfg = (room: Classroom | null) => {
    const c = cfg.current;
    const thay = c.teacher === 'thay';
    voice.teacher = thay || c.teacherVoice === 'nam' ? 'm' : 'f';
    if (!room) return;
    room.thay = thay;
    room.teacherName = shownTeacherName(c);
    room.supervisorOn = c.supervisor;
    room.supervisorIdleMs = Math.max(1, Number(c.supervisorMin) || GAME.defaultRoom.supervisorMin) * 60_000;
    room.dance = c.dance;
    room.setStandWrong(!!c.standWrong);
    room.danceSec = Math.min(120, Math.max(10, Number(c.danceSec) || GAME.defaultRoom.danceSec));
    room.showsOn = { everest: cfg.current.everest, chuong: cfg.current.chuong };
  };
  const weekTop = useRef<WeekRow[]>([]);
  const todayTop = useRef<WeekRow[]>([]);
  const talkTop = useRef<WeekRow[]>([]);
  const likeBase = useRef<number | null>(null);
  const dirty = useRef(true);

  // Lưu trạng thái trước để phát hiện học sinh bị đứng phạt hoặc câu không ai đúng
  const prevStandCount = useRef<number>(0);
  const prevPhase = useRef<string>('');

  const [talk] = useState(() => ({
    greeter: new NameBatcher(
      GAME.greetEveryMs,
      GAME.namesPerGreeting,
      (names) => roomRef.current && say([roomRef.current.greet(joinNames(names))]),
      () => chatter.current.length >= 2,
    ),
    gifts: new GiftThanker(GAME.giftThanksCooldownMs, GAME.bigGiftCoins),
    follows: new OncePerPerson(),
  }));

  const mainSpeaking = useRef(0);
  const chatter = useRef<{ text: string; priority: boolean; until: number }[]>([]);
  function say(lines: Say[]) {
    const now = Date.now();
    for (const l of lines) {
      if (l.main) {
        mainSpeaking.current++;
        const onStart = l.go
          ? () => {
              roomRef.current?.showBoard();
              dirty.current = true;
            }
          : undefined;
        const onDone = l.showAfter
          ? () => {
              mainSpeaking.current--;
              roomRef.current?.showBoard();
              dirty.current = true;
            }
          : () => mainSpeaking.current--;
        voice.say(l.text, true, onDone, false, onStart);
      } else if (l.warn) {
        voice.say(l.text, true);
      } else {
        const ttl = l.ttl ?? (l.priority ? GAME.giftLineMaxWaitMs : GAME.chatterMaxWaitMs);
        chatter.current.push({ text: l.text, priority: !!l.priority, until: now + ttl });
      }
    }
    dirty.current = true;
  }

  function flushChatter(room: Classroom, now: number) {
    chatter.current = chatter.current.filter((c) => c.until > now);
    if (voice.busy || mainSpeaking.current > 0 || !room.chatterWindow(now)) return;
    const p = chatter.current.findIndex((c) => c.priority);
    const i = p >= 0 ? p : room.chatterAllowed(false) ? 0 : -1;
    if (i < 0) return;
    const next = chatter.current.splice(i, 1)[0];
    if (!next) return;
    if (!next.priority) room.chatterUsed++;
    voice.say(next.text);
  }

  const person = (e: { nickname: string; username: string; avatar: string }) => {
    const nickname = containsBanned(e.nickname) ? e.username : e.nickname;
    return { username: e.username, nickname, spoken: speakableName(nickname), avatar: e.avatar };
  };

  useLiveEvents({
    onStatus: setStatus,
    onSpeaker: (d) => setStageCount(d.count),
    onGameState: (s) => {
      if (!IS_STAGE) setView(s as StageView);
    },
    onRoomCfg: (c) => {
      cfg.current = { ...GAME.defaultRoom, ...(c as Partial<RoomCfg>) };
      applyCfg(roomRef.current);
      dirty.current = true;
    },

    onChat: (e) => {
      const room = roomRef.current;
      if (!room) return;
      const p = person(e);
      const isNew = !room.students.has(e.username);

      // 1. Nhận câu trả lời và tính điểm game
      say(room.chat({ 
        ...p, 
        comment: e.comment, 
        createTime: e.createTime ?? e.timestamp, 
        realTime: e.createTime != null && !e.test, 
        safe: !containsBanned(e.comment) 
      }, Date.now()));

      if (isNew && p.spoken !== 'bạn' && GAME.joinKeywords.includes(plain(e.comment))) {
        talk.greeter.add(e.username, p.spoken);
      }

      // 2. Cô giáo phản hồi bình luận giao lưu
      const c = e.comment.toLowerCase().trim();
      const name = p.spoken;
      let reply = '';
      if (c.includes('chào cô') || c.includes('chào thầy') || c === 'hi cô' || c === 'hello cô') {
        reply = `Cô chào ${name} nha, mau chọn chỗ ngồi để thi đố chữ với cả lớp nào!`;
      } else if (c.includes('cô xinh') || c.includes('cô đẹp') || c.includes('dễ thương')) {
        reply = `Cảm ơn ${name} đã khen cô nhé, khen cô là cô cộng điểm liền nha!`;
      } else if (c.includes('khó quá') || c.includes('khó thế')) {
        reply = `${name} bình tĩnh đọc kỹ gợi ý chút xíu là đoán ra ngay thôi mà!`;
      } else if (c.includes('người yêu') || c.includes('có bồ chưa')) {
        reply = `Cô chỉ dành tình yêu thương cho lớp học và các bạn học sinh thôi nha ${name}!`;
      } else if (c.includes('mấy tuổi') || c.includes('bao nhiêu tuổi')) {
        reply = `Bí mật nha ${name}, tuổi của cô giáo lúc nào cũng mãi mãi tuổi đôi mươi!`;
      }
      if (reply) {
        say([{ text: reply, priority: false, ttl: 15_000 }]);
      }

      if (isNew && IS_STAGE) {
        fetch('/api/game/attend', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ username: e.username, nickname: p.nickname }) 
        })
          .then((r) => r.json())
          .then((d) => roomRef.current && say(roomRef.current.attendance(p, Number(d.days) || 0, Date.now(), d.life)))
          .catch(() => {});
      }
    },

    onGift: (e) => {
      const room = roomRef.current;
      if (!room) return;
      const p = person(e);
      const coins = e.diamondCount * e.repeatCount;
      setLastGift({ ...e, nickname: p.nickname, at: Date.now() });
      const hint = room.gift(p, coins, Date.now(), e.repeatCount, e.giftName);
      say(hint);

      // TỰ ĐỘNG HÓA 1: Tặng hoa / quà to -> Kích hoạt hoa nở vui vẻ
      if (coins >= 10 || e.giftName.toLowerCase().includes('hoa')) {
        triggerAutoMood('happy');
      }

      if (!hint.length && talk.gifts.shouldThank(e.username, coins, chatter.current.filter((c) => c.priority).length)) say([room.thank(p, e.giftName, coins)]);
    },

    onFollow: (e) => {
      const room = roomRef.current;
      if (room && talk.follows.first(e.username)) say([room.follow(person(e))]);
    },

    onLike: (e) => {
      const room = roomRef.current;
      if (!room) return;
      if (likeBase.current === null) likeBase.current = e.totalLikes - e.likeCount;
      const reached = (e.totalLikes - likeBase.current) * GAME.heartBoost >= GAME.likesPerClap;
      if (reached) {
        likeBase.current = e.totalLikes;
        // TỰ ĐỘNG HÓA 2: Đủ mốc tim cả lớp vỗ tay -> Kích hoạt hoa nở
        triggerAutoMood('happy');
      }
      say(room.like(e.likeCount, Date.now(), reached, person({ ...e, avatar: '' })));
    },

    onControl: (c) => {
      if (c.action === 'setName' && c.text) setChannelName(c.text);
      const room = roomRef.current;
      if (!room) return;
      
      if (c.action === 'speak' && c.text) voice.say(c.text, true);
      if (c.action === 'setRate' && c.text) voice.rate = Number(c.text) || 1;
      if (c.action === 'reset' || (c.action === 'custom' && c.text === 'newRound')) {
        voice.stop();
        chatter.current = [];
        say(room.newRound(Date.now()));
      }
      if (c.action === 'custom' && c.text === 'skip') say(room.skip(Date.now()));
      if (c.action === 'custom' && c.text === 'ban') say(room.banCurrent(Date.now()));
      if (c.action === 'custom' && c.text?.startsWith('birthday:')) {
        const name = c.text.slice(9).trim().slice(0, 40);
        const s = [...room.students.values()].find((x) => x.nickname.toLowerCase() === name.toLowerCase());
        if (name) say(room.celebrate(s ?? person({ username: `kenh:${name}`, nickname: name, avatar: '' }), Date.now()));
      }
      if (c.action === 'custom' && c.text === 'goodbye') say(room.goodbye(Date.now()));
      if (c.action === 'custom' && c.text === 'escort') {
        triggerAutoMood('angry');
        say(room.forceEscort(Date.now()));
      }
      if (c.action === 'custom' && c.text?.startsWith('recess:')) say(room.forceRecess(c.text.slice(7) as RecessGame, Date.now()));
      if (c.action === 'custom' && c.text?.startsWith('show:')) say(room.forceShow(c.text.slice(5) as ShowKind, Date.now()));

      // Ép chuyển độ khó
      if (c.action === 'custom' && c.text?.startsWith('set_diff:')) {
        const targetDiff = parseInt(c.text.replace('set_diff:', ''), 10);
        const r = room as any;
        
        if (r.topics && Array.isArray(r.topics)) {
          const matchIdx = r.topics.findIndex((t: any) => {
            if (t.questions && Array.isArray(t.questions)) {
              return t.questions.some((q: any) => q.diff === targetDiff || q.difficulty === targetDiff);
            }
            const name = (t.name || '').toLowerCase();
            if (targetDiff === 1) return name.includes('dễ') || name.includes('35');
            if (targetDiff === 2) return name.includes('vừa') || name.includes('36');
            if (targetDiff === 3) return name.includes('khó') || name.includes('37');
            return false;
          });

          if (matchIdx >= 0) {
            r.topicIndex = matchIdx;
          }
        }

        voice.stop();
        chatter.current = [];
        r.phase = 'team';
        dirty.current = true;
        say(room.newRound(Date.now()));
      }
    },
  });

  useEffect(() => {
    if (!IS_STAGE) return;
    if (MUTED) {
      voice.volume = 0;
      sfx.volume = 0;
    }
    sfx.loadFiles();
    let prevView: StageView | null = null;
    let stop = false;
    const timers: ReturnType<typeof setInterval>[] = [];

    const save = async () => {
      const room = roomRef.current;
      if (!room) return;
      const used = room.usedLog.splice(0);
      const week = [...room.weekDelta].map(([username, v]) => ({ username, ...v }));
      room.weekDelta.clear();
      const banned = room.banLog.splice(0);
      const report = room.reportLog.splice(0);
      const life = [...room.lifeDelta].map(([username, v]) => ({ username, ...v }));
      room.lifeDelta.clear();
      const talk = [...room.talkDelta].map(([username, v]) => ({ username, ...v }));
      room.talkDelta.clear();
      const flowers = room.flowerDelta;
      room.flowerDelta = 0;
      try {
        const r = await fetch('/api/game/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ used, week, banned, report, life, talk, flowers }) });
        const d = await r.json();
        weekTop.current = d.weekTop ?? [];
        todayTop.current = d.todayTop ?? [];
        talkTop.current = d.talkTop ?? [];
        if (typeof d.flowersToday === 'number') roomRef.current?.setFlowersSaved(d.flowersToday);
        room.weekLeader = weekTop.current[0] ? speakableName(weekTop.current[0].nickname) : '';
      } catch {
        room.usedLog.unshift(...used);
        for (const w of week) room.weekDelta.set(w.username, w);
        room.banLog.unshift(...banned);
        room.reportLog.unshift(...report);
        for (const l of life) room.lifeDelta.set(l.username, l);
        for (const w of talk) room.talkDelta.set(w.username, w);
        room.flowerDelta += flowers;
      }
    };

    (async () => {
      let used: Record<string, number> = {};
      let banned: string[] = [];
      let flowersSaved = 0;
      try {
        const d = await (await fetch('/api/game/save')).json();
        used = d.used ?? {};
        banned = d.banned ?? [];
        weekTop.current = d.weekTop ?? [];
        todayTop.current = d.todayTop ?? [];
        talkTop.current = d.talkTop ?? [];
        flowersSaved = Number(d.flowersToday) || 0;
      } catch {}

      try {
        const rc = await (await fetch('/api/room-settings')).json();
        cfg.current = { ...GAME.defaultRoom, ...rc };
      } catch {}

      if (stop) return;
      const room = new Classroom(QUESTIONS, Date.now(), Math.random, used, banned);
      room.setFlowersSaved(flowersSaved);
      room.showBank = SHOW_BANK;
      room.weekLeader = weekTop.current[0] ? speakableName(weekTop.current[0].nickname) : '';
      roomRef.current = room;
      applyCfg(room);
      say(room.newRound(Date.now()));

      let lastSent = 0;
      let lastTick = Date.now();
      timers.push(
        setInterval(() => {
          const now = Date.now();
          if (mainSpeaking.current > 0) {
            room.hold(now - lastTick);
            dirty.current = true;
          }
          lastTick = now;
          say(room.tick(now));
          flushChatter(room, now);
          sfx.clock(room.showAsking() ? 'question' : room.phase, room.boardShown, room.phaseEndsAt, now);
          const sh = room.show;
          const step = sh?.steps[sh.i]?.k;
          const busy = mainSpeaking.current > 0;
          const dancing = room.phase === 'recess' && room.recess?.game === 'dance' && room.recess.stage === 'play';
          if (dancing) sfx.music('nhay', busy ? 0 : room.phaseEndsAt - now <= 5000 ? 2 : 1);
          else sfx.music(sh?.kind ?? null, !sh || busy ? 0 : room.showAsking() ? (room.phaseEndsAt - now <= 5000 ? 2 : 1) : step === 'gather' || step === 'honor' ? 1 : 0);

          // TỰ ĐỘNG HÓA 3: Giám sát diễn biến để đổi cảm xúc
          // - Khi có bạn mới bị phạt lên bục đứng -> Sấm sét
          const curStand = (room as any).standUsers?.length ?? 0;
          if (curStand > prevStandCount.current) {
            triggerAutoMood('angry');
          }
          prevStandCount.current = curStand;

          // - Khi hết giờ chuyển sang hiện đáp án ('reveal') mà 0 ai đoán đúng -> Mưa phùn buồn bã
          if (room.phase === 'reveal' && prevPhase.current !== 'reveal') {
            const correctCount = (room as any).roundCorrect ?? 0;
            if (correctCount === 0) {
              triggerAutoMood('sad');
            }
          }
          prevPhase.current = room.phase;

          if (!dirty.current && now - lastSent < 1000) return;
          dirty.current = false;
          const v = { ...room.view(now), cfg: cfg.current, weekTop: weekTop.current, todayTop: dayBoard(todayTop.current, room.weekDelta), talkTop: dayBoard(talkTop.current, room.talkDelta) };
          sfx.watch(prevView, v);
          prevView = v;
          setView(v);
          if (now - lastSent >= 400) {
            lastSent = now;
            fetch('/api/game/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }).catch(() => {});
          }
        }, 200),
        setInterval(() => say([room.share()]), GAME.shareReminderEveryMs),
        setInterval(save, 20_000),
      );
    })();

    window.addEventListener('beforeunload', save);
    return () => {
      stop = true;
      timers.forEach(clearInterval);
      window.removeEventListener('beforeunload', save);
    };
  }, []);

  return { status, view, lastGift, stageCount, channelName };
}

export type GameState = ReturnType<typeof useGame>;

function joinNames(names: string[]) {
  const spoken = names.map((n) => `bạn ${n}`);
  return spoken.length > 1 ? `${spoken.slice(0, -1).join(', ')} và ${spoken[spoken.length - 1]}` : spoken[0] ?? '';
}