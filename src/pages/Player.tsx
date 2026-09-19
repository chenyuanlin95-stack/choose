import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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

export default function Player() {
  const { code = '' } = useParams()

  const [name, setName] = useState('')
  const [me, setMe] = useState<PlayerType | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<PlayerType[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const storageKey =
    `erxuanyi_player_${code}`

  const myAnswer = useMemo(() => {
    if (!me) return undefined

    return answers.find(
      answer =>
        answer.player_id === me.id
    )
  }, [answers, me])

  const joined =
    Boolean(me && room)

  const currentRoundPlayerIds =
    (
      room as
        | RoomGameState
        | null
    )?.round_player_ids ?? []

  const isCurrentRoundPlayer =
    Boolean(
      me &&
      currentRoundPlayerIds.includes(
        me.id
      )
    )

  const currentRoundPlayers =
    players.filter(player =>
      currentRoundPlayerIds.includes(
        player.id
      )
    )

  const currentRoundAnswers =
    answers.filter(answer =>
      currentRoundPlayerIds.includes(
        answer.player_id
      )
    )

  const refresh = async (
    roomId: string,
    player?: PlayerType
  ) => {
    const {
      data: roomData,
      error: roomError,
    } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()

    if (
      roomError ||
      !roomData
    ) {
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

    setRoom(nextRoom)

    const { data: playerData } =
      await supabase
        .from('players')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .order('joined_at')

    const nextPlayers =
      (playerData ??
        []) as PlayerType[]

    setPlayers(nextPlayers)

    if (player) {
      const stillExists =
        nextPlayers.some(
          item =>
            item.id ===
            player.id
        )

      if (stillExists) {
        setMe(player)
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
        data: questionData,
      } = await supabase
        .from('questions')
        .select('*')
        .eq(
          'id',
          nextRoom.current_question_id
        )
        .maybeSingle()

      setQuestion(
        questionData
          ? (questionData as Question)
          : null
      )

      const {
        data: answerData,
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
        .order('created_at')

      setAnswers(
        (answerData ??
          []) as Answer[]
      )
    } else {
      setQuestion(null)
      setAnswers([])
    }

    setLoading(false)
  }

  /*
   * 恢复玩家身份
   */
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

  /*
   * Realtime
   */
  useEffect(() => {
    if (!room) return

    const roomId =
      room.id

    const channel = supabase
      .channel(
        `player-live-${roomId}`
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter:
            `id=eq.${roomId}`,
        },
        () => {
          void refresh(
            roomId,
            me ?? undefined
          )
        }
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter:
            `room_id=eq.${roomId}`,
        },
        () => {
          void refresh(
            roomId,
            me ?? undefined
          )
        }
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answers',
          filter:
            `room_id=eq.${roomId}`,
        },
        () => {
          void refresh(
            roomId,
            me ?? undefined
          )
        }
      )

      .subscribe()

    return () => {
      void supabase.removeChannel(
        channel
      )
    }
  }, [
    room?.id,
    room?.current_question_id,
    me?.id,
  ])

  /*
   * 加入房间
   * 现在游戏开始后也允许加入。
   */
  const join = async () => {
    const cleanName =
      name.trim()

    if (!cleanName) return

    setError('')

    const {
      data: roomData,
      error: roomError,
    } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
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
      .select('avatar')
      .eq(
        'room_id',
        targetRoom.id
      )

    if (
      (
        existingPlayers
          ?.length ?? 0
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
        (_, index) =>
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
      data: playerData,
      error: playerError,
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

    setMe(newPlayer)
    setRoom(targetRoom)

    await refresh(
      targetRoom.id,
      newPlayer
    )
  }

  /*
   * 提交答案
   */
  const submit = async (
    choice: 'A' | 'B'
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
        room as RoomGameState
      ).round_player_ids ??
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

    if (answerError) {
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
  }

  if (loading) {
    return (
      <Shell>
        <div className="wait-pill">
          正在进入房间…
        </div>
      </Shell>
    )
  }

  /*
   * 加入页
   */
  if (
    !joined ||
    !me
  ) {
    return (
      <Shell>
        <div className="brand small">
          二选一
        </div>

        <section className="white-card">
          <h2>
            加入房间
          </h2>

          <label>
            房间号

            <input
              value={code}
              readOnly
            />
          </label>

          <label>
            你的名字

            <input
              placeholder="输入昵称"
              value={name}
              onChange={
                event =>
                  setName(
                    event
                      .target
                      .value
                  )
              }
              maxLength={12}
            />
          </label>

          <button
            className="primary"
            disabled={
              !name.trim() ||
              !configured
            }
            onClick={() => {
              void join()
            }}
          >
            加入房间
          </button>

          {error && (
            <p className="error">
              {error}
            </p>
          )}
        </section>
      </Shell>
    )
  }

  if (!room) {
    return null
  }

  /*
   * 已结束
   */
  if (
    room.phase ===
    'ended'
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round="已结束"
        />

        <section className="white-card">
          <h2>
            本场游戏已结束
          </h2>

          <p>
            感谢参与 ✨
          </p>
        </section>
      </Shell>
    )
  }

  /*
   * 大厅
   */
  if (
    room.phase ===
    'lobby'
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round="等待开局"
        />

        <div className="player-welcome">
          <h2>
            欢迎加入！
          </h2>

          <p>
            这是你的专属头像
          </p>

          <AnimalAvatar
            index={me.avatar}
            size={118}
          />

          <strong>
            {me.name}
          </strong>
        </div>

        <PlayerGrid
          players={
            players
          }
        />

        <div className="wait-pill">
          等待房主开始…
        </div>
      </Shell>
    )
  }

  /*
   * 已开启但还没发题
   */
  if (
    room.phase ===
      'ready' ||
    !question
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round="游戏已开启"
        />

        <PlayerGrid
          players={
            players
          }
        />

        <div className="wait-pill">
          房主正在选择第一题…
        </div>
      </Shell>
    )
  }

  /*
   * 中途加入：
   * 当前题不参与。
   */
  if (
    room.phase ===
      'answering' &&
    !isCurrentRoundPlayer
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round={
            `第 ${room.round} 题`
          }
        />

        <div className="player-welcome">
          <h2>
            欢迎加入！
          </h2>

          <AnimalAvatar
            index={me.avatar}
            size={100}
          />

          <strong>
            {me.name}
          </strong>
        </div>

        <div className="wait-pill">
          本题已经开始

          <br />

          <small>
            你将从下一题开始参与 ✨
          </small>
        </div>
      </Shell>
    )
  }

  /*
   * 答题
   */
  if (
    room.phase ===
      'answering' &&
    !myAnswer
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round={
            `第 ${room.round} 题`
          }
        />

        <section className="question-card">
          <div className="must">
            必须选一个
          </div>

          <h2>
            {question.prompt}
          </h2>

          <button
            className="option a"
            onClick={() => {
              void submit('A')
            }}
          >
            {
              question
                .options[0]
                ?.label
            }
          </button>

          <b className="vs">
            VS
          </b>

          <button
            className="option b"
            onClick={() => {
              void submit('B')
            }}
          >
            {
              question
                .options[1]
                ?.label
            }
          </button>

          <label className="comment-label">
            💬 我有话说
            <span>
              （可选）
            </span>

            <textarea
              value={comment}
              onChange={
                event =>
                  setComment(
                    event
                      .target
                      .value
                  )
              }
              placeholder="补一句条件、吐槽或者嘴硬…"
              maxLength={80}
            />

            <small>
              {comment.length}
              /80
            </small>
          </label>

          {error && (
            <p className="error">
              {error}
            </p>
          )}
        </section>
      </Shell>
    )
  }

  /*
   * 已答，等待本轮玩家
   */
  if (
    room.phase ===
      'answering' &&
    myAnswer
  ) {
    return (
      <Shell>
        <Header
          code={code}
          round={
            `第 ${room.round} 题`
          }
        />

        <h1 className="count">
          {
            currentRoundAnswers
              .length
          }{' '}
          /{' '}
          {
            currentRoundPlayers
              .length
          }
        </h1>

        <Floaters
          players={
            currentRoundPlayers
          }
        />

        <div className="wait-pill">
          你已选择{' '}
          {myAnswer.choice}

          <br />

          <small>
            等待其他玩家…
            <br />
            本轮所有人选择后自动揭晓
          </small>
        </div>
      </Shell>
    )
  }

  /*
   * 揭晓
   */
  const aPlayers =
    currentRoundAnswers
      .filter(
        answer =>
          answer.choice ===
          'A'
      )
      .map(answer =>
        players.find(
          player =>
            player.id ===
            answer.player_id
        )
      )
      .filter(
        (
          player
        ): player is PlayerType =>
          Boolean(player)
      )

  const bPlayers =
    currentRoundAnswers
      .filter(
        answer =>
          answer.choice ===
          'B'
      )
      .map(answer =>
        players.find(
          player =>
            player.id ===
            answer.player_id
        )
      )
      .filter(
        (
          player
        ): player is PlayerType =>
          Boolean(player)
      )

  const total =
    currentRoundAnswers
      .length || 1

  const comments =
    currentRoundAnswers.filter(
      answer =>
        answer.comment &&
        answer.comment.trim()
    )

  return (
    <Shell>
      <Header
        code={code}
        round={
          `第 ${room.round} 题`
        }
      />

      <h1 className="reveal-title">
        揭晓！
      </h1>

      <div className="reveal-board">
        <Side
          side="A"
          pct={`${Math.round(
            (
              aPlayers
                .length /
              total
            ) * 100
          )}%`}
          players={
            aPlayers
          }
        />

        <Side
          side="B"
          pct={`${Math.round(
            (
              bPlayers
                .length /
              total
            ) * 100
          )}%`}
          players={
            bPlayers
          }
        />
      </div>

      <AnimatePresence>
        {comments.map(
          (
            answer,
            index
          ) => {
            const player =
              players.find(
                item =>
                  item.id ===
                  answer
                    .player_id
              )

            return (
              <motion.div
                key={
                  answer.id
                }
                className="flying-comment"
                style={{
                  top:
                    80 +
                    (
                      index %
                      5
                    ) *
                      42,
                }}
                initial={{
                  x: '100vw',
                  opacity: 0,
                }}
                animate={{
                  x: '-110vw',
                  opacity: [
                    0,
                    1,
                    1,
                    0,
                  ],
                }}
                transition={{
                  duration: 6,
                  delay:
                    index *
                    0.45,
                }}
              >
                <AnimalAvatar
                  index={
                    player
                      ?.avatar ??
                    0
                  }
                  size={34}
                />

                {
                  answer.comment
                }
              </motion.div>
            )
          }
        )}
      </AnimatePresence>

      <section className="discussion">
        <h3>
          大家有话说
        </h3>

        {comments.length ===
          0 && (
          <p className="muted">
            这一题大家都很安静 👀
          </p>
        )}

        {comments.map(
          answer => {
            const player =
              players.find(
                item =>
                  item.id ===
                  answer
                    .player_id
              )

            return (
              <p
                key={
                  answer.id
                }
              >
                <AnimalAvatar
                  index={
                    player
                      ?.avatar ??
                    0
                  }
                  size={30}
                />

                <b>
                  {
                    player
                      ?.name ??
                    '玩家'
                  }
                  ：
                </b>

                {
                  answer.comment
                }
              </p>
            )
          }
        )}
      </section>

      <div className="wait-pill">
        等待房主进入下一题…
      </div>
    </Shell>
  )
}

