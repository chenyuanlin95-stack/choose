import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { AnimalAvatar } from '../lib/avatars'
import { configured, supabase } from '../lib/supabase'

import type {
  Answer,
  Player as PlayerType,
  Question,
  Room,
} from '../types'

type RoomGameState = Room & {
  used_question_ids?: string[] | null
  round_player_ids?: string[] | null
}

const normalizeQuestion = (
  value: unknown
): Question => {
  const raw = value as Question & {
    options?: unknown[]
  }

  const normalized = Array.isArray(raw.options)
    ? raw.options.map((option, index) => {
        if (typeof option === 'string') {
          return {
            id:
              index === 0
                ? 'A'
                : index === 1
                  ? 'B'
                  : String(index + 1),
            label: option,
          }
        }

        if (
          option &&
          typeof option === 'object'
        ) {
          const object =
            option as {
              id?: unknown
              label?: unknown
            }

          return {
            id:
              typeof object.id === 'string'
                ? object.id
                : index === 0
                  ? 'A'
                  : index === 1
                    ? 'B'
                    : String(index + 1),
            label:
              typeof object.label === 'string'
                ? object.label
                : '',
          }
        }

        return {
          id: String(index + 1),
          label: '',
        }
      })
    : []

  return {
    ...raw,
    options: normalized,
  } as Question
}

