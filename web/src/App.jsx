import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [text, setText] = useState("Hello world. The AI is learning how to speak using Gemini Flash! This is a test for the audiobook application.")
  const [audioUrl, setAudioUrl] = useState(null)
  const [timestamps, setTimestamps] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)
  
  const audioRef = useRef(null)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('text', text)
      
      const res = await axios.post('http://127.0.0.1:8000/api/generate-karaoke', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      const { audio_base64, timestamps } = res.data
      
      // Convert base64 to Blob URL
      const byteCharacters = atob(audio_base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], {type: 'audio/mp3'})
      const blobUrl = URL.createObjectURL(blob)
      
      setAudioUrl(blobUrl)
      setTimestamps(timestamps)
      setCurrentWordIdx(-1)
      
    } catch (err) {
      console.error(err)
      alert("Error generating TTS. Check backend console.")
    }
    setLoading(false)
  }

  // Animation Loop for Synchronization
  useEffect(() => {
    let animationFrameId;
    
    const updateProgress = () => {
      if (!audioRef.current || timestamps.length === 0) return;
      
      const currentTime = audioRef.current.currentTime;
      
      // Find the active word based on timestamp
      let activeIdx = -1;
      for (let i = 0; i < timestamps.length; i++) {
        const item = timestamps[i];
        if (currentTime >= item.start && currentTime <= item.end) {
          activeIdx = i;
          break;
        }
      }
      
      setCurrentWordIdx(activeIdx);
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    if (audioUrl) {
      animationFrameId = requestAnimationFrame(updateProgress);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [audioUrl, timestamps]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>📖 Interactive Audio Reader PoC</h2>
      <p style={{ color: '#555' }}>Using Gemini Flash 3.1 TTS + Whisper Timestamps</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea 
          rows="6" 
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        <button 
          onClick={handleGenerate} 
          disabled={loading}
          style={{ padding: '12px', fontSize: '16px', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          {loading ? "Generating Audio (Gemini -> Whisper)..." : "Generate Karaoke Audio"}
        </button>
      </div>

      {audioUrl && (
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px' }}>
          {/* Audio Player Controls */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <audio ref={audioRef} controls src={audioUrl} style={{ width: '100%' }} />
            
            <select 
              onChange={(e) => { if(audioRef.current) audioRef.current.playbackRate = parseFloat(e.target.value) }}
              style={{ padding: '10px', borderRadius: '8px' }}
              defaultValue="1"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>

          {/* Karaoke Text Area */}
          <div style={{ fontSize: '24px', lineHeight: '1.6', padding: '20px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: 'white' }}>
            {timestamps.map((item, i) => (
              <span 
                key={i} 
                className={currentWordIdx === i ? "highlight" : ""}
                style={{ 
                  marginRight: '8px', 
                  backgroundColor: currentWordIdx === i ? '#ffd54f' : 'transparent',
                  transition: 'background-color 0.1s',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'inline-block'
                }}
              >
                {item.word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
