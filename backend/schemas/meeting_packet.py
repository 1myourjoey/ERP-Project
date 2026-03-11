from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


PacketType = Literal[
    "fund_lp_regular_meeting_pex",
    "fund_lp_regular_meeting_project",
    "fund_lp_regular_meeting_project_with_bylaw_amendment",
    "gp_shareholders_meeting",
    "unknown",
]


class MeetingPacketAnalyzeRequest(BaseModel):
    root_path: str = Field(min_length=1)


class MeetingPacketFileItem(BaseModel):
    slot: str
    slot_label: str
    filename: str
    extension: str
    full_path: str
    generation_mode: str
    preview_text: Optional[str] = None


class MeetingPacketPackageItem(BaseModel):
    package_name: str
    folder_path: str
    packet_type: PacketType
    packet_label: str
    fund_name: Optional[str] = None
    meeting_date: Optional[str] = None
    meeting_method: Optional[str] = None
    document_number: Optional[str] = None
    recipients: list[str] = Field(default_factory=list)
    agendas: list[str] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    files: list[MeetingPacketFileItem] = Field(default_factory=list)
    missing_slots: list[str] = Field(default_factory=list)
    extra_files: list[str] = Field(default_factory=list)
    package_notes: list[str] = Field(default_factory=list)
    erp_dependencies: list[str] = Field(default_factory=list)


class MeetingPacketAnalyzeResponse(BaseModel):
    root_path: str
    package_count: int
    packet_types: dict[str, int]
    common_slots: list[str]
    varying_slots: list[str]
    packages: list[MeetingPacketPackageItem]


class MeetingPacketGenerationPlanRequest(BaseModel):
    fund_id: int = Field(ge=1)
    packet_type: PacketType
    meeting_date: Optional[date] = None
    meeting_time: Optional[str] = None
    meeting_method: Optional[str] = None
    report_year: Optional[int] = None
    include_bylaw_amendment: bool = False


class MeetingPacketGenerationSlot(BaseModel):
    slot: str
    slot_label: str
    generation_mode: str
    status: str
    recommended_layout: str
    builder_candidate: Optional[str] = None
    template_candidate: Optional[str] = None
    source_systems: list[str] = Field(default_factory=list)
    data_points: list[str] = Field(default_factory=list)
    preflight_warnings: list[str] = Field(default_factory=list)
    required_external_documents: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class MeetingPacketGenerationPlanResponse(BaseModel):
    fund_id: int
    fund_name: str
    packet_type: PacketType
    packet_label: str
    recommended_packet_type: PacketType
    recommended_packet_label: str
    packet_reasoning: list[str] = Field(default_factory=list)
    meeting_date: Optional[str] = None
    meeting_time: Optional[str] = None
    meeting_method: Optional[str] = None
    slots: list[MeetingPacketGenerationSlot]
    recipients_preview: list[str] = Field(default_factory=list)
    agenda_preview: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class MeetingPacketAgendaItemInput(BaseModel):
    id: int | None = None
    sort_order: int = 0
    kind: str = "custom"
    title: str
    short_title: str | None = None
    description: str | None = None
    requires_vote: bool = True
    source_type: str | None = None
    source_ref: str | None = None
    resolution_text: str | None = None
    vote_result: str | None = None


class MeetingPacketAgendaItemResponse(MeetingPacketAgendaItemInput):
    id: int


class MeetingPacketSlotBindingInput(BaseModel):
    slot: str
    external_document_id: int | None = None
    attachment_id: int | None = None


class MeetingPacketPrepareRequest(BaseModel):
    fund_id: int = Field(ge=1)
    assembly_id: int | None = Field(default=None, ge=1)
    packet_type: PacketType
    meeting_date: date
    meeting_time: str | None = None
    meeting_method: str | None = None
    location: str | None = None
    chair_name: str | None = None
    document_number: str | None = None
    report_year: int | None = None
    include_bylaw_amendment: bool = False


class MeetingPacketUpdateRequest(BaseModel):
    meeting_date: date | None = None
    meeting_time: str | None = None
    meeting_method: str | None = None
    location: str | None = None
    chair_name: str | None = None
    document_number: str | None = None
    report_year: int | None = None
    include_bylaw_amendment: bool | None = None
    agenda_items: list[MeetingPacketAgendaItemInput] | None = None
    external_bindings: list[MeetingPacketSlotBindingInput] | None = None


class MeetingPacketDocumentItem(BaseModel):
    id: int
    slot: str
    slot_label: str
    status: str
    source_mode: str
    layout_mode: str | None = None
    attachment_id: int | None = None
    filename: str | None = None
    download_url: str | None = None
    external_document_id: int | None = None
    external_document_name: str | None = None


class MeetingPacketDraftResponse(BaseModel):
    run_id: int
    assembly_id: int
    fund_id: int
    fund_name: str
    packet_type: PacketType
    packet_label: str
    status: str
    meeting_date: str
    meeting_time: str | None = None
    meeting_method: str | None = None
    location: str | None = None
    chair_name: str | None = None
    document_number: str | None = None
    report_year: int | None = None
    include_bylaw_amendment: bool = False
    packet_reasoning: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    recipients_preview: list[str] = Field(default_factory=list)
    slots: list[MeetingPacketGenerationSlot] = Field(default_factory=list)
    agenda_items: list[MeetingPacketAgendaItemResponse] = Field(default_factory=list)
    documents: list[MeetingPacketDocumentItem] = Field(default_factory=list)
    zip_attachment_id: int | None = None
    zip_download_url: str | None = None


class MeetingPacketGenerateRequest(BaseModel):
    selected_slots: list[str] | None = None


class MeetingPacketGenerateResponse(BaseModel):
    run_id: int
    status: str
    warnings: list[str] = Field(default_factory=list)
    missing_slots: list[str] = Field(default_factory=list)
    documents: list[MeetingPacketDocumentItem] = Field(default_factory=list)
    zip_attachment_id: int | None = None
    zip_download_url: str | None = None
