import asyncio
import sys
from services.tts_engine import generate_karaoke_data

async def main():
    try:
        res = await generate_karaoke_data("This is a test of the Gemini audio system.")
        print("SUCCESS! Audio base64 length:", len(res["audio_base64"]))
        print("Timestamps:", res["timestamps"])
    except Exception as e:
        print("Testing ERROR details:", repr(e))
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
