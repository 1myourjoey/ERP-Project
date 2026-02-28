"""
app.py
────────────────────────────────────────────────────────
조합 서류 자동 생성 GUI
────────────────────────────────────────────────────────
"""

import os
import json
import threading
import subprocess
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

BASE_DIR = Path(__file__).parent
TEMPLATE_DIR = BASE_DIR / "templates"
OUTPUT_DIR = BASE_DIR / "output"
VAR_DIR = BASE_DIR / "variables"


# ─────────────────────────────────────────────────
# 변수 필드 정의 (라벨, 키, 기본값, 필수여부)
# ─────────────────────────────────────────────────

FIELDS = [
    # (섹션, 라벨, 키, 기본값, 필수)
    ("조합 기본정보",   "조합명",                    "조합명",                    "트리거 메디테크  호 조합",  True),
    ("조합 기본정보",   "조합명 (파일명용, 띄어쓰기 없음)", "조합명_파일명",        "트리거메디테크호조합",       True),
    ("조합 기본정보",   "업무집행조합원 (정식)",       "업무집행조합원_정식",       "트리거투자파트너스 유한회사", True),
    ("조합 기본정보",   "업무집행조합원 (약칭, 예: (유))", "업무집행조합원_약칭",  "트리거투자파트너스(유)",      True),
    ("조합 기본정보",   "대표이사",                   "대표이사",                   "서원일",                    True),
    ("조합 기본정보",   "대표펀드매니저",              "대표펀드매니저",              "서원일",                    False),

    ("번호",            "사업자등록번호",              "사업자등록번호",              "786-88-02871",              True),
    ("번호",            "법인등록번호",                "법인등록번호",                "164714-0005810",            False),
    ("번호",            "고유번호 (세무서 발급)",      "고유번호",                   "479-80-03340",               True),

    ("규모",            "총 출자금 (숫자, 예: 2,275,000,000)", "총출자금_숫자",   "2,275,000,000",              True),
    ("규모",            "총 출자금 (한글 표기)",       "총출자금_한글",              "금이십이억칠천오백만원",      True),
    ("규모",            "총 출자금 (원화기호, 예: ₩2,275,000,000)", "총출자금_기호", "₩2,275,000,000",        True),
    ("규모",            "총 출자좌수 (예: 2,275)",     "총출자좌수",                 "2,275",                     True),
    ("규모",            "조합원 총수 (명)",             "조합원총수",                 "19",                        True),
    ("규모",            "유한책임조합원 수 (명)",       "유한책임조합원수",            "18",                        True),
    ("규모",            "존속기간",                    "존속기간",                   "5년",                        True),

    ("일정",            "결성총회 일시 (풀)",          "결성총회일시_풀",            "2025년 10월 24일(금요일) 오전 10시", True),
    ("일정",            "결성총회 날짜",               "결성총회일_날짜",            "2025년 10월 24일",           True),
    ("일정",            "결성총회 날짜 (약식)",        "결성총회일_약식",            "2025.10.24",                 False),
    ("일정",            "소집통지 날짜",               "소집통지날짜",               "2025년 10월 15일",           True),
    ("일정",            "소집통지 날짜 (약식)",        "소집통지날짜_약식",          "2025. 10. 20",               False),
    ("일정",            "등록신청일",                  "등록신청일",                 "2025년   10월  27일",        True),
    ("일정",            "납입기한",                    "납입기한",                   "2025년 10월 24일(금) 오전 10시까지", True),
    ("일정",            "개업일",                      "개업일",                     "2025.09.19",                 True),
    ("일정",            "임대차 시작일",               "임대차_시작",                "2025.09.19",                 False),
    ("일정",            "임대차 종료일",               "임대차_종료",                "2027.01.19",                 False),
    ("일정",            "임대차 기간 (시작~종료)",     "임대차_기간",                "2025.09.19 ~ 2027.01.19",   False),

    ("장소·계좌",       "사업장 주소 (정식)",          "사업장주소_정식",            "서울특별시 마포구 양화로7길 70, 5층(서교동)", True),
    ("장소·계좌",       "사업장 주소 (약식)",          "사업장주소_약식",            "서울 마포구 양화로7길 70,컬처큐브 5층",     False),
    ("장소·계좌",       "우편번호",                    "우편번호",                   "04029",                     False),
    ("장소·계좌",       "전화번호",                    "전화번호",                   "02-2038-2456",               False),
    ("장소·계좌",       "팩스번호",                    "팩스번호",                   "02-6953-2456",               False),
    ("장소·계좌",       "납입계좌 은행",               "납입계좌은행",               "국민은행",                   True),
    ("장소·계좌",       "납입계좌 번호",               "납입계좌번호",               "003190-15-050045",           True),
    ("장소·계좌",       "임대차 면적",                 "임대차_면적",                "111.83㎡",                   False),

    ("기관·보수",       "수탁기관",                    "수탁기관",                   "유안타증권",                  True),
    ("기관·보수",       "수탁보수",                    "수탁보수",                   "연간 400만원",               True),
    ("기관·보수",       "외부감사인",                  "외부감사인",                 "태성회계법인",                True),
    ("기관·보수",       "감사보수",                    "감사보수",                   "150만원",                    True),

    ("문서번호·담당자", "문서번호 (결성총회 통지)",    "문서번호_통지",              "트리거-2025-23호",           False),
    ("문서번호·담당자", "문서번호 (벤처투자조합 등록)","문서번호_등록",             "트리거-2025-28호",           False),
    ("문서번호·담당자", "담당자 이름",                 "담당자명",                   "홍운학",                     False),
    ("문서번호·담당자", "담당자 이메일",               "담당자이메일",               "hwh@triggerip.com",          False),
    ("문서번호·담당자", "담당자 연락처",               "담당자연락처",               "010-9473-3142",              False),
]


