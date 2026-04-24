import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import './App.css'

// Usar variable de entorno inyectada por Render o localhost para desarrollo
const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
// ─── helpers ───────────────────────────────────────────────────────
function loadVocab() {
  try { return JSON.parse(localStorage.getItem('linguaread_vocab') || '[]') }
  catch { return [] }
}
function saveVocab(v) { localStorage.setItem('linguaread_vocab', JSON.stringify(v)) }

function getSentenceForWord(word, text) {
  if (!text) return ''
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  const found = sentences.find(s => {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return re.test(s)
  })
  return (found || '').trim()
}

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
function App() {
  const [view, setView] = useState('reader')           // reader | vocab | exercises
  const [vocab, setVocab] = useState(loadVocab)

  // Reader state lifted to persist across view changes
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const [timestamps, setTimestamps] = useState([])

  // Chapter management state
  const [chapters, setChapters] = useState([])
  const [activeChapterId, setActiveChapterId] = useState(null)

  const updateVocab = useCallback((fn) => {
    setVocab(prev => { const next = fn(prev); saveVocab(next); return next })
  }, [])

  const loadChapter = (chapter) => {
    setActiveChapterId(chapter.id)
    setText(chapter.text)
    setAudioUrl(chapter.audioUrl)
    setTimestamps(chapter.timestamps)
    if (view !== 'reader') setView('reader')
  }

  const clearChapters = () => {
    if (window.confirm("Are you sure you want to clear all chapters?")) {
      setChapters([])
      setActiveChapterId(null)
      setText('')
      setAudioUrl(null)
      setTimestamps([])
    }
  }

  return (
    <div className="app-shell">
      {/* ─── HEADER ─── */}
      <header className="app-header">
        <div className="app-logo">
          <span className="logo-icon">📖</span>
          <h1>LinguaRead</h1>
        </div>
        <nav className="nav-tabs">
          {[
            { id: 'reader', icon: '📄', label: 'Reader' },
            { id: 'vocab', icon: '💾', label: 'Vocabulary', badge: vocab.length },
            { id: 'exercises', icon: '🧠', label: 'Exercises' },
          ].map(t => (
            <button
              key={t.id}
              id={`nav-${t.id}`}
              className={`nav-tab ${view === t.id ? 'active' : ''}`}
              onClick={() => setView(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
              {t.badge > 0 && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      {/* ─── MAIN LAYOUT WITH SIDEBAR ─── */}
      <div className="app-layout">
        <aside className="app-sidebar">
          <div className="sidebar-header">
            <h3>📖 My Book</h3>
            <span className="chapter-count">{chapters.length} chapters</span>
          </div>
          
          <div className="chapter-list">
            {chapters.length === 0 ? (
              <div className="empty-chapters">
                No chapters yet. Add text and generate audio to create one!
              </div>
            ) : (
              chapters.map((ch, idx) => (
                <button 
                  key={ch.id}
                  className={`chapter-btn ${activeChapterId === ch.id ? 'active' : ''}`}
                  onClick={() => loadChapter(ch)}
                >
                  <span className="chapter-icon">📚</span>
                  <div className="chapter-info">
                    <span className="chapter-title">{ch.title}</span>
                    <span className="chapter-preview">{ch.text.substring(0, 30)}...</span>
                  </div>
                </button>
              ))
            )}
          </div>
          
          {chapters.length > 0 && (
            <div className="sidebar-footer">
              <button className="btn btn-danger" style={{ width: '100%' }} onClick={clearChapters}>
                🗑️ Clear All
              </button>
            </div>
          )}
        </aside>

        <main className="main-content" key={view}>
          {view === 'reader' && (
            <ReaderView 
              vocab={vocab} 
              updateVocab={updateVocab} 
              text={text}
              setText={setText}
              audioUrl={audioUrl}
              setAudioUrl={setAudioUrl}
              timestamps={timestamps}
              setTimestamps={setTimestamps}
              chapters={chapters}
              setChapters={setChapters}
              setActiveChapterId={setActiveChapterId}
              activeChapterId={activeChapterId}
            />
          )}
          {view === 'vocab' && <VocabView vocab={vocab} updateVocab={updateVocab} />}
          {view === 'exercises' && <ExercisesView vocab={vocab} updateVocab={updateVocab} />}
        </main>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// READER VIEW
// ═══════════════════════════════════════════════════════════════════
function ReaderView({ vocab, updateVocab, text, setText, audioUrl, setAudioUrl, timestamps, setTimestamps, chapters, setChapters, setActiveChapterId, activeChapterId }) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)
  const [tooltip, setTooltip] = useState(null) // { idx, word }
  const [dragOver, setDragOver] = useState(false)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  // ─── PDF Upload ───
  const handlePdfUpload = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(`${API}/api/upload-pdf`, formData)
      setText(res.data.text)
    } catch (err) {
      console.error(err)
      alert(err.response?.data?.detail || 'Error processing PDF')
    }
    setUploading(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handlePdfUpload(file)
  }

  // ─── Karaoke Generation ───
  const handleGenerate = async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('text', text)
      const res = await axios.post(`${API}/api/generate-karaoke`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const { audio_base64, timestamps: ts } = res.data
      const byteArr = Uint8Array.from(atob(audio_base64), c => c.charCodeAt(0))
      const blob = new Blob([byteArr], { type: 'audio/mp3' })
      const blobUrl = URL.createObjectURL(blob)
      setAudioUrl(blobUrl)
      setTimestamps(ts)
      setCurrentWordIdx(-1)
      
      // Create new chapter
      const newChapterId = Date.now().toString()
      const newChapter = {
        id: newChapterId,
        title: `Chapter ${chapters.length + 1}`,
        text: text,
        audioUrl: blobUrl,
        timestamps: ts
      }
      setChapters(prev => [...prev, newChapter])
      setActiveChapterId(newChapterId)
    } catch (err) {
      console.error(err)
      alert('Error generating audio. Check backend.')
    }
    setLoading(false)
  }

  // ─── Sync loop ───
  useEffect(() => {
    let raf
    const tick = () => {
      if (audioRef.current && timestamps.length) {
        const t = audioRef.current.currentTime
        let idx = -1
        for (let i = 0; i < timestamps.length; i++) {
          if (t >= timestamps[i].start && t <= timestamps[i].end) { idx = i; break }
        }
        setCurrentWordIdx(idx)
      }
      raf = requestAnimationFrame(tick)
    }
    if (audioUrl) raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audioUrl, timestamps])

  // ─── Word click ───
  const handleWordClick = async (idx, word) => {
    if (tooltip?.idx === idx) {
      setTooltip(null)
      return
    }
    setTooltip({ idx, word, loading: true })
    try {
      const sentence = getSentenceForWord(word, text)
      const formData = new FormData()
      formData.append('word', word)
      formData.append('context', sentence)
      const res = await axios.post(`${API}/api/translate`, formData)
      setTooltip({ idx, word, loading: false, translation: res.data.translation, meaning: res.data.meaning })
    } catch (e) {
      console.error(e)
      setTooltip({ idx, word, loading: false, translation: 'Error', meaning: 'Error fetching translation' })
    }
  }

  const handleSaveWord = (word, tooltipData) => {
    const exists = vocab.some(v => v.word.toLowerCase() === word.toLowerCase())
    if (exists) { setTooltip(null); return }
    const sentence = getSentenceForWord(word, text)
    updateVocab(prev => [...prev, {
      word,
      sentence,
      context: sentence,
      translation: tooltipData?.translation || '',
      meaning: tooltipData?.meaning || '',
      dateAdded: new Date().toISOString(),
      status: 'new',
      correctCount: 0
    }])
    setTooltip(null)
  }

  const isWordSaved = (word) => vocab.some(v => v.word.toLowerCase() === word.toLowerCase())

  return (
    <>
      {/* Upload */}
      <div className="upload-section">
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="upload-icon">📎</span>
          <p className="upload-text">
            <strong>Drop a PDF here</strong> or click to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => handlePdfUpload(e.target.files[0])}
          />
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar"><div className="progress-fill" /></div>
            </div>
          )}
        </div>
      </div>

      {/* Text + Generate */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">📝 Text to Read</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {text.length > 0 ? `${text.split(/\s+/).filter(Boolean).length} words` : ''}
          </span>
        </div>
        <textarea
          className="text-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Upload a PDF above or paste your English text here..."
        />
        <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          {text && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setText(''); setAudioUrl(null); setTimestamps([]) }}>
              Clear
            </button>
          )}
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !text.trim()}>
            {loading ? <><span className="spinner" /> Generating...</> : '🎧 Generate Audio'}
          </button>
        </div>
      </div>

      {/* Karaoke */}
      {audioUrl && (
        <div className="glass-card" style={{ animation: 'slideUp 0.5s var(--ease)' }}>
          <div className="card-header">
            <span className="card-title">🎵 Karaoke Player</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Click any word to save it</span>
          </div>

          <div className="audio-controls">
            <audio ref={audioRef} controls src={audioUrl} style={{ flex: 1 }} />
            <select
              className="speed-select"
              defaultValue="1"
              onChange={(e) => { if (audioRef.current) audioRef.current.playbackRate = parseFloat(e.target.value) }}
            >
              <option value="0.5">0.5×</option>
              <option value="0.75">0.75×</option>
              <option value="1">1.0×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.5×</option>
            </select>
          </div>

          <div className="karaoke-display" onClick={(e) => { if (e.target.classList.contains('karaoke-display')) setTooltip(null) }}>
            {timestamps.map((item, i) => (
              <span
                key={i}
                className={`karaoke-word ${currentWordIdx === i ? 'active' : ''} ${isWordSaved(item.word) ? 'saved' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleWordClick(i, item.word) }}
                style={{ position: 'relative' }}
              >
                {item.word}
                {tooltip?.idx === i && (
                  <div className="word-tooltip" onClick={(e) => e.stopPropagation()}>
                    <div className="tooltip-word">{item.word}</div>
                    {tooltip.loading ? (
                      <div style={{fontSize: 12, color: 'var(--text-muted)', marginBottom: 8}}>Translating...</div>
                    ) : (
                      <div className="tooltip-translation" style={{marginBottom: 12}}>
                        <div style={{fontWeight: 'bold', color: 'var(--text-primary)', fontSize: 15}}>{tooltip.translation}</div>
                        <div style={{fontSize: 12, color: 'var(--text-secondary)', marginTop: 4}}>{tooltip.meaning}</div>
                      </div>
                    )}
                    <div className="tooltip-actions">
                      {isWordSaved(item.word)
                        ? <button className="btn btn-sm btn-success" disabled>✓ Saved</button>
                        : <button className="btn btn-sm btn-primary" onClick={() => handleSaveWord(item.word, tooltip)}>💾 Save</button>
                      }
                      <button className="btn btn-sm btn-secondary" onClick={() => setTooltip(null)}>✕</button>
                    </div>
                  </div>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// VOCABULARY VIEW
// ═══════════════════════════════════════════════════════════════════
function VocabView({ vocab, updateVocab }) {
  const [search, setSearch] = useState('')

  const filtered = vocab.filter(v => v.word.toLowerCase().includes(search.toLowerCase()))
  const counts = { new: 0, learning: 0, mastered: 0 }
  vocab.forEach(v => { counts[v.status] = (counts[v.status] || 0) + 1 })

  const deleteWord = (word) => updateVocab(prev => prev.filter(v => v.word !== word))
  const cycleStatus = (word) => {
    const order = ['new', 'learning', 'mastered']
    updateVocab(prev => prev.map(v => {
      if (v.word !== word) return v
      const next = order[(order.indexOf(v.status) + 1) % order.length]
      return { ...v, status: next }
    }))
  }

  if (vocab.length === 0) {
    return (
      <div className="glass-card">
        <div className="empty-state">
          <span className="empty-icon">📚</span>
          <h3>No words saved yet</h3>
          <p>Go to the Reader tab, generate audio, and click on any word to save it to your vocabulary.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="vocab-header">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="vocab-search"
            placeholder="Search words..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="vocab-stats">
          <span className="stat-chip new">🆕 {counts.new} New</span>
          <span className="stat-chip learning">📖 {counts.learning} Learning</span>
          <span className="stat-chip mastered">✅ {counts.mastered} Mastered</span>
        </div>
      </div>

      <div className="vocab-grid">
        {filtered.map((v, i) => (
          <div key={v.word + i} className="vocab-card">
            <div className="word-header">
              <span className="word-text">{v.word}</span>
              <button className="delete-btn" title="Delete" onClick={() => deleteWord(v.word)}>🗑️</button>
            </div>
            {v.context && <p className="word-context">"{v.context}"</p>}
            <div className="word-meta">
              <button
                className={`status-badge ${v.status}`}
                onClick={() => cycleStatus(v.word)}
                title="Click to change status"
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {v.status}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(v.dateAdded).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// EXERCISES VIEW
// ═══════════════════════════════════════════════════════════════════
function ExercisesView({ vocab, updateVocab }) {
  const [mode, setMode] = useState('flashcard')  // flashcard | fillblank | quiz

  const learnable = vocab.filter(v => v.status !== 'mastered')

  if (vocab.length < 2) {
    return (
      <div className="glass-card">
        <div className="empty-state">
          <span className="empty-icon">🧠</span>
          <h3>Need more words!</h3>
          <p>Save at least 2 words from the Reader to start practicing. You have {vocab.length} so far.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="exercise-modes">
        {[
          { id: 'flashcard', icon: '🃏', label: 'Flashcards' },
          { id: 'fillblank', icon: '✏️', label: 'Fill the Blank' },
          { id: 'quiz', icon: '❓', label: 'Quiz' },
        ].map(m => (
          <button
            key={m.id}
            className={`mode-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <span className="mode-icon">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="glass-card">
        {mode === 'flashcard' && <FlashcardExercise words={learnable.length > 0 ? learnable : vocab} updateVocab={updateVocab} />}
        {mode === 'fillblank' && <FillBlankExercise words={learnable.length > 0 ? learnable : vocab} vocab={vocab} updateVocab={updateVocab} />}
        {mode === 'quiz' && <QuizExercise words={learnable.length > 0 ? learnable : vocab} vocab={vocab} updateVocab={updateVocab} />}
      </div>
    </>
  )
}

// ─── FLASHCARD ───
function FlashcardExercise({ words, updateVocab }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const shuffled = useRef(shuffle(words))

  useEffect(() => { shuffled.current = shuffle(words); setIdx(0); setFlipped(false) }, [words.length])

  const current = shuffled.current[idx % shuffled.current.length]
  if (!current) return null

  const next = () => { setIdx(i => i + 1); setFlipped(false) }
  const prev = () => { setIdx(i => Math.max(0, i - 1)); setFlipped(false) }

  const markLearning = () => {
    updateVocab(all => all.map(v => v.word === current.word ? { ...v, status: 'learning' } : v))
    next()
  }
  const markMastered = () => {
    updateVocab(all => all.map(v => v.word === current.word ? { ...v, status: 'mastered', correctCount: v.correctCount + 1 } : v))
    next()
  }

  return (
    <>
      <div className="exercise-progress">
        <div className="exercise-progress-bar">
          <div className="exercise-progress-fill" style={{ width: `${((idx % shuffled.current.length) + 1) / shuffled.current.length * 100}%` }} />
        </div>
        <span className="exercise-progress-text">{(idx % shuffled.current.length) + 1} / {shuffled.current.length}</span>
      </div>

      <div className="flashcard-container">
        <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
          <div className="flashcard-face flashcard-front">
            <div className="flashcard-word">{current.word}</div>
            <div className="flashcard-hint">Tap to reveal context</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="flashcard-context">Context from your reading:</div>
            <div className="flashcard-sentence">{current.sentence || current.context || 'No context available'}</div>
          </div>
        </div>
      </div>

      <div className="flashcard-nav">
        <button className="btn btn-secondary btn-sm" onClick={prev} disabled={idx === 0}>← Prev</button>
        <button className="btn btn-sm btn-danger" onClick={markLearning} style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)' }}>Still Learning</button>
        <button className="btn btn-sm btn-success" onClick={markMastered}>✓ Mastered</button>
        <button className="btn btn-secondary btn-sm" onClick={next}>Next →</button>
      </div>
    </>
  )
}

// ─── FILL IN THE BLANK ───
function FillBlankExercise({ words, vocab, updateVocab }) {
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState(null) // 'correct' | 'incorrect'
  const shuffled = useRef(shuffle(words))

  useEffect(() => { shuffled.current = shuffle(words); setIdx(0) }, [words.length])

  const current = shuffled.current[idx % shuffled.current.length]
  if (!current) return null

  const sentence = current.sentence || current.context || `The word is ${current.word}.`
  const blanked = sentence.replace(new RegExp(`\\b${current.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '____')

  const check = () => {
    if (input.trim().toLowerCase() === current.word.toLowerCase()) {
      setFeedback('correct')
      updateVocab(all => all.map(v => v.word === current.word ? { ...v, correctCount: v.correctCount + 1, status: v.correctCount >= 2 ? 'mastered' : 'learning' } : v))
      setTimeout(() => { setIdx(i => i + 1); setInput(''); setFeedback(null) }, 1200)
    } else {
      setFeedback('incorrect')
      setTimeout(() => setFeedback(null), 1500)
    }
  }

  return (
    <>
      <div className="exercise-progress">
        <div className="exercise-progress-bar">
          <div className="exercise-progress-fill" style={{ width: `${((idx % shuffled.current.length) + 1) / shuffled.current.length * 100}%` }} />
        </div>
        <span className="exercise-progress-text">{(idx % shuffled.current.length) + 1} / {shuffled.current.length}</span>
      </div>

      <div className="fill-blank-card">
        <div className="fill-sentence">
          {blanked.split('____').map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && <span className="blank-slot">{feedback === 'correct' ? current.word : '?'}</span>}
            </span>
          ))}
        </div>

        <div className="fill-input-row">
          <input
            className={`fill-input ${feedback || ''}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
            placeholder="Type the word..."
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={check}>Check</button>
        </div>

        {feedback && (
          <div className={`exercise-feedback ${feedback}`}>
            {feedback === 'correct' ? '✅ Correct!' : `❌ Try again! Hint: starts with "${current.word[0]}"`}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setIdx(i => i + 1); setInput(''); setFeedback(null) }}>
            Skip →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── QUIZ ───
function QuizExercise({ words, vocab, updateVocab }) {
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const shuffled = useRef(shuffle(words))
  const [options, setOptions] = useState([])

  useEffect(() => { shuffled.current = shuffle(words); setIdx(0) }, [words.length])

  useEffect(() => {
    const current = shuffled.current[idx % shuffled.current.length]
    if (!current) return
    const wrong = shuffle(vocab.filter(v => v.word !== current.word)).slice(0, 3).map(v => v.word)
    setOptions(shuffle([current.word, ...wrong]))
    setSelected(null)
    setFeedback(null)
  }, [idx, vocab])

  const current = shuffled.current[idx % shuffled.current.length]
  if (!current) return null

  const sentence = current.sentence || current.context || `This word means ${current.word}.`
  const blanked = sentence.replace(new RegExp(`\\b${current.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '______')

  const handleChoice = (opt) => {
    if (selected) return
    setSelected(opt)
    if (opt.toLowerCase() === current.word.toLowerCase()) {
      setFeedback('correct')
      updateVocab(all => all.map(v => v.word === current.word ? { ...v, correctCount: v.correctCount + 1, status: v.correctCount >= 2 ? 'mastered' : 'learning' } : v))
      setTimeout(() => setIdx(i => i + 1), 1200)
    } else {
      setFeedback('incorrect')
      setTimeout(() => { setIdx(i => i + 1) }, 2000)
    }
  }

  return (
    <>
      <div className="exercise-progress">
        <div className="exercise-progress-bar">
          <div className="exercise-progress-fill" style={{ width: `${((idx % shuffled.current.length) + 1) / shuffled.current.length * 100}%` }} />
        </div>
        <span className="exercise-progress-text">{(idx % shuffled.current.length) + 1} / {shuffled.current.length}</span>
      </div>

      <div className="quiz-question">Which word fits in the blank?</div>
      <div className="quiz-sentence">{blanked}</div>

      <div className="quiz-options">
        {options.map((opt, i) => {
          let cls = 'quiz-option'
          if (selected) {
            if (opt.toLowerCase() === current.word.toLowerCase()) cls += ' correct'
            else if (opt === selected) cls += ' incorrect'
          }
          return (
            <button key={i} className={cls} onClick={() => handleChoice(opt)} disabled={!!selected}>
              {opt}
            </button>
          )
        })}
      </div>

      {feedback && (
        <div className={`exercise-feedback ${feedback}`}>
          {feedback === 'correct' ? '🎉 Correct!' : `❌ The answer was "${current.word}"`}
        </div>
      )}
    </>
  )
}

export default App
