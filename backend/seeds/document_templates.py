import json

from sqlalchemy.orm import Session

from models.document_template import DocumentTemplate


OFFICIAL_LETTER_DEFAULT_CUSTOM = {
    "company_header": {
        "address": "서울특별시 강남구 테헤란로 OO길 OO, O층",
        "tel": "02-0000-0000",
        "fax": "02-0000-0000",
    },
    "body_text": "{{assembly_date}}에 개최되는 {{fund_name}}의 출자금 납입 안내 및 결성총회에 필요한 서류를 첨부하여 송부 드리오니, 다음의 내용을 확인하여 주시기 바랍니다.",
    "payment_info": {
        "unit_price": "1,000,000",
        "bank_account": "(별도 안내)",
        "note": "※ 규약 제OO조 제O항에 따라 납입기한 전 입금 시 총회일에 입금한 것으로 간주합니다.",
    },
    "attachments": [
        {"no": "1", "name": "조합규약(안)", "ref": "별첨1", "stamp_required": False},
        {"no": "2", "name": "조합규약(안)_별표3. 조합원 동의서", "ref": "별표3", "stamp_required": True},
        {"no": "3", "name": "투자의사결정 심의기구 운영방안", "ref": "별첨2", "stamp_required": False},
        {"no": "4", "name": "자산보관·관리 위탁계약서", "ref": "별첨3", "stamp_required": False},
        {"no": "5", "name": "개인정보 수집·이용·제공 동의서", "ref": "별첨4", "stamp_required": True},
        {"no": "6", "name": "고객거래확인서(개인)", "ref": "별첨5", "stamp_required": True},
        {"no": "7", "name": "서면결의서", "ref": "별첨6", "stamp_required": True},
        {"no": "8", "name": "조합 외부감사 제안서", "ref": "별첨7", "stamp_required": False},
    ],
    "required_documents_text": "신분증 사본, 개인인감증명서",
    "cover_attachments": ["결성총회 소집통지서 1부", "결성총회 의안설명서 1부"],
}

ASSEMBLY_NOTICE_DEFAULT_CUSTOM = {
    "greeting": "조합원 제위의 평안과 건강을 기원합니다.",
    "regulation_article": "제15조",
    "body_text": "『{{fund_name}}』 규약 {{regulation_article}}에 따라 아래와 같이 결성총회를 개최하고자 하오니 서면결의로 의결권을 행사하여 주시기 바랍니다.",
    "agendas": [
        "제1호 안건: 조합 규약 승인의 건",
        "제2호 안건: 투자의사결정 심의기구 운영방안 승인의 건",
        "제3호 안건: 수탁회사 선정의 건",
        "제4호 안건: 개인 정보 활용을 위한 동의서 작성의 건",
        "제5호 안건: 고객 거래 확인서 작성의 건",
        "제6호 안건: 조합 외부감사인 선정의 건",
    ],
}

WRITTEN_RESOLUTION_DEFAULT_CUSTOM = {
    "introduction_text": "본인은 {{assembly_date}}에 개최되는 『{{fund_name}}』의 결성총회에 직접 출석하지 못하여 아래의 의안에 대하여 다음과 같이 서면으로 의결권을 행사합니다.",
    "agendas": [
        "제 1 호 안건 : 조합 규약 승인의 건",
        "제 2 호 안건 : 투자의사결정 심의기구 운영방안 승인의 건",
        "제 3 호 안건 : 수탁회사 선정의 건",
        "제 4 호 안건 : 개인 정보 활용을 위한 동의서 작성의 건",
        "제 5 호 안건 : 고객 거래 확인서 작성의 건",
        "제 6 호 안건 : 조합 외부감사인 선정의 건",
    ],
    "vote_note": "*의결권의 찬성, 반대란에 O 표시를 해주시기 바랍니다.",
}


DOCUMENT_TEMPLATE_SEEDS = [
    {
        "name": "공문_결성총회_출자이행통지",
        "category": "결성총회",
        "builder_name": "공문_결성총회_출자이행통지",
        "file_path": "templates/auto/공문_결성총회_출자이행통지.docx",
        "description": "결성총회 개최 및 출자이행 통지 공문",
        "variables": '["fund_name","gp_name","document_date","document_number","assembly_date"]',
        "custom_data": json.dumps(OFFICIAL_LETTER_DEFAULT_CUSTOM, ensure_ascii=False),
        "workflow_step_label": "결성총회 공문 발송",
    },
    {
        "name": "첨부1_결성총회_소집통지서",
        "category": "결성총회",
        "builder_name": "첨부1_결성총회_소집통지서",
        "file_path": "templates/auto/첨부1_결성총회_소집통지서.docx",
        "description": "결성총회 소집통지서",
        "variables": '["fund_name","gp_name","assembly_date","document_date"]',
        "custom_data": json.dumps(ASSEMBLY_NOTICE_DEFAULT_CUSTOM, ensure_ascii=False),
        "workflow_step_label": "결성총회 공문 발송",
    },
    {
        "name": "별첨6_서면결의서",
        "category": "결성총회",
        "builder_name": "별첨6_서면결의서",
        "file_path": "templates/auto/별첨6_서면결의서.docx",
        "description": "결성총회 서면결의서",
        "variables": '["fund_name","gp_name","assembly_date"]',
        "custom_data": json.dumps(WRITTEN_RESOLUTION_DEFAULT_CUSTOM, ensure_ascii=False),
        "workflow_step_label": "결성총회 공문 발송",
    },
]


def seed_document_templates(db: Session) -> list[DocumentTemplate]:
    existing = {row.name: row for row in db.query(DocumentTemplate).all()}
    created = 0
    updated = 0

    for seed in DOCUMENT_TEMPLATE_SEEDS:
        row = existing.get(seed["name"])
        if row is None:
            db.add(DocumentTemplate(**seed))
            created += 1
            continue

        changed = False
        for key, value in seed.items():
            if getattr(row, key) != value:
                setattr(row, key, value)
                changed = True
        if changed:
            updated += 1

    if created or updated:
        db.commit()
    print(f"[seed] document templates: created={created}, updated={updated}")
    return db.query(DocumentTemplate).order_by(DocumentTemplate.id.asc()).all()
