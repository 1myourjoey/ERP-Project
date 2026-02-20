# 화면명세서 (Screen Specifications) 템플릿

본 문서는 프론트엔드 모듈 개발 및 유지보수를 위한 화면정의서(기획서) 템플릿입니다. 신규 화면 기획 시 이 형식에 맞추어 작성해주십시오.

## 1. 개요 (Overview)
- **화면명:** [ex: 대시보드 - 파이프라인 뷰]
- **메뉴 경로:** [ex: GNB > 대시보드]
- **라우팅 주소 (Route):** [ex: `/dashboard`]
- **작성자 / 일자:** 

---

## 2. 화면 레이아웃 (Layout & UI)

*(여기에 피그마 링크나 캡쳐된 와이어프레임 이미지를 삽입합니다.)*
- Figma Link: [URL 삽입]
- Screenshot: `![화면캡쳐본](경로)`

---

## 3. 기능 및 데이터 명세 (Features & Data Binding)

| No | 영역 (컴포넌트) | UI 타입 | 데이터 매핑 (Data Binding) | 기능 설명 및 이벤트 (Action) |
|---|---|---|---|---|
| 1 | 상단 필터 | Dropdown | `useQuery(['gpEntities'])` | 담당자/분야별 필터 체인지 이벤트 |
| 2 | 목록 테이블 | Table / List | `useQuery(['dashboard'])` | 페이징, 상태별 정렬 처리 |
| 3 | 신규 등록 원버튼 | Button | N/A | 클릭 시 '모달 창' 팝업 오픈 (`isOpen=true`) |
| 4 | 상세 조회 링크 | HashLink | `/fund/{id}` | 클릭 시 해당 아이템 상세 페이지 라우팅 |

---

## 4. 모달 / 팝업 명세 (Modal Specs)
- **모달명:** [ex: 출자요청 등록 위저드]
- **목적:** 
- **입력 폼 (Form):**
  - 필드 1: Type (Date), 필수 (Y)
  - 필드 2: Type (Number), 필수 (N) - 최대 잔여 약정액 Validation
- **Submit 액션:** `POST /api/capital_calls` → 완료 후 모달 언마운트 & 쿼리 무효화(Invalidation)

---

## 5. 예외 처리 & Validation (Edge Cases)
1. 데이터가 없을 경우 (Empty State): "등록된 내역이 없습니다." 일러스트 화면 노출
2. 권한 부족 시: 해당 버튼 비활성화 (disabled) 및 "읽기 전용" 툴팁 표시
3. 네트워크 에러: React Hot Toast 에러 메시지 출력 "데이터를 불러오는 중 오류가 발생했습니다."
