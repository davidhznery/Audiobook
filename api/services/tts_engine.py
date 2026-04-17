import json
import os
import requests
import asyncio
from faster_whisper import WhisperModel
import tempfile

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
    # Hacemos una llamada REST directa basados en el curl del prompt.
    # Dado que es TTS, en versiones de preview se envía el texto para que retorne audio/mp3 o base64.
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={GEMINI_API_KEY}"
    
    # En la documentación oficial, para retornar audio, el output format suele configurarse en las instrucciones,
    # y el modelo asincrónico devuelve base64 inline_data. 
    # **NOTA:** Si el endpoint text-to-speech dedicado no está expuesto vía REST tradicional, 
    # utilizaremos un mock de fallback local si falla para que el desarrollo Fluya.
    
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"Read the following text out loud with a clear, natural English accent. Output purely audio. Text: {text}"
                    }
                ]
            }
        ]
    }
    
    headers = {
        "Content-Type": "application/json"
    }

    print("Requesting Audio from Gemini API...")
    audio_b64 = None
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if 'candidates' in data and len(data['candidates']) > 0:
            parts = data['candidates'][0]['content']['parts']
            for part in parts:
                if 'inlineData' in part and part['inlineData']['mimeType'].startswith('audio'):
                    audio_b64 = part['inlineData']['data']
                    break
        
        if not audio_b64:
           raise ValueError("No audio payload returned from Gemini.")
           
        import base64
        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_audio:
            tmp_audio.write(audio_bytes)
            tmp_path = tmp_audio.name

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
    
    word_mapping = []
    for segment in segments:
        for word_obj in segment.words:
            word_clean = word_obj.word.strip()
            word_mapping.append({
                "word": word_clean,
                "start": float(word_obj.start),
                "end": float(word_obj.end)
            })

    os.unlink(tmp_path)

    return {
        "audio_base64": audio_b64,
        "timestamps": word_mapping
    }
