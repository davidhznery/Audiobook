from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    total_pages = Column(Integer)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    pages = relationship("Page", back_populates="book", cascade="all, delete")

class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"))
    page_number = Column(Integer)
    text_content = Column(Text)
    audio_base64 = Column(Text, nullable=True) # Cached audio
    timestamps_json = Column(Text, nullable=True) # Cached timestamps in JSON string

    book = relationship("Book", back_populates="pages")

class Vocabulary(Base):
    __tablename__ = "vocabulary"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, index=True)
    translation = Column(String)
    context = Column(Text)
    meaning = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