export default function Player() {
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState('');
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const { code = '' } =
    useParams()

  const [name, setName] =
    useState('')

  const [me, setMe] =
    useState<PlayerType | null>(
      null
    )

  const [room, setRoom] =
    useState<Room | null>(
      null
    )

  const [
    players,
    setPlayers,
  ] =
    useState<PlayerType[]>(
      []
    )

  const [
    question,
    setQuestion,
  ] =
    useState<Question | null>(
      null
    )

  const [
    answers,
    setAnswers,
  ] =
    useState<Answer[]>([])

  const [
    comment,
    setComment,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => { setSelected(null); setComment(''); }, [room?.current_question_id]);

  const storageKey =
    `erxuanyi_player_${code}`

  const myAnswer =
    useMemo(() => {
      if (!me) {
        return undefined
      }

      return answers.find(
        answer =>
          answer.player_id ===
          me.id && answer.question_id === room?.current_question_id
      )
    }, [
      answers,
      me,
      room?.current_question_id,
    ])

  const joined =
    Boolean(
      me &&
      room
    )

  const currentRoundPlayerIds =
    (
      room as
        | RoomGameState
        | null
    )?.round_player_ids ??
    []

  const isCurrentRoundPlayer =
    Boolean(
      me &&
      currentRoundPlayerIds.includes(
        me.id
      )
    )

  const currentRoundPlayers =
    players.filter(
      player =>
        currentRoundPlayerIds.includes(
          player.id
        )
    )

  const currentRoundAnswers =
    answers.filter(
      answer =>
        answer.question_id === room?.current_question_id && currentRoundPlayerIds.includes(
          answer.player_id
        )
    )

  const refresh = async (
    roomId: string,
    player?: PlayerType
  ) => {
    const {
      data: roomData,
      error:
        roomError,
    } = await supabase
      .from('rooms')
      .select('*')
      .eq(
        'id',
        roomId
      )
      .maybeSingle()

    if (roomError) { setError('暂时无法连接房间，请刷新重试'); setLoading(false); return; }
    if (!roomData) {
      localStorage.removeItem(
        storageKey
      )

      setRoom(null)
      setMe(null)
      setPlayers([])
      setAnswers([])
      setQuestion(null)
      setLoading(false)

      return
    }

    const nextRoom =
      roomData as Room

    setRoom(
      nextRoom
    )

    const {
      data:
        playerData,
    } = await supabase
      .from('players')
      .select('*')
      .eq(
        'room_id',
        roomId
      )
      .order(
        'joined_at'
      )

    const nextPlayers =
      (
        playerData ??
        []
      ) as PlayerType[]

    setPlayers(
      nextPlayers
    )

    if (player) {
      const stillExists =
        nextPlayers.some(
          item =>
            item.id ===
            player.id
        )

      if (
        stillExists
      ) {
        setMe(
          player
        )
      } else {
        localStorage.removeItem(
          storageKey
        )

        setMe(null)
      }
    }

    if (
      nextRoom.current_question_id
    ) {
      const {
        data:
          questionData,
      } = await supabase
        .from(
          'questions'
        )
        .select('*')
        .eq(
          'id',
          nextRoom.current_question_id
        )
        .maybeSingle()

      setQuestion(
        questionData
          ? normalizeQuestion(
              questionData
            )
          : null
      )

      const {
        data:
          answerData,
      } = await supabase
        .from('answers')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .eq(
          'question_id',
          nextRoom.current_question_id
        )
        .order(
          'created_at'
        )

      setAnswers(
        (
          answerData ??
          []
        ) as Answer[]
      )
    } else {
      setQuestion(null)
      setAnswers([])
    }

    setLoading(false)
  }

  useEffect(() => {
    const saved =
      localStorage.getItem(
        storageKey
      )

    if (!saved) {
      setLoading(false)
      return
    }

    try {
      const player =
        JSON.parse(
          saved
        ) as PlayerType

      void refresh(
        player.room_id,
        player
      )
    } catch {
      localStorage.removeItem(
        storageKey
      )

      setLoading(false)
    }
  }, [code])

  useEffect(() => {
    if (!room) {
      return
    }

    const roomId =
      room.id

    const poll = setInterval(() => { void refresh(roomId, me ?? undefined); }, 3000);
    const channel =
      supabase
        .channel(
          `player-live-${roomId}`
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema:
              'public',
            table:
              'rooms',
            filter:
              `id=eq.${roomId}`,
          },
          () => {
            void refresh(
              roomId,
              me ??
                undefined
            )
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema:
              'public',
            table:
              'players',
            filter:
              `room_id=eq.${roomId}`,
          },
          () => {
            void refresh(
              roomId,
              me ??
                undefined
            )
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema:
              'public',
            table:
              'answers',
            filter:
              `room_id=eq.${roomId}`,
          },
          () => {
            void refresh(
              roomId,
              me ??
                undefined
            )
          }
        )

        .subscribe()

    return () => {
      clearInterval(poll);
      void supabase.removeChannel(
        channel
      )
    }
  }, [
    room?.id,
    room?.current_question_id,
    me?.id,
  ])

  const join =
    async () => {
      const cleanName =
        name.trim()

      if (!cleanName) {
        return
      }

      if (
        Array.from(
          cleanName
        ).length >
        4
      ) {
        setError(
          '名字最多 4 个字'
        )
        return
      }

      if (actionLock.current) return;
      actionLock.current = true; setBusy(true);
      try {
      setError('')

      const {
        data: roomData,
        error:
          roomError,
      } = await supabase
        .from('rooms')
        .select('*')
        .eq(
          'code',
          code
        )
        .maybeSingle()

      if (
        roomError ||
        !roomData
      ) {
        setError(
          '房间不存在'
        )
        return
      }

      const targetRoom =
        roomData as Room

      if (
        targetRoom.phase ===
        'ended'
      ) {
        setError(
          '这个房间已经结束'
        )
        return
      }

      const {
        data:
          existingPlayers,
      } = await supabase
        .from('players')
        .select(
          'avatar'
        )
        .eq(
          'room_id',
          targetRoom.id
        )

      if (
        (
          existingPlayers
            ?.length ??
          0
        ) >= 20
      ) {
        setError(
          '房间已经满员'
        )
        return
      }

      const usedAvatars =
        new Set(
          (
            existingPlayers ??
            []
          ).map(
            player =>
              player.avatar
          )
        )

      const freeAvatars =
        Array.from(
          {
            length: 20,
          },
          (
            _,
            index
          ) =>
            index
        ).filter(
          index =>
            !usedAvatars.has(
              index
            )
        )

      if (
        !freeAvatars.length
      ) {
        setError(
          '暂时没有可用头像'
        )
        return
      }

      const avatar =
        freeAvatars[
          Math.floor(
            Math.random() *
              freeAvatars.length
          )
        ]

      const {
        data:
          playerData,
        error:
          playerError,
      } = await supabase
        .from('players')
        .insert({
          room_id:
            targetRoom.id,
          name:
            cleanName,
          avatar,
        })
        .select('*')
        .single()

      if (
        playerError ||
        !playerData
      ) {
        setError(
          playerError
            ?.message ??
            '加入房间失败'
        )
        return
      }

      const newPlayer =
        playerData as PlayerType

      localStorage.setItem(
        storageKey,
        JSON.stringify(
          newPlayer
        )
      )

      setMe(
        newPlayer
      )

      setRoom(
        targetRoom
      )

      await refresh(
        targetRoom.id,
        newPlayer
      )
      } finally { actionLock.current = false; setBusy(false); }
    }

  const submit =
    async (
      choice:
        | 'A'
        | 'B'
    ) => {
      if (
        !room ||
        !question ||
        !me ||
        myAnswer ||
        room.phase !==
          'answering'
      ) {
        return
      }

      const allowedIds =
        (
          room as
            RoomGameState
        )
          .round_player_ids ??
        []

      if (
        !allowedIds.includes(
          me.id
        )
      ) {
        setError(
          '你从下一题开始参与'
        )
        return
      }

      if (actionLock.current) return;
      actionLock.current = true; setBusy(true);
      try {
      setError('')

      const {
        error:
          answerError,
      } = await supabase
        .from('answers')
        .insert({
          room_id:
            room.id,
          question_id:
            question.id,
          player_id:
            me.id,
          choice,
          comment:
            comment.trim() ||
            null,
        })

      if (
        answerError
      ) {
        if (
          answerError.code ===
          '23505'
        ) {
          await refresh(
            room.id,
            me
          )

          return
        }

        setError(
          answerError.message
        )
        return
      }

      setComment('')

      await refresh(
        room.id,
        me
      )
      } finally { actionLock.current = false; setBusy(false); }
    }

  if (loading) return <Shell><div className="wait-pill">正在恢复你的房间…</div></Shell>;
  if (!joined || !me) return <Shell>
    <div className="join-intro"><span className="eyebrow">今晚，你站哪边？</span><h1 className="brand">二选一<span>✦</span></h1><p>好问题，更好的人。</p></div>
    <section className="white-card join-card"><h2>加入房间</h2><p className="card-subtitle">选一个答案，认识另一面的朋友。</p>
      <label>房间号<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={code || inputCode} readOnly={Boolean(code)} placeholder="输入 4 位房间号" onChange={e=>setInputCode(e.target.value.replace(/\D/g,''))}/></label>
      {code && <label>你的名字 <small>最多 4 个字</small><input autoComplete="nickname" placeholder="大家怎么称呼你？" value={name} onChange={e=>setName(Array.from(e.target.value).slice(0,4).join(''))}/></label>}
      <button className="primary" disabled={busy || (code ? !name.trim() || !configured : inputCode.length !== 4)} onClick={()=>code ? void join() : navigate('/join/'+inputCode)}>{busy?'正在加入…':code?'加入房间 →':'下一步 →'}</button>
      {!configured && code && <p className="error">暂未连接游戏服务，请联系房主。</p>}{error && <p role="alert" className="error">{error}</p>}
    </section><div className="mascot-row" aria-hidden="true">{[0,1,6].map((a,i)=><AnimalAvatar key={a} index={a} size={i===1?100:78}/>)}</div><a className="host-link" href="/host">我是房主，打开主控台 ↗</a>
  </Shell>;
  if (!room) return null;
  const header=<Header code={code} round={room.round ? '第 '+room.round+' 题' : '等待开局'}/>;
  if (room.phase==='ended') return <Shell>{header}<div className="player-welcome"><AnimalAvatar index={me.avatar} size={112}/><h1>下次再站队！</h1><p>本场游戏已结束，感谢每一个选择。</p><a className="primary" href="/join">加入其他房间</a></div></Shell>;
  if (room.phase==='lobby' || room.phase==='ready') return <Shell>{header}
    <div className="lobby-heading"><span className="eyebrow">欢迎来到二选一</span><h1>房间号 <strong>{room.code}</strong></h1><p>{players.length} / 20 位朋友已加入</p></div>
    <div className="my-identity"><AnimalAvatar index={me.avatar} size={76}/><div><small>你的专属头像</small><strong>{me.name}<em>我</em></strong></div></div>
    <PlayerGrid players={players}/><div className="wait-pill"><span className="live-dot"/>{room.phase==='lobby'?'等待房主开启游戏…':'房主正在挑选第一题…'}<small>朋友到齐，好戏开场。</small></div>
  </Shell>;
  if (!question || question.id !== room.current_question_id) return <Shell>{header}<div className="wait-pill">正在加载题目…</div></Shell>;
  if (room.phase==='answering' && !isCurrentRoundPlayer) return <Shell>{header}<div className="player-welcome"><AnimalAvatar index={me.avatar} size={128}/><strong>{me.name}</strong><h1>来得正好！</h1></div><div className="wait-pill">本题已经开始<small>你将从下一题开始参与</small></div></Shell>;
  if (room.phase==='answering' && !myAnswer) return <Shell>{header}<section className="question-card"><div className="must">二选一 · 必须选一个</div><h2>{question.prompt}</h2>
    <div className="choice-options">{(['A','B'] as const).map((side,i)=><button key={side} aria-pressed={selected===side} className={'option '+side.toLowerCase()+(selected===side?' selected':'')} disabled={busy} onClick={()=>setSelected(side)}><span className="option-letter">{side}</span><span>{question.options[i]?.label}</span><span className="choice-check">{selected===side?'✓':'○'}</span></button>)}</div>
    <label className="comment-label">我有话说 <span>（可选吐槽）</span><textarea disabled={busy} value={comment} onChange={e=>setComment(e.target.value)} placeholder="为什么站这边？说说你的理由…" maxLength={80}/><small>{comment.length} / 80</small></label>
    <button className={'primary submit-choice '+(selected?.toLowerCase()||'')} disabled={!selected || busy} onClick={()=>selected && void submit(selected)}>{busy?'正在提交…':selected?'确认选 '+selected+' →':'先选一边吧'}</button><p className="submit-hint">每题只能提交一次，提交后不能修改</p>{error && <p className="error" role="alert">{error}</p>}
  </section></Shell>;
  if (room.phase==='answering' && myAnswer) return <Shell>{header}<h1 className="count">{currentRoundAnswers.length}<span> / {currentRoundPlayerIds.length}</span></h1><Floaters players={currentRoundPlayers}/><div className="wait-pill">你已选择 <b className={'my-choice '+myAnswer.choice?.toLowerCase()}>{myAnswer.choice}</b><small>等待其他玩家…<br/>本轮所有人选择后自动揭晓</small></div></Shell>;
  const sidePlayers=(side:string)=>currentRoundAnswers.filter(a=>a.choice===side).map(a=>players.find(p=>p.id===a.player_id)).filter((p):p is PlayerType=>Boolean(p));
  const comments=currentRoundAnswers.filter(a=>a.comment?.trim());
  return <Shell>{header}<h1 className="reveal-title">揭晓！<span>看看谁和你站在一起</span></h1><section className="reveal-question"><h2>{question.prompt}</h2><div className="reveal-options">{question.options.slice(0,2).map((o,i)=><p key={o.id} className={i?'b':'a'}><b>{i?'B':'A'}</b>{o.label}</p>)}</div></section>
    <div className="reveal-board">{(['A','B'] as const).map(side=><Side key={side} side={side} players={sidePlayers(side)} pct={Math.round(currentRoundAnswers.filter(a=>a.choice===side).length/(currentRoundAnswers.length||1)*100)+'%'} meId={me.id}/>)}</div>
    <AnimatePresence>{comments.slice(0,20).map((a,i)=><motion.div key={a.id || a.player_id} className="flying-comment" style={{top:100+(i%4)*48}} initial={{x:'100vw',opacity:0}} animate={{x:'-120vw',opacity:[0,1,1,0]}} transition={{duration:9,delay:i*.8}}><AnimalAvatar index={players.find(p=>p.id===a.player_id)?.avatar} size={28}/>{a.comment}</motion.div>)}</AnimatePresence>
    <section className="discussion"><h3>大家有话说 <small>{comments.length} 条</small></h3>{!comments.length && <p className="muted">这一题，大家选择用行动表态。</p>}{comments.map(a=>{const p=players.find(p=>p.id===a.player_id);return <div className="comment-row" key={a.id || a.player_id}><AnimalAvatar index={p?.avatar} size={32}/><div><b>{p?.name || '玩家'}<em className={a.choice?.toLowerCase()}>选 {a.choice}</em></b><p>{a.comment}</p></div></div>})}</section><div className="wait-pill">等待房主进入下一题…</div>
  </Shell>;
}
function PlayerGrid({players}:{players:PlayerType[]}){return <div className="avatar-grid">{players.map(p=><div key={p.id}><AnimalAvatar index={p.avatar}/><span>{p.name}</span></div>)}</div>}
export function Shell({children}:{children:React.ReactNode}){return <main className="star-bg phone-page"><div className="confetti" aria-hidden="true">{Array.from({length:16},(_,i)=><i key={i} style={{left:(i*37%97)+'%',top:(i*19%96)+'%',rotate:(i*43)+'deg',background:['#ff7eae','#75dfff','#ffd378','#a89aff'][i%4]}}/>)}</div><div className="phone-shell">{children}</div></main>}
function Header({code,round}:{code:string;round:string}){return <header className="player-head"><span className="mini-brand">二选一</span><span>{round}</span><span className="room-tag">#{code}</span></header>}
function Floaters({players}:{players:PlayerType[]}){return <div className="float-zone">{players.map((p,i)=><motion.div key={p.id} className="floater" animate={{y:[0,i%2?7:-7,0]}} transition={{duration:3+i*.12,repeat:Infinity}}><AnimalAvatar index={p.avatar} size={48}/><span>{p.name}</span></motion.div>)}</div>}
export function Side({side,pct,players,meId}:{side:'A'|'B';pct:string;players:PlayerType[];meId?:string}){return <section className={'reveal-side '+side.toLowerCase()}><header><b>{side}</b><strong>{pct}</strong><span>{players.length} 人</span></header><div className="side-roster">{players.map((p,i)=><motion.div key={p.id} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*.035}} className={p.id===meId?'is-me':''}><AnimalAvatar index={p.avatar} size={32}/><span>{p.name}</span></motion.div>)}</div>{!players.length&&<p className="empty-side">这边暂时无人站队</p>}</section>}


