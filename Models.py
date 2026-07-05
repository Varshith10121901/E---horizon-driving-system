from __future__ import annotations

import datetime as dt

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class NotificationRow(Base):
    """Persisted disaster-zone hit, one row per (article, matched place)."""

    __tablename__ = "notifications"
    # One article can legitimately match >1 place (e.g. a cyclone story
    # mentioning both Puri and Balasore) - uniqueness is per (url, place)
    # pair, not per url alone.
    __table_args__ = (UniqueConstraint("source_url", "place", name="uq_source_place"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    place = Column(String(128), index=True, nullable=False)
    district = Column(String(128), nullable=False)
    state = Column(String(128), index=True, nullable=False)
    disaster_tags = Column(String(256), nullable=False)  # "Flood; Seismic"
    headline = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source_url = Column(String(1024), nullable=False)
    source_feed = Column(String(256), nullable=True)
    published_at = Column(DateTime, nullable=True)
    detected_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)


class NotificationOut(BaseModel):
    id: int
    place: str
    district: str
    state: str
    disaster_tags: str
    headline: str
    summary: str | None
    source_url: str
    source_feed: str | None
    published_at: dt.datetime | None
    detected_at: dt.datetime

    class Config:
        from_attributes = True


class ScanResult(BaseModel):
    articles_scanned: int
    new_notifications: int
    duplicates_skipped: int