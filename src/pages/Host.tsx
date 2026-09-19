import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Home,
  Library,
  Settings,
  Palette,
  Plus,
  Play,
  Shuffle,
  X,
  Search,
} from 'lucide-react'

import { AnimalAvatar } from '../lib/avatars'
import { demoQuestions } from '../lib/demo'
import { configured, supabase } from '../lib/supabase'

import type {
  Answer,
  Player,
  Question,
  QuestionType,
  Room,
} from '../types'

const ROOM_KEY = 'erxuanyi_host_room'

type Tab = 'room' | 'bank' | 'game'

type QuestionDraft = {
  id?: string
  type: QuestionType
  prompt: string
  category: string
  options: string[]
}

const emptyDraft = (): QuestionDraft => ({
  type: 'binary',
  prompt: '',
  category: '未分类',
  options: ['', ''],
})

export default function Host() {
  const [tab, setTab] = useState<Tab>('room')
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [qs, setQs] = useState<Question[]>(demoQuestions)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [error, setError] = useState('')

  const roomRef = useRef<Room | null>(null)

  useEffect(() => {
    roomRef.current = room
  }, [room])

  const resetLocal = () => {
    localStorage.removeItem(ROOM_KEY)
    setRoom(null)
    setPlayers([])
    setAnswers([])
  }

  const loadRoom = async (id: string) => {
    const { data, error: loadError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (
      loadError ||
      !data ||
      (data as Room).phase === 'ended'
    ) {
      resetLocal()
      return
    }

    setRoom(data as Room)
  }

  const loadPlayers = async (id: string) => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', id)
      .order('joined_at')

    setPlayers((data ?? []) as Player[])
  }

  const loadAnswers = async (targetRoom: Room) => {
    if (!targetRoom.current_question_id) {
      setAnswers([])
      return
    }

    const { data } = await supabase
      .from('answers')
      .select('*')
      .eq('room_id', targetRoom.id)
      .eq(
        'question_id',
        targetRoom.current_question_id
      )
      .order('created_at')

    setAnswers((data ?? []) as Answer[])
  }

  const loadQuestions = async () => {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('enabled', true)
      .order('created_at')

    if (data) {
      setQs(data as Question[])
    }
  }

  useEffect(() => {
    void loadQuestions()

    const id = localStorage.getItem(ROOM_KEY)

    if (id) {
      void loadRoom(id)
    }
  }, [])

  useEffect(() => {
    if (!room) return

    localStorage.setItem(
      ROOM_KEY,
      room.id
    )

    void loadPlayers(room.id)
    void loadAnswers(room)

    const id = room.id

    const channel = supabase
      .channel(`host-${id}`)

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${id}`,
        },
        () => {
          void loadRoom(id)
        }
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${id}`,
        },
        () => {
          void loadPlayers(id)
        }
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answers',
          filter: `room_id=eq.${id}`,
        },
        () => {
          const currentRoom =
            roomRef.current

          if (currentRoom) {
            void loadAnswers(currentRoom)
          }
        }
      )

      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [
    room?.id,
    room?.current_question_id,
  ])

  /*
   * 所有玩家答完后自动揭晓
   */
  useEffect(() => {
    if (
      room?.phase === 'answering' &&
      players.length > 0 &&
      answers.length >= players.length
    ) {
      void supabase
        .from('rooms')
        .update({
          phase: 'reveal',
        })
        .eq('id', room.id)
        .eq('phase', 'answering')
        .then(() => {})
    }
  }, [
    room?.phase,
    room?.id,
    players.length,
    answers.length,
  ])

  const createRoom = async () => {
    setError('')

    if (room) return

    for (let i = 0; i < 8; i += 1) {
      const code = String(
        Math.floor(
          1000 + Math.random() * 9000
        )
      )

      const {
        data,
        error: createError,
      } = await supabase
        .from('rooms')
        .insert({
          code,
          phase: 'lobby',
          round: 0,
        })
        .select('*')
        .single()

      if (data) {
        setRoom(data as Room)
        return
      }

      if (createError?.code !== '23505') {
        setError(
          createError?.message ??
            '创建失败'
        )
        return
      }
    }

    setError(
      '没有成功生成房间号，请再试一次'
    )
  }

  const startRoom = async () => {
    if (!room) return

    setError('')

    const { error: startError } =
      await supabase
        .from('rooms')
        .update({
          phase: 'ready',
        })
        .eq('id', room.id)
        .eq('phase', 'lobby')

    if (startError) {
      setError(startError.message)
      return
    }

    await loadRoom(room.id)
    setTab('game')
  }

  const clearRoom = async () => {
    if (!room) return

    const ok = window.confirm(
      '确定清空房间吗？玩家、答案和当前游戏进度都会被清除，但房间号会保留。'
    )

    if (!ok) return

    setError('')

    const { error: answerError } =
      await supabase
        .from('answers')
        .delete()
        .eq('room_id', room.id)

    if (answerError) {
      setError(answerError.message)
      return
    }

    const { error: playerError } =
      await supabase
        .from('players')
        .delete()
        .eq('room_id', room.id)

    if (playerError) {
      setError(playerError.message)
      return
    }

    const { error: roomError } =
      await supabase
        .from('rooms')
        .update({
          phase: 'lobby',
          current_question_id: null,
          round: 0,
        })
        .eq('id', room.id)

    if (roomError) {
      setError(roomError.message)
      return
    }

    setPlayers([])
    setAnswers([])

    await loadRoom(room.id)
  }

  const endRoom = async () => {
    if (!room) return

    const ok = window.confirm(
      '确定结束这个房间吗？结束后这个房间号将不能继续使用。'
    )

    if (!ok) return

    const id = room.id

    /*
     * 先让玩家收到 ended，
     * 再清主控本地状态。
     */
    const { error: endError } =
      await supabase
        .from('rooms')
        .update({
          phase: 'ended',
        })
        .eq('id', id)

    if (endError) {
      setError(endError.message)
      return
    }

    resetLocal()
    setTab('room')
  }

  const publish = async (
    question: Question
  ) => {
    if (
      !room ||
      room.phase === 'lobby' ||
      room.phase === 'ended'
    ) {
      return
    }

    /*
     * 当前游戏 UI 暂时只完整支持 binary。
     */
    if (question.type !== 'binary') {
      setError(
        '排序题已经可以进入题库，但玩家端排序玩法还没有开放。'
      )
      return
    }

    setError('')

    const { error: publishError } =
      await supabase
        .from('rooms')
        .update({
          phase: 'answering',
          current_question_id:
            question.id,
          round: room.round + 1,
        })
        .eq('id', room.id)

    if (publishError) {
      setError(publishError.message)
      return
    }

    setAnswers([])

    await loadRoom(room.id)

    setTab('game')
  }

  const randomPublish = () => {
    const used =
      room?.current_question_id

    const candidates = qs.filter(
      question =>
        question.type === 'binary' &&
        question.id !== used
    )

    const fallback = qs.filter(
      question =>
        question.type === 'binary'
    )

    const pool =
      candidates.length
        ? candidates
        : fallback

    if (!pool.length) {
      setError(
        '题库里还没有可发布的二选一题目'
      )
      return
    }

    const question =
      pool[
        Math.floor(
          Math.random() *
            pool.length
        )
      ]

    void publish(question)
  }

  const current =
    qs.find(
      question =>
        question.id ===
        room?.current_question_id
    ) ?? null

  return (
    <main className="host-page v01">
      <aside>
        <div className="host-brand">
          二选一
        </div>

        <Nav
          active={tab === 'room'}
          onClick={() =>
            setTab('room')
          }
          icon={<Home />}
        >
          房间
        </Nav>

        <Nav
          active={tab === 'bank'}
          onClick={() =>
            setTab('bank')
          }
          icon={<Library />}
        >
          题库
        </Nav>

        <Nav
          active={tab === 'game'}
          onClick={() =>
            setTab('game')
          }
          icon={<Settings />}
        >
          游戏设置
        </Nav>

        <Nav
          active={false}
          onClick={() => {}}
          icon={<Palette />}
        >
          外观设置
        </Nav>
      </aside>

      <section className="host-content">
        {tab === 'room' && (
          <RoomPanel
            room={room}
            players={players}
            createRoom={createRoom}
            startRoom={startRoom}
            clearRoom={clearRoom}
            endRoom={endRoom}
            error={error}
          />
        )}

        {tab === 'bank' && (
          <Bank
            qs={qs}
            reload={loadQuestions}
            room={room}
            publish={publish}
          />
        )}

        {tab === 'game' && (
          <Game
            room={room}
            current={current}
            players={players}
            answers={answers}
            randomPublish={
              randomPublish
            }
            qs={qs}
            publish={publish}
            error={error}
          />
        )}
      </section>
    </main>
  )
}