function PlayerGrid({
  players,
}: {
  players: PlayerType[]
}) {
  return (
    <div className="avatar-grid">
      {players.map(
        player => (
          <div
            key={
              player.id
            }
          >
            <AnimalAvatar
              index={
                player.avatar
              }
            />

            <span>
              {
                player.name
              }
            </span>
          </div>
        )
      )}
    </div>
  )
}

function Shell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="star-bg phone-page">
      <div className="phone-shell">
        {children}
      </div>
    </main>
  )
}

function Header({
  code,
  round,
}: {
  code: string
  round: string
}) {
  return (
    <header className="player-head">
      <span className="mini-brand">
        二选一
      </span>

      <span>
        {round}
      </span>

      <span>
        #{code}
      </span>
    </header>
  )
}

function Floaters({
  players,
}: {
  players: PlayerType[]
}) {
  return (
    <div className="float-zone">
      {players.map(
        (
          player,
          index
        ) => (
          <motion.div
            key={
              player.id
            }
            className="floater"
            style={{
              left: `${
                12 +
                (
                  index *
                  23
                ) %
                  72
              }%`,
              top: `${
                12 +
                (
                  index *
                  31
                ) %
                  70
              }%`,
            }}
            animate={{
              x: [
                0,
                index %
                  2
                  ? 12
                  : -10,
                0,
              ],
              y: [
                0,
                index %
                  3
                  ? 8
                  : -12,
                0,
              ],
            }}
            transition={{
              duration:
                3 +
                index *
                  0.25,
              repeat:
                Infinity,
              ease:
                'easeInOut',
            }}
          >
            <AnimalAvatar
              index={
                player.avatar
              }
              size={48}
            />

            <span>
              {
                player.name
              }
            </span>
          </motion.div>
        )
      )}
    </div>
  )
}

function Side({
  side,
  pct,
  players,
}: {
  side: 'A' | 'B'
  pct: string
  players: PlayerType[]
}) {
  return (
    <div
      className={
        `reveal-side ${side.toLowerCase()}`
      }
    >
      <h2>
        {side}

        <strong>
          {pct}
        </strong>
      </h2>

      {players.map(
        (
          player,
          index
        ) => (
          <motion.div
            className="side-player"
            key={
              player.id
            }
            initial={{
              x:
                side ===
                'A'
                  ? 120
                  : -120,
              y: -80,
              opacity: 0,
            }}
            animate={{
              x: 0,
              y: 0,
              opacity: 1,
            }}
            transition={{
              delay:
                index *
                0.12,
              type:
                'spring',
            }}
          >
            <AnimalAvatar
              index={
                player.avatar
              }
              size={36}
            />

            <span>
              {
                player.name
              }
            </span>
          </motion.div>
        )
      )}
    </div>
  )
}
