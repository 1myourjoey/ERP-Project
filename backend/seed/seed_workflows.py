import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import SessionLocal, engine, Base
from models.workflow import Workflow, WorkflowStep, WorkflowDocument, WorkflowWarning


def seed_workflows():
    db = SessionLocal()

    if db.query(Workflow).count() > 0:
        print("워크플로우가 이미 존재합니다. 스킵합니다.")
        db.close()
        return

    # ===== 1. 투자심의위원회 =====
    wf1 = Workflow(
        name="투자심의위원회",
        trigger_description="투자 결정 확정 시",
        category="투자",
        total_duration="1~2주",
    )
    wf1.steps = [
        WorkflowStep(order=1, name="추가출자금 납입 통보", timing="D-7",
                     timing_offset_days=-7, estimated_time="30m", quadrant="Q1",
                     memo="납입 요청 공문 + 조합 통장사본"),
        WorkflowStep(order=2, name="투심 전 ERP 등록", timing="D-3",
                     timing_offset_days=-3, estimated_time="2h", quadrant="Q1",
                     memo="투심 보고서 + 투자계약서 + 준법감시보고서"),
        WorkflowStep(order=3, name="투심위 개최", timing="D-day",
                     timing_offset_days=0, estimated_time="2h", quadrant="Q1",
                     memo="투심위 결과보고서 + 의사록 작성"),
        WorkflowStep(order=4, name="투심위 서류 사인 받기", timing="D-day",
                     timing_offset_days=0, estimated_time="1h", quadrant="Q1",
                     memo="13:00까지"),
        WorkflowStep(order=5, name="투심 후 ERP 등록", timing="D-day",
                     timing_offset_days=0, estimated_time="1h", quadrant="Q1",
                     memo="날인된 결과보고서 + 의사록 등록"),
        WorkflowStep(order=6, name="농금원 ERP 결과보고서 등록", timing="D-day",
                     timing_offset_days=0, estimated_time="15m", quadrant="Q1",
                     memo="투심위 직후"),
        WorkflowStep(order=7, name="투심위 회의록 작성", timing="D+2",
                     timing_offset_days=2, estimated_time="2h", quadrant="Q1",
                     memo="2일 이내"),
    ]
    wf1.documents = [
        WorkflowDocument(name="납입 요청 공문", required=True),
        WorkflowDocument(name="조합 통장사본", required=True),
        WorkflowDocument(name="투심 보고서", required=True),
        WorkflowDocument(name="투자 계약서", required=True),
        WorkflowDocument(name="준법감시보고서 (3종 중 우선순위)", required=True),
        WorkflowDocument(name="투심위 결과보고서 (날인)", required=True),
        WorkflowDocument(name="투심위 의사록 (날인)", required=True),
    ]
    wf1.warnings = [
        WorkflowWarning(content="규약 확인: 출자금 통지기간 준수"),
        WorkflowWarning(content="규약 확인: ERP 등록기간 준수"),
        WorkflowWarning(content="기여율 및 밸류 입력 주의"),
    ]
    db.add(wf1)

    # ===== 2. 투자계약 체결 =====
    wf2 = Workflow(
        name="투자계약 체결",
        trigger_description="투심위 통과 후 계약일 확정 시",
        category="투자",
        total_duration="3~5일",
    )
    wf2.steps = [
        WorkflowStep(order=1, name="권리관계서류 요청", timing="D-3",
                     timing_offset_days=-3, estimated_time="30m", quadrant="Q1",
                     memo="프론트 발송 (피투자기업 바이블용)"),
        WorkflowStep(order=2, name="서류 준비", timing="D-1",
                     timing_offset_days=-1, estimated_time="1h", quadrant="Q1",
                     memo="투자계약서 3부 (천공 필수)"),
        WorkflowStep(order=3, name="투자계약 체결 및 날인", timing="D-day",
                     timing_offset_days=0, estimated_time="2h", quadrant="Q1",
                     memo="간인 + 인감 날인"),
        WorkflowStep(order=4, name="계약서 보관/등록", timing="D-day",
                     timing_offset_days=0, estimated_time="15m", quadrant="Q1",
                     memo="계약 직후"),
        WorkflowStep(order=5, name="투자계약서 날인본 ERP 업로드", timing="D-day",
                     timing_offset_days=0, estimated_time="45m", quadrant="Q1",
                     memo="3단계 프로세스: LP보고→투자관리→투자집행"),
        WorkflowStep(order=6, name="투자금 출금 확인", timing="D-day",
                     timing_offset_days=0, estimated_time="10m", quadrant="Q1",
                     memo="투자금 납입일 = 계약일"),
        WorkflowStep(order=7, name="운용지시서 작성", timing="D+1",
                     timing_offset_days=1, estimated_time="2h", quadrant="Q1",
                     memo="6종 서류 필요"),
        WorkflowStep(order=8, name="운용지시 실행", timing="D+2",
                     timing_offset_days=2, estimated_time="1h", quadrant="Q1",
                     memo="계약 후 2일 이내"),
    ]
    wf2.documents = [
        WorkflowDocument(name="투자계약서 3부 (천공 필수)", required=True),
        WorkflowDocument(name="법인인감증명서 2부 (피투자사, 이해관계자)", required=True),
        WorkflowDocument(name="사용인감계 2부", required=True),
        WorkflowDocument(name="신주식(전환사채)청약서·인수증", required=True),
        WorkflowDocument(name="운용지시서", required=True, timing="D+1"),
        WorkflowDocument(name="사업자등록증", required=True, timing="D+1"),
        WorkflowDocument(name="계약서 제1조 발췌", required=True, timing="D+1"),
        WorkflowDocument(name="의무기재사항 확인서 (준법감시인 날인)", required=True, timing="D+1"),
        WorkflowDocument(name="투심위 의사록/결과보고서 (날인본)", required=True, timing="D+1"),
        WorkflowDocument(name="주주명부 (투자 전)", required=True, timing="D+1"),
    ]
    wf2.warnings = [
        WorkflowWarning(content="간인 순서: 조합 인감 → 피투자사 → 이해관계인", category="lesson"),
        WorkflowWarning(content="배부: 가운데 양옆 날인(피투자사), 맨 오른쪽(이해관계인)"),
        WorkflowWarning(content="피투자사 법인계좌 사전 확보 권장"),
        WorkflowWarning(content="은행명 정확히 기입 (실수 시 재작성 필요)"),
    ]
    db.add(wf2)

    # ===== 3. 투자 후 서류처리 =====
    wf3 = Workflow(
        name="투자 후 서류처리",
        trigger_description="투자금 출금 완료 후",
        category="투자",
        total_duration="2~3주",
    )
    wf3.steps = [
        WorkflowStep(order=1, name="투자 전 서류 취합 (바이블)", timing="D+3",
                     timing_offset_days=3, estimated_time="1h", quadrant="Q1",
                     memo="권리관계서류 (프론트 전달)"),
        WorkflowStep(order=2, name="투자 후 서류 취합 (바이블)", timing="D+7",
                     timing_offset_days=7, estimated_time="3h", quadrant="Q1",
                     memo="주주명부, 등기부등본 등"),
        WorkflowStep(order=3, name="수탁사 실물 송부", timing="D+15",
                     timing_offset_days=15, estimated_time="1h", quadrant="Q1",
                     memo="투자일로부터 15일 이내"),
        WorkflowStep(order=4, name="VICS 기업등록", timing="D+10",
                     timing_offset_days=10, estimated_time="2h", quadrant="Q1",
                     memo="프로젝트 시"),
        WorkflowStep(order=5, name="등록원부 변경 신청", timing="D+14",
                     timing_offset_days=14, estimated_time="2h", quadrant="Q1",
                     memo="LP 회람"),
        WorkflowStep(order=6, name="출자증서 발급", timing="D+21",
                     timing_offset_days=21, estimated_time="30m", quadrant="Q1",
                     memo="변경 등록 후"),
    ]
    wf3.documents = [
        WorkflowDocument(name="주주명부 (투자 전/후 비교)", required=True),
        WorkflowDocument(name="법인등기부등본 (증자 후, 말소사항 포함)", required=True),
        WorkflowDocument(name="주권미발행확인서", required=True),
        WorkflowDocument(name="주금납입영수증", required=True),
        WorkflowDocument(name="주식납입금 보관증명서", required=True),
        WorkflowDocument(name="법인인감증명서 (3개월 이내)", required=True),
    ]
    wf3.warnings = [
        WorkflowWarning(content="등기부등본 확인 후 주식 수와 계약서 일치 여부 검증 필수", category="lesson"),
        WorkflowWarning(content="주주명부 비교: 투자 전/후 지분율 투심위 기반 비교"),
        WorkflowWarning(content="3개월 이내 발급본: 법인인감증명서, 법인등기부등본"),
        WorkflowWarning(content="주민번호 뒷자리 블러처리 필수"),
        WorkflowWarning(content="투자 당일 서류 취합 리스트 사전 확인", category="lesson"),
    ]
    db.add(wf3)

    # ===== 4. 조합 결성 - 고유번호증 발급 =====
    wf4 = Workflow(
        name="조합 결성 - 고유번호증 발급",
        trigger_description="신규 조합 제안 확정 시",
        category="조합결성",
        total_duration="3~5일",
    )
    wf4.steps = [
        WorkflowStep(order=1, name="조합규약(안) 작성", timing="D-day",
                     timing_offset_days=0, estimated_time="3h", quadrant="Q1"),
        WorkflowStep(order=2, name="고유번호증 발급 서류 준비", timing="D-day",
                     timing_offset_days=0, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=3, name="고유번호증 발급 신청", timing="D+1",
                     timing_offset_days=1, estimated_time="30m", quadrant="Q1"),
        WorkflowStep(order=4, name="고유번호증 수령", timing="D+5",
                     timing_offset_days=5, estimated_time="30m", quadrant="Q1"),
    ]
    wf4.documents = [
        WorkflowDocument(name="조합규약(안)", required=True),
        WorkflowDocument(name="대표자/관리인 확인 서류", required=True),
        WorkflowDocument(name="임대차 관련 서류", required=True),
    ]
    db.add(wf4)

    # ===== 5. 조합 결성 - 수탁계약 체결 =====
    wf5 = Workflow(
        name="조합 결성 - 수탁계약 체결",
        trigger_description="고유번호증 발급 후",
        category="조합결성",
        total_duration="3~5일",
    )
    wf5.steps = [
        WorkflowStep(order=1, name="VICS 등록", timing="D-day",
                     timing_offset_days=0, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=2, name="수탁계약 서류 준비", timing="D+1",
                     timing_offset_days=1, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=3, name="수탁계약 체결", timing="D+2",
                     timing_offset_days=2, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=4, name="계좌개설", timing="D+2",
                     timing_offset_days=2, estimated_time="1h", quadrant="Q1"),
    ]
    wf5.documents = [
        WorkflowDocument(name="고유번호증", required=True),
        WorkflowDocument(name="조합규약(안)", required=True),
        WorkflowDocument(name="사업자등록증 (본점)", required=True),
        WorkflowDocument(name="법인등기부등본 (3개월 이내)", required=True),
        WorkflowDocument(name="법인인감증명서 (3개월 이내)", required=True),
        WorkflowDocument(name="사용인감계", required=True),
    ]
    wf5.warnings = [
        WorkflowWarning(content="VICS 등록: 수탁계약 전 등록 완료 필수"),
    ]
    db.add(wf5)

    # ===== 6. 조합 결성 - 결성총회 개최 =====
    wf6 = Workflow(
        name="조합 결성 - 결성총회 개최",
        trigger_description="수탁계약 체결 후",
        category="조합결성",
        total_duration="2~3주",
    )
    wf6.steps = [
        WorkflowStep(order=1, name="결성총회 공문 발송", timing="D+10",
                     timing_offset_days=10, estimated_time="3h", quadrant="Q1"),
        WorkflowStep(order=2, name="LP 서류 취합", timing="D+24",
                     timing_offset_days=24, estimated_time="2h", quadrant="Q1",
                     memo="최소 2주 전 공문 발송"),
        WorkflowStep(order=3, name="출자금 납입 확인", timing="D+24",
                     timing_offset_days=24, estimated_time="30m", quadrant="Q1"),
        WorkflowStep(order=4, name="운용지시서 작성", timing="D+24",
                     timing_offset_days=24, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=5, name="결성총회 개최", timing="D+25",
                     timing_offset_days=25, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=6, name="총회 회람서류 전달", timing="D+25",
                     timing_offset_days=25, estimated_time="1h", quadrant="Q1"),
    ]
    wf6.documents = [
        WorkflowDocument(name="조합원 동의서", required=True),
        WorkflowDocument(name="개인정보 활용동의서", required=True),
        WorkflowDocument(name="고객거래확인서", required=True),
        WorkflowDocument(name="서면결의서", required=True),
        WorkflowDocument(name="인감증명서 (3개월 이내)", required=True),
        WorkflowDocument(name="신분증 사본 / 등기부등본", required=True),
        WorkflowDocument(name="결성총회의사록", required=True, timing="D+25"),
        WorkflowDocument(name="출자금납입확인서", required=True, timing="D+25"),
        WorkflowDocument(name="조합원 명부", required=True, timing="D+25"),
    ]
    wf6.warnings = [
        WorkflowWarning(content="출자금 납입: 결성총회 전 전액 납입 확인 필수"),
        WorkflowWarning(content="LP 서류 수집: 최소 2주 전 공문 발송"),
        WorkflowWarning(content="추가서류: LP 구성(집합투자기구, 창업기획자, LLC, 미성년자 등)에 따라 상이"),
    ]
    db.add(wf6)

    # ===== 7. 내부보고회 =====
    wf7 = Workflow(
        name="내부보고회",
        trigger_description="분기별 내부보고회 일정 확정 시",
        category="정기업무",
        total_duration="2주",
    )
    wf7.steps = [
        WorkflowStep(order=1, name="자료 취합", timing="D-10",
                     timing_offset_days=-10, estimated_time="2h", quadrant="Q2"),
        WorkflowStep(order=2, name="초안 준비", timing="D-5",
                     timing_offset_days=-5, estimated_time="17h", quadrant="Q2",
                     memo="7개 조합 × 2.5h"),
        WorkflowStep(order=3, name="내부보고회 진행", timing="D-day",
                     timing_offset_days=0, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=4, name="회의록 작성", timing="D+2",
                     timing_offset_days=2, estimated_time="2h", quadrant="Q1"),
    ]
    db.add(wf7)

    # ===== 8. 월보고 =====
    wf8 = Workflow(
        name="월보고",
        trigger_description="매월 초 (마감일 기준)",
        category="정기업무",
        total_duration="5일",
    )
    wf8.steps = [
        WorkflowStep(order=1, name="농금원 월보고", timing="D-2",
                     timing_offset_days=-2, estimated_time="1h", quadrant="Q1",
                     memo="공식 마감: 매월 7일"),
        WorkflowStep(order=2, name="벤처협회(VICS) 월보고", timing="D-day",
                     timing_offset_days=0, estimated_time="1h", quadrant="Q1",
                     memo="공식 마감: 매월 9일"),
    ]
    db.add(wf8)

    # ===== 9. 조합 결성 =====
    wf9 = Workflow(
        name="조합 결성",
        trigger_description="신규 조합 제안 시",
        category="조합관리",
        total_duration="약 1개월",
    )
    wf9.steps = [
        WorkflowStep(order=1, name="고유번호증 발급 준비", timing="D-day", timing_offset_days=0, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=2, name="고유번호증 발급 신청", timing="D-day", timing_offset_days=0, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=3, name="수탁계약 서류 준비", timing="D+5", timing_offset_days=5, estimated_time="3h", quadrant="Q1"),
        WorkflowStep(order=4, name="수탁계약 체결", timing="D+5", timing_offset_days=5, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=5, name="계좌개설", timing="D+5", timing_offset_days=5, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=6, name="결성총회 공문 발송", timing="D+10", timing_offset_days=10, estimated_time="1h", quadrant="Q2"),
        WorkflowStep(order=7, name="LP 서류 취합", timing="D+10~24", timing_offset_days=10, estimated_time="4h", quadrant="Q1"),
        WorkflowStep(order=8, name="운용지시서 작성", timing="D+24", timing_offset_days=24, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=9, name="결성총회 개최", timing="D+25", timing_offset_days=25, estimated_time="3h", quadrant="Q1"),
        WorkflowStep(order=10, name="총회 회람서류 전달", timing="D+25", timing_offset_days=25, estimated_time="30m", quadrant="Q3"),
        WorkflowStep(order=11, name="조합등록 신청", timing="D+26", timing_offset_days=26, estimated_time="2h", quadrant="Q1"),
    ]
    wf9.documents = [
        WorkflowDocument(name="고유번호증", required=True, timing="D-day"),
        WorkflowDocument(name="수탁계약서", required=True, timing="D+5"),
        WorkflowDocument(name="계좌개설 확인서", required=True, timing="D+5"),
        WorkflowDocument(name="결성총회 공문", required=True, timing="D+10"),
        WorkflowDocument(name="LP 출자확약서", required=True, timing="D+10~24"),
        WorkflowDocument(name="LP 서류 (KYC 등)", required=True, timing="D+10~24"),
        WorkflowDocument(name="운용지시서", required=True, timing="D+24"),
        WorkflowDocument(name="결성총회 의사록", required=True, timing="D+25"),
        WorkflowDocument(name="조합등록 신청서", required=True, timing="D+26"),
    ]
    wf9.warnings = [
        WorkflowWarning(content="고유번호증 발급은 세무서 방문 필요 (온라인 불가한 경우 있음)"),
        WorkflowWarning(content="LP 서류 취합 기간이 길어질 수 있으므로 조기 안내 필요"),
        WorkflowWarning(content="결성총회 7일 전 소집통지 발송 필수 (규약 확인)"),
    ]
    db.add(wf9)

    # ===== 10. 정기 총회 =====
    wf10 = Workflow(
        name="정기 총회",
        trigger_description="매년 3월 정기 총회 개최 시",
        category="조합관리",
        total_duration="약 3주",
    )
    wf10.steps = [
        WorkflowStep(
            order=1,
            name="총회 서류 초안 작성",
            timing="D-14",
            timing_offset_days=-14,
            estimated_time="4h",
            quadrant="Q2",
            memo="개최공문, 의안설명서, 영업보고서, 감사보고서",
        ),
        WorkflowStep(order=2, name="총회 소집 통지 발송", timing="D-7", timing_offset_days=-7, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=3, name="총회 개최", timing="D-day", timing_offset_days=0, estimated_time="3h", quadrant="Q1"),
        WorkflowStep(order=4, name="의사록 작성", timing="D+2", timing_offset_days=2, estimated_time="2h", quadrant="Q1"),
    ]
    wf10.documents = [
        WorkflowDocument(name="개최공문", required=True, timing="D-14"),
        WorkflowDocument(name="의안설명서", required=True, timing="D-14"),
        WorkflowDocument(name="영업보고서", required=True, timing="D-14"),
        WorkflowDocument(name="감사보고서", required=True, timing="D-14"),
        WorkflowDocument(name="소집 통지서", required=True, timing="D-7"),
        WorkflowDocument(name="의사록", required=True, timing="D+2"),
    ]
    wf10.warnings = [
        WorkflowWarning(content="소집통지는 총회 7일 전 필수 발송"),
        WorkflowWarning(content="감사보고서는 회계법인 최종 확인 후 첨부"),
    ]
    db.add(wf10)

    db.commit()
    print(f"워크플로우 {db.query(Workflow).count()}개 시드 완료!")
    db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_workflows()
