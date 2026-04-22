import json
import os
import requests
import asyncio
from faster_whisper import WhisperModel
import tempfile

from dotenv import load_dotenv
load_dotenv()

# La API Key proporcionada por el usuario
# Se recomienda usar variables de entorno para seguridad
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_API_KEY_HERE")

# Inicializar Whisper local
# Nota: 'tiny' es ultra-rápido en CPU.
print("Loading Whisper model...")
aligner_model = WhisperModel("tiny", device="cpu", compute_type="int8")

async def generate_karaoke_data(text: str):
    """
    1. Llama a Gemini para generar Audio.
    2. Usa Whisper para obtener Word Timestamps.
    """
    
    # ======= PASO 1: TTS CON GEMINI API =======
    print("Requesting Audio from Gemini API (gemini-3.1-flash-tts-preview)...")
    audio_b64 = None
    try:
        from google import genai
        from google.genai import types
        import wave
        
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        response = client.models.generate_content(
            model="gemini-3.1-flash-tts-preview",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Sulafat",
                        )
                    )
                ),
            )
        )
        
        pcm_data = response.candidates[0].content.parts[0].inline_data.data
        
        def save_wav(filename: str, pcm_data: bytes, channels=1, rate=24000, sample_width=2):
            with wave.open(filename, "wb") as wf:
                wf.setnchannels(channels)
                wf.setsampwidth(sample_width)
                wf.setframerate(rate)
                wf.writeframes(pcm_data)
                
        # Guardar en archivo temporal
        fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        
        save_wav(tmp_path, pcm_data)
        
        import base64
        with open(tmp_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    except Exception as e:
        print(f"Gemini API Exception: {e}. Activando gTTS Fallback para el Prototipo...")
        # ================= FALLBACK =================
        from gtts import gTTS
        import base64
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_audio:
            tts = gTTS(text, lang='en')
            tts.save(tmp_audio.name)
            tmp_path = tmp_audio.name
            
        with open(tmp_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")
        # ============================================

    # ======= PASO 2: FORCED ALIGNMENT CON WHISPER =======
    print("Aligning audio with Whisper...")
    segments, info = aligner_model.transcribe(tmp_path, word_timestamps=True, initial_prompt=text)
    
    whisper_words = []
    for segment in segments:
        for word_obj in segment.words:
            whisper_words.append({
                "word": word_obj.word.strip(),
                "start": float(word_obj.start),
                "end": float(word_obj.end)
            })

    os.unlink(tmp_path)
    
    # Map whisper words to original text words
    import difflib
    import re
    
    # Simple split of original text by whitespace
    original_words = text.split()
    
    def clean_word(w):
        return re.sub(r'[^a-z0-9]', '', w.lower())
        
    w_texts = [clean_word(w["word"]) for w in whisper_words]
    o_texts = [clean_word(w) for w in original_words]
    
    matcher = difflib.SequenceMatcher(None, o_texts, w_texts)
    
    final_mapping = [{"word": w, "start": None, "end": None} for w in original_words]
    
    for o_idx, w_idx, length in matcher.get_matching_blocks():
        for i in range(length):
            final_mapping[o_idx + i]["start"] = whisper_words[w_idx + i]["start"]
            final_mapping[o_idx + i]["end"] = whisper_words[w_idx + i]["end"]
            
    # Interpolate missing timestamps
    last_end = 0.0
    for item in final_mapping:
        if item["start"] is not None:
            last_end = item["end"]
        else:
            item["start"] = last_end
            item["end"] = last_end + 0.5 # Default duration for missed words
            last_end = item["end"]

    return {
        "audio_base64": audio_b64,
        "timestamps": final_mapping
    }