function Nav({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      className={
        active ? 'active' : ''
      }
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

function RoomPanel({
  room,
  players,
  createRoom,
  startRoom,
  clearRoom,
  endRoom,
  error,
}: {
  room: Room | null
  players: Player[]
  createRoom: () => void
  startRoom: () => void
  clearRoom: () => void
  endRoom: () => void
  error: string
}) {
  if (!room) {
    return (
      <div className="host-empty">
        <h1>房间</h1>

        <div className="panel">
          <h2>还没有房间</h2>

          <p>
            主控创建房间后，玩家才能扫码加入。
          </p>

          <button
            className="primary compact"
            disabled={!configured}
            onClick={createRoom}
          >
            创建房间
          </button>

          {error && (
            <p className="error">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  const url =
    location.origin +
    '/join/' +
    room.code

  return (
    <>
      <h1>房间</h1>

      <div className="room-control">
        <div className="panel room-code">
          <span>房间已创建</span>

          <strong>
            {room.code}
          </strong>

          <QRCodeSVG
            value={url}
            size={170}
          />

          <b>扫描二维码加入游戏</b>

          <small>{url}</small>

          <div className="room-actions">
            <button
              className="danger"
              onClick={endRoom}
            >
              ⊕ 结束房间
            </button>

            <button
              onClick={clearRoom}
            >
              ▣ 清空房间
            </button>
          </div>
        </div>

        <div className="panel room-players">
          <div className="panel-title">
            <b>当前玩家</b>

            <strong>
              {players.length} / 20
            </strong>
          </div>

          {players.map(player => (
            <div
              className="room-player"
              key={player.id}
            >
              <AnimalAvatar
                index={player.avatar}
                size={34}
              />

              <span>
                {player.name}
              </span>

              <i>•••</i>
            </div>
          ))}

          {!players.length && (
            <p className="muted">
              等待玩家加入…
            </p>
          )}

          {room.phase ===
            'lobby' && (
            <button
              className="primary start-game"
              disabled={
                !players.length
              }
              onClick={startRoom}
            >
              <Play />
              开启游戏
            </button>
          )}

          {room.phase !==
            'lobby' && (
            <div className="opened">
              游戏已开启 ·{' '}
              {room.round
                ? `第 ${room.round} 题`
                : '等待发题'}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="error">
          {error}
        </p>
      )}
    </>
  )
}

function Bank({
  qs,
  reload,
  room,
  publish,
}: {
  qs: Question[]
  reload: () => void
  room: Room | null
  publish: (
    question: Question
  ) => void
}) {
  const [search, setSearch] =
    useState('')

  const [category, setCategory] =
    useState('全部')

  const [type, setType] =
    useState<'all' | QuestionType>(
      'all'
    )

  const [editorOpen, setEditorOpen] =
    useState(false)

  const [draft, setDraft] =
    useState<QuestionDraft>(
      emptyDraft()
    )

  const [saving, setSaving] =
    useState(false)

  const [editorError, setEditorError] =
    useState('')

  const categories = useMemo(
    () => [
      '全部',
      ...Array.from(
        new Set(
          qs.map(
            question =>
              question.category ||
              '未分类'
          )
        )
      ),
    ],
    [qs]
  )

  const filtered = useMemo(() => {
    const keyword =
      search.trim().toLowerCase()

    return qs.filter(question => {
      const matchesSearch =
        !keyword ||
        question.prompt
          .toLowerCase()
          .includes(keyword) ||
        question.options.some(
          option =>
            option.label
              .toLowerCase()
              .includes(keyword)
        )

      const matchesCategory =
        category === '全部' ||
        question.category ===
          category

      const matchesType =
        type === 'all' ||
        question.type === type

      return (
        matchesSearch &&
        matchesCategory &&
        matchesType
      )
    })
  }, [
    qs,
    search,
    category,
    type,
  ])

  const openAdd = () => {
    setDraft(emptyDraft())
    setEditorError('')
    setEditorOpen(true)
  }

  const openEdit = (
    question: Question
  ) => {
    setDraft({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      category:
        question.category ||
        '未分类',
      options:
        question.options.map(
          option => option.label
        ),
    })

    setEditorError('')
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (saving) return

    setEditorOpen(false)
    setEditorError('')
  }

  const saveQuestion = async () => {
    const prompt =
      draft.prompt.trim()

    const categoryValue =
      draft.category.trim() ||
      '未分类'

    const cleanOptions =
      draft.options.map(option =>
        option.trim()
      )

    if (!prompt) {
      setEditorError(
        '请输入题目内容'
      )
      return
    }

    if (
      draft.type === 'binary' &&
      (
        !cleanOptions[0] ||
        !cleanOptions[1]
      )
    ) {
      setEditorError(
        '二选一必须填写 A 和 B 两个选项'
      )
      return
    }

    if (
      draft.type === 'ranking' &&
      cleanOptions.filter(Boolean)
        .length < 2
    ) {
      setEditorError(
        '排序题至少需要两个选项'
      )
      return
    }

    setSaving(true)
    setEditorError('')

    const options =
      cleanOptions
        .filter(Boolean)
        .map((label, index) => ({
          id:
            draft.type ===
            'binary'
              ? index === 0
                ? 'A'
                : 'B'
              : String(
                  index + 1
                ),
          label,
        }))

    const payload = {
      type: draft.type,
      prompt,
      category: categoryValue,
      options,
      enabled: true,
    }

    let saveError

    if (draft.id) {
      const result =
        await supabase
          .from('questions')
          .update(payload)
          .eq('id', draft.id)

      saveError = result.error
    } else {
      const result =
        await supabase
          .from('questions')
          .insert(payload)

      saveError = result.error
    }

    setSaving(false)

    if (saveError) {
      setEditorError(
        saveError.message
      )
      return
    }

    setEditorOpen(false)

    await reload()
  }

  const remove = async (
    question: Question
  ) => {
    const ok = window.confirm(
      `确定删除「${question.prompt}」吗？`
    )

    if (!ok) return

    await supabase
      .from('questions')
      .update({
        enabled: false,
      })
      .eq('id', question.id)

    await reload()
  }

  const updateOption = (
    index: number,
    value: string
  ) => {
    setDraft(current => {
      const options = [
        ...current.options,
      ]

      options[index] = value

      return {
        ...current,
        options,
      }
    })
  }

  const addRankingOption = () => {
    setDraft(current => ({
      ...current,
      options: [
        ...current.options,
        '',
      ],
    }))
  }

  const removeRankingOption = (
    index: number
  ) => {
    setDraft(current => ({
      ...current,
      options:
        current.options.filter(
          (_, optionIndex) =>
            optionIndex !== index
        ),
    }))
  }

  return (
    <>
      <div className="bank-head">
        <div>
          <h1>题库管理</h1>

          <div className="filters">
            <select
              value={category}
              onChange={event =>
                setCategory(
                  event.target.value
                )
              }
            >
              {categories.map(item => (
                <option
                  key={item}
                  value={item}
                >
                  {item === '全部'
                    ? '全部分类'
                    : item}
                </option>
              ))}
            </select>

            <select
              value={type}
              onChange={event =>
                setType(
                  event.target
                    .value as
                    | 'all'
                    | QuestionType
                )
              }
            >
              <option value="all">
                全部题型
              </option>

              <option value="binary">
                二选一
              </option>

              <option value="ranking">
                排序题
              </option>
            </select>
          </div>
        </div>

        <button
          className="primary compact"
          onClick={openAdd}
        >
          <Plus />
          添加题目
        </button>
      </div>

      <div className="panel bank-list">
        <div className="bank-search">
          <Search />

          <input
            placeholder="搜索题目或选项…"
            value={search}
            onChange={event =>
              setSearch(
                event.target.value
              )
            }
          />
        </div>

        {filtered.map(question => (
          <div
            className="bank-row"
            key={question.id}
          >
            <div>
              <b>
                {question.prompt}
              </b>

              <small>
                <em>
                  {question.type ===
                  'binary'
                    ? '二选一'
                    : '排序题'}
                </em>

                {'　'}
                {question.category}
              </small>
            </div>

            {room &&
              room.phase !==
                'lobby' &&
              room.phase !==
                'ended' &&
              question.type ===
                'binary' && (
                <button
                  title="发布到当前游戏"
                  onClick={() =>
                    void publish(
                      question
                    )
                  }
                >
                  ⊙
                </button>
              )}

            <button
              title="编辑"
              onClick={() =>
                openEdit(question)
              }
            >
              ✎
            </button>

            <button
              title="删除"
              onClick={() =>
                void remove(
                  question
                )
              }
            >
              ⋯
            </button>
          </div>
        ))}

        {!filtered.length && (
          <div className="bank-empty">
            没有符合条件的题目
          </div>
        )}
      </div>

      {editorOpen && (
        <div
          className="question-modal-backdrop"
          onMouseDown={
            closeEditor
          }
        >
          <div
            className="question-modal"
            onMouseDown={event =>
              event.stopPropagation()
            }
          >
            <div className="question-modal-head">
              <div>
                <small>
                  题库管理
                </small>

                <h2>
                  {draft.id
                    ? '编辑题目'
                    : '添加题目'}
                </h2>
              </div>

              <button
                className="modal-close"
                onClick={
                  closeEditor
                }
              >
                <X />
              </button>
            </div>

            <label className="editor-field">
              <span>题型</span>

              <select
                value={draft.type}
                onChange={event => {
                  const nextType =
                    event.target
                      .value as QuestionType

                  setDraft(current => ({
                    ...current,
                    type: nextType,
                    options:
                      nextType ===
                      'binary'
                        ? [
                            current
                              .options[0] ??
                              '',
                            current
                              .options[1] ??
                              '',
                          ]
                        : current
                              .options
                              .length >= 2
                          ? current.options
                          : ['', ''],
                  }))
                }}
              >
                <option value="binary">
                  二选一
                </option>

                <option value="ranking">
                  排序题
                </option>
              </select>
            </label>

            <label className="editor-field">
              <span>分类</span>

              <input
                value={
                  draft.category
                }
                onChange={event =>
                  setDraft(
                    current => ({
                      ...current,
                      category:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="例如：生活 / 脑洞 / 感情"
              />
            </label>

            <label className="editor-field">
              <span>题目</span>

              <textarea
                value={draft.prompt}
                onChange={event =>
                  setDraft(
                    current => ({
                      ...current,
                      prompt:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="输入题目内容"
                maxLength={160}
              />
            </label>

            <div className="editor-options">
              <span className="editor-label">
                {draft.type ===
                'binary'
                  ? '选项'
                  : '排序项目'}
              </span>

              {draft.options.map(
                (option, index) => (
                  <div
                    className="editor-option-row"
                    key={index}
                  >
                    <b>
                      {draft.type ===
                      'binary'
                        ? index === 0
                          ? 'A'
                          : 'B'
                        : index + 1}
                    </b>

                    <input
                      value={option}
                      onChange={event =>
                        updateOption(
                          index,
                          event.target
                            .value
                        )
                      }
                      placeholder={
                        draft.type ===
                        'binary'
                          ? `选项 ${
                              index === 0
                                ? 'A'
                                : 'B'
                            }`
                          : `项目 ${
                              index + 1
                            }`
                      }
                    />

                    {draft.type ===
                      'ranking' &&
                      draft.options
                        .length >
                        2 && (
                        <button
                          onClick={() =>
                            removeRankingOption(
                              index
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                  </div>
                )
              )}

              {draft.type ===
                'ranking' && (
                <button
                  className="add-option"
                  onClick={
                    addRankingOption
                  }
                >
                  + 添加一个排序项目
                </button>
              )}
            </div>

            {draft.type ===
              'ranking' && (
              <div className="editor-hint">
                排序题现在可以保存到题库。
                联机排序玩法会在下一阶段接入。
              </div>
            )}

            {editorError && (
              <p className="error">
                {editorError}
              </p>
            )}

            <div className="question-modal-actions">
              <button
                onClick={
                  closeEditor
                }
                disabled={saving}
              >
                取消
              </button>

              <button
                className="primary"
                onClick={() =>
                  void saveQuestion()
                }
                disabled={saving}
              >
                {saving
                  ? '保存中…'
                  : '保存题目'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Game({
  room,
  current,
  players,
  answers,
  randomPublish,
  qs,
  publish,
  error,
}: {
  room: Room | null
  current: Question | null
  players: Player[]
  answers: Answer[]
  randomPublish: () => void
  qs: Question[]
  publish: (
    question: Question
  ) => void
  error: string
}) {
  const [pick, setPick] =
    useState('')

  if (!room) {
    return (
      <>
        <h1>游戏设置</h1>

        <div className="panel">
          请先创建房间。
        </div>
      </>
    )
  }

  if (room.phase === 'lobby') {
    return (
      <>
        <h1>游戏设置</h1>

        <div className="panel">
          玩家加入后，请在“房间”
          点击「开启游戏」。
        </div>
      </>
    )
  }

  if (
    room.phase === 'ready' ||
    !current
  ) {
    return (
      <>
        <h1>游戏控制</h1>

        <div className="panel game-control">
          <h2>房主已开启游戏</h2>

          <p>
            {players.length}{' '}
            名玩家正在等待第一题。
          </p>

          <div className="host-publish-row">
            <select
              value={pick}
              onChange={event =>
                setPick(
                  event.target.value
                )
              }
            >
              <option value="">
                选择题库题目…
              </option>

              {qs
                .filter(
                  question =>
                    question.type ===
                    'binary'
                )
                .map(question => (
                  <option
                    key={
                      question.id
                    }
                    value={
                      question.id
                    }
                  >
                    {question.prompt}
                  </option>
                ))}
            </select>

            <button
              disabled={!pick}
              onClick={() => {
                const question =
                  qs.find(
                    item =>
                      item.id ===
                      pick
                  )

                if (question) {
                  void publish(
                    question
                  )
                }
              }}
            >
              发布选中题
            </button>
          </div>

          <button
            className="primary compact"
            onClick={
              randomPublish
            }
          >
            <Shuffle />
            随机抽取并发布
          </button>

          {error && (
            <p className="error">
              {error}
            </p>
          )}
        </div>
      </>
    )
  }

  const a = answers.filter(
    answer =>
      answer.choice === 'A'
  ).length

  const b = answers.filter(
    answer =>
      answer.choice === 'B'
  ).length

  const total =
    answers.length || 1

  return (
    <>
      <h1>游戏控制</h1>

      <div className="panel game-control">
        <div className="game-meta">
          第 {room.round} 题
          {'　·　'}
          {room.phase ===
          'answering'
            ? '答题中'
            : '揭晓完成'}
        </div>

        <h2>
          {current.prompt}
        </h2>

        <div className="host-choice">
          <span>
            A　
            {
              current.options[0]
                ?.label
            }
          </span>

          <span>
            B　
            {
              current.options[1]
                ?.label
            }
          </span>
        </div>

        <div className="progress">
          <span>
            {answers.length} /{' '}
            {players.length}{' '}
            已选择
          </span>

          <i>
            <b
              style={{
                width: `${
                  players.length
                    ? (
                        answers.length /
                        players.length
                      ) * 100
                    : 0
                }%`,
              }}
            />
          </i>
        </div>

        {room.phase ===
          'answering' && (
          <div className="answering-note">
            等待所有玩家提交后自动揭晓
          </div>
        )}

        {room.phase ===
          'reveal' && (
          <>
            <div className="result-mini">
              <strong>
                A{' '}
                {Math.round(
                  (a / total) *
                    100
                )}
                %
              </strong>

              <strong>
                B{' '}
                {Math.round(
                  (b / total) *
                    100
                )}
                %
              </strong>
            </div>

            <div className="host-comments">
              {answers
                .filter(
                  answer =>
                    answer.comment
                )
                .map(answer => {
                  const player =
                    players.find(
                      item =>
                        item.id ===
                        answer.player_id
                    )

                  return (
                    <p
                      key={
                        answer.id
                      }
                    >
                      <AnimalAvatar
                        index={
                          player?.avatar ??
                          0
                        }
                        size={28}
                      />

                      <b>
                        {player?.name}
                      </b>

                      <span>
                        {
                          answer.comment
                        }
                      </span>
                    </p>
                  )
                })}
            </div>

            <button
              className="primary compact"
              onClick={
                randomPublish
              }
            >
              <Shuffle />
              下一题
            </button>
          </>
        )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}
      </div>
    </>
  )
}