# ─────────────────────────────────────────────────
# 메인 앱 클래스
# ─────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("조합 서류 자동 생성기")
        self.geometry("900x780")
        self.resizable(True, True)
        self.configure(bg="#F0F4F8")

        self.entries = {}   # key → StringVar
        self._build_ui()
        self._check_templates()

    # ── UI 구성 ──────────────────────────────────

    def _build_ui(self):
        # 상단 타이틀
        header = tk.Frame(self, bg="#1B3A6B", pady=12)
        header.pack(fill="x")
        tk.Label(
            header, text="조합 서류 자동 생성기",
            font=("맑은 고딕", 16, "bold"),
            fg="white", bg="#1B3A6B"
        ).pack()
        tk.Label(
            header, text="아래 정보를 입력하고 [서류 생성] 버튼을 누르세요",
            font=("맑은 고딕", 9),
            fg="#A0C4E8", bg="#1B3A6B"
        ).pack()

        # 메인 영역 (좌: 입력폼 / 우: 로그)
        main = tk.Frame(self, bg="#F0F4F8")
        main.pack(fill="both", expand=True, padx=10, pady=8)

        # ── 왼쪽: 스크롤 가능한 입력 폼 ──
        left = tk.Frame(main, bg="#F0F4F8")
        left.pack(side="left", fill="both", expand=True)

        # 저장/불러오기 버튼 행
        btn_row = tk.Frame(left, bg="#F0F4F8")
        btn_row.pack(fill="x", pady=(0, 6))
        tk.Button(btn_row, text="💾 현재 설정 저장", command=self._save_vars,
                  bg="#4A90D9", fg="white", relief="flat", padx=8, pady=3,
                  font=("맑은 고딕", 9)).pack(side="left", padx=2)
        tk.Button(btn_row, text="📂 설정 불러오기", command=self._load_vars,
                  bg="#4A90D9", fg="white", relief="flat", padx=8, pady=3,
                  font=("맑은 고딕", 9)).pack(side="left", padx=2)
        tk.Button(btn_row, text="🔄 기본값으로 초기화", command=self._reset_defaults,
                  bg="#888", fg="white", relief="flat", padx=8, pady=3,
                  font=("맑은 고딕", 9)).pack(side="left", padx=2)

        # 스크롤 캔버스
        canvas = tk.Canvas(left, bg="#F0F4F8", highlightthickness=0)
        scrollbar = ttk.Scrollbar(left, orient="vertical", command=canvas.yview)
        self.scroll_frame = tk.Frame(canvas, bg="#F0F4F8")
        self.scroll_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=self.scroll_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1*(e.delta//120), "units"))

        self._build_form(self.scroll_frame)

        # ── 오른쪽: 로그 + 버튼 ──
        right = tk.Frame(main, bg="#F0F4F8", width=280)
        right.pack(side="right", fill="y", padx=(8, 0))
        right.pack_propagate(False)

        tk.Label(right, text="진행 로그", font=("맑은 고딕", 10, "bold"),
                 bg="#F0F4F8").pack(anchor="w")
        self.log_box = scrolledtext.ScrolledText(
            right, height=20, width=35, state="disabled",
            font=("Consolas", 8), bg="#1E1E1E", fg="#D4D4D4",
            relief="flat"
        )
        self.log_box.pack(fill="both", expand=True, pady=(4, 8))

        # 진행바
        self.progress = ttk.Progressbar(right, mode="determinate", length=260)
        self.progress.pack(fill="x", pady=(0, 8))
        self.status_label = tk.Label(right, text="대기 중", font=("맑은 고딕", 8),
                                     bg="#F0F4F8", fg="#666")
        self.status_label.pack()

        # 버튼들
        tk.Button(
            right, text="📋 템플릿 준비 (최초 1회)",
            command=self._run_setup,
            bg="#E8A020", fg="white", font=("맑은 고딕", 10, "bold"),
            relief="flat", padx=10, pady=8, cursor="hand2"
        ).pack(fill="x", pady=(12, 4))

        tk.Button(
            right, text="🚀 서류 생성",
            command=self._run_generate,
            bg="#2E7D32", fg="white", font=("맑은 고딕", 13, "bold"),
            relief="flat", padx=10, pady=12, cursor="hand2"
        ).pack(fill="x", pady=4)

        tk.Button(
            right, text="📁 출력 폴더 열기",
            command=self._open_output,
            bg="#1B3A6B", fg="white", font=("맑은 고딕", 9),
            relief="flat", padx=8, pady=6, cursor="hand2"
        ).pack(fill="x", pady=4)

    def _build_form(self, parent):
        """섹션별 입력 폼 생성"""
        current_section = None
        section_frame = None

        for (section, label, key, default, required) in FIELDS:
            if section != current_section:
                current_section = section
                # 섹션 헤더
                hdr = tk.Frame(parent, bg="#1B3A6B", pady=3)
                hdr.pack(fill="x", pady=(10, 2))
                tk.Label(
                    hdr, text=f"  {section}",
                    font=("맑은 고딕", 9, "bold"),
                    fg="white", bg="#1B3A6B"
                ).pack(anchor="w")
                section_frame = tk.Frame(parent, bg="#FFFFFF", relief="solid", bd=1)
                section_frame.pack(fill="x", pady=(0, 2))

            row = tk.Frame(section_frame, bg="#FFFFFF")
            row.pack(fill="x", padx=8, pady=3)

            # 라벨
            req_mark = " *" if required else "  "
            tk.Label(
                row,
                text=f"{req_mark}{label}",
                font=("맑은 고딕", 8),
                fg="#C00000" if required else "#444",
                bg="#FFFFFF",
                width=30, anchor="w"
            ).pack(side="left")

            # 입력 칸
            var = tk.StringVar(value=default)
            self.entries[key] = var
            entry = tk.Entry(
                row, textvariable=var,
                font=("맑은 고딕", 9),
                relief="solid", bd=1,
                bg="#FAFAFA"
            )
            entry.pack(side="left", fill="x", expand=True)

    # ── 변수 저장/불러오기 ─────────────────────────

    def _collect_vars(self) -> dict:
        return {k: v.get() for k, v in self.entries.items()}

    def _save_vars(self):
        data = self._collect_vars()
        fund_name = data.get("조합명_파일명", "새조합")
        path = filedialog.asksaveasfilename(
            initialdir=str(VAR_DIR),
            initialfile=f"{fund_name}.json",
            defaultextension=".json",
            filetypes=[("JSON 파일", "*.json")]
        )
        if path:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            messagebox.showinfo("저장 완료", f"저장: {path}")

    def _load_vars(self):
        path = filedialog.askopenfilename(
            initialdir=str(VAR_DIR),
            filetypes=[("JSON 파일", "*.json")]
        )
        if path:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.items():
                if k in self.entries and not k.startswith("_"):
                    self.entries[k].set(str(v))
            self._log(f"✅ 설정 불러옴: {Path(path).name}")

    def _reset_defaults(self):
        for (_, _, key, default, _) in FIELDS:
            if key in self.entries:
                self.entries[key].set(default)

    # ── 템플릿 준비 (setup_templates) ─────────────

    def _run_setup(self):
        if not messagebox.askyesno(
            "템플릿 준비",
            "3호 조합 원본 폴더에서 templates/ 폴더로 마커를 삽입합니다.\n\n"
            "이미 templates/ 폴더가 있다면 덮어씌워집니다.\n계속하시겠습니까?"
        ):
            return

        source = filedialog.askdirectory(
            title="3호 조합 원본 폴더 선택",
            initialdir=r"C:\Users\1llal\Desktop"
        )
        if not source:
            return

        self._log("─" * 40)
        self._log("📋 템플릿 준비 시작...")
        self.progress["value"] = 0
        self.status_label.config(text="템플릿 준비 중...")

        def task():
            from setup_templates import setup_templates

            def on_log(cur, tot, msg):
                pct = int(cur / max(tot, 1) * 100)
                self.after(0, self._update_progress, pct, msg)

            result = setup_templates(source, str(TEMPLATE_DIR), log_callback=on_log)
            self.after(0, self._setup_done, result)

        threading.Thread(target=task, daemon=True).start()

    def _setup_done(self, result):
        self._log(f"✅ HWP 마킹: {result['hwp']}개")
        self._log(f"✅ DOCX 마킹: {result['docx']}개")
        self._log(f"📄 파일 복사: {result['copy']}개")
        if result["failed"]:
            self._log(f"❌ 실패: {result['failed']}")
        self.status_label.config(text="템플릿 준비 완료")
        self.progress["value"] = 100
        self._check_templates()

    # ── 서류 생성 ─────────────────────────────────

    def _check_templates(self):
        """templates 폴더 존재 여부 확인"""
        has = TEMPLATE_DIR.exists() and any(TEMPLATE_DIR.rglob("*.hwp"))
        if not has:
            self._log("⚠️  templates/ 폴더가 비어있습니다.")
            self._log("   먼저 [템플릿 준비] 버튼을 실행하세요.")

    def _run_generate(self):
        # 필수 입력값 검증
        missing = []
        for (_, label, key, _, required) in FIELDS:
            if required and not self.entries[key].get().strip():
                missing.append(label)
        if missing:
            messagebox.showwarning("입력 필요", f"다음 항목을 입력하세요:\n" + "\n".join(missing))
            return

        if not TEMPLATE_DIR.exists() or not any(TEMPLATE_DIR.rglob("*.hwp")):
            messagebox.showerror("오류", "templates/ 폴더가 없습니다.\n먼저 [템플릿 준비]를 실행하세요.")
            return

        variables = self._collect_vars()
        fund_name = variables.get("조합명", "새조합")

        self._log("─" * 40)
        self._log(f"🚀 생성 시작: {fund_name}")
        self.progress["value"] = 0
        self.status_label.config(text="생성 중...")

        def task():
            from generator import generate_documents

            def on_progress(cur, tot, msg):
                pct = int(cur / max(tot, 1) * 100)
                self.after(0, self._update_progress, pct, msg)

            result = generate_documents(
                variables=variables,
                template_dir=str(TEMPLATE_DIR),
                output_dir=str(OUTPUT_DIR),
                progress_callback=on_progress,
            )
            self.after(0, self._generate_done, result, fund_name)

        threading.Thread(target=task, daemon=True).start()

    def _generate_done(self, result, fund_name):
        self._log(f"✅ 완료: 성공 {len(result['success'])}개")
        if result["failed"]:
            self._log(f"❌ 실패: {result['failed']}")
        for w in result.get("warnings", []):
            self._log(f"⚠️  {w}")
        self.status_label.config(text=f"완료: {fund_name}")
        self.progress["value"] = 100
        out_path = OUTPUT_DIR / fund_name
        messagebox.showinfo(
            "생성 완료",
            f"서류 생성이 완료되었습니다.\n\n출력 경로:\n{out_path}"
        )

    # ── 출력 폴더 열기 ────────────────────────────

    def _open_output(self):
        path = str(OUTPUT_DIR)
        if os.path.exists(path):
            os.startfile(path)
        else:
            messagebox.showinfo("안내", "아직 생성된 파일이 없습니다.")

    # ── 공통 유틸 ─────────────────────────────────

    def _log(self, msg: str):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _update_progress(self, pct: int, msg: str):
        self.progress["value"] = pct
        self.status_label.config(text=msg[:50])
        self._log(msg)


# ─────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()
    app.mainloop()
