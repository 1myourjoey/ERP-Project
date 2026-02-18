export const NOTICE_KEYWORDS = ['통지', '소집', '안건']
export const REPORT_KEYWORDS = ['보고', '리포트', '월간', '분기', '연간']

export function detectNoticeReport(title: string): { is_notice: boolean; is_report: boolean } {
  const normalized = title.trim()
  if (!normalized) {
    return { is_notice: false, is_report: false }
  }
  const hasNotice = NOTICE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  const hasReport = REPORT_KEYWORDS.some((keyword) => normalized.includes(keyword))
  return { is_notice: hasNotice, is_report: hasReport }
}
