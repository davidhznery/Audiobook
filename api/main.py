from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import io
import uvicorn
from services.tts_engine import generate_karaoke_data
from PyPDF2 import PdfReader

app = FastAPI(title="LinguaRead API")

# Setup CORS for local React dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Extract text from an uploaded PDF file."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    try:
        contents = await file.read()
        pdf_reader = PdfReader(io.BytesIO(contents))
        
        pages = []
        full_text = []
        
        for i, page in enumerate(pdf_reader.pages):
            page_text = page.extract_text() or ""
            pages.append({
                "page_number": i + 1,
                "text": page_text.strip()
            })
            if page_text.strip():
                full_text.append(page_text.strip())
        
        combined_text = "\n\n".join(full_text)
        
        if not combined_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from this PDF. It may be scanned/image-based.")
        
        return {
            "text": combined_text,
            "pages": pages,
            "total_pages": len(pdf_reader.pages)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/api/generate-karaoke")
async def generate_karaoke(text: str = Form(...)):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        # Generate the audio and timestamps
        result = await generate_karaoke_data(text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
