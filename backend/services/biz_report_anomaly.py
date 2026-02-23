from __future__ import annotations

from typing import Any


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    return float(value)


def detect_biz_report_anomalies(request_row: Any, previous_row: Any | None = None) -> list[dict[str, str]]:
    """Run phase36 anomaly rules against a single request row."""
    anomalies: list[dict[str, str]] = []

    revenue = _to_float(getattr(request_row, "revenue", None))
    prev_revenue = _to_float(getattr(request_row, "prev_revenue", None))
    operating_income = _to_float(getattr(request_row, "operating_income", None))
    prev_operating_income = _to_float(getattr(request_row, "prev_operating_income", None))
    net_income = _to_float(getattr(request_row, "net_income", None))
    prev_net_income = _to_float(getattr(request_row, "prev_net_income", None))
    total_equity = _to_float(getattr(request_row, "total_equity", None))
    cash = _to_float(getattr(request_row, "cash", None))
    comment = (getattr(request_row, "comment", None) or "").strip()

    if prev_revenue:
        delta_pct = (revenue - prev_revenue) / prev_revenue * 100
        if abs(delta_pct) >= 30:
            anomalies.append(
                {
                    "anomaly_type": "매출급변",
                    "severity": "주의",
                    "detail": f"전기 대비 매출 변동률 {delta_pct:.1f}%",
                }
            )
        elif abs(delta_pct) <= 5:
            anomalies.append(
                {
                    "anomaly_type": "매출정체",
                    "severity": "주의",
                    "detail": f"전기 대비 매출 변동률 {delta_pct:.1f}% (정체 구간)",
                }
            )

    if prev_operating_income > 0 and operating_income < 0:
        anomalies.append(
            {
                "anomaly_type": "영업손실전환",
                "severity": "위험",
                "detail": "전기 흑자에서 당기 영업손실로 전환되었습니다",
            }
        )

    if total_equity < 0:
        anomalies.append(
            {
                "anomaly_type": "자본잠식",
                "severity": "위험",
                "detail": "자본총계가 0 미만입니다",
            }
        )

    monthly_cost = max(-operating_income, 0) / 3 if operating_income < 0 else 0
    if monthly_cost > 0 and cash < monthly_cost * 3:
        anomalies.append(
            {
                "anomaly_type": "현금고갈",
                "severity": "위험",
                "detail": "현금성 자산이 최근 월평균 비용의 3개월치 미만입니다",
            }
        )

    if prev_net_income < 0 and net_income < 0:
        anomalies.append(
            {
                "anomaly_type": "적자지속",
                "severity": "주의",
                "detail": "2분기 연속 순손실입니다",
            }
        )

    if previous_row is not None:
        prev_prev_revenue = _to_float(getattr(previous_row, "prev_revenue", None))
        if prev_prev_revenue and prev_revenue:
            if abs((prev_revenue - prev_prev_revenue) / prev_prev_revenue * 100) <= 5 and prev_revenue:
                if abs((revenue - prev_revenue) / prev_revenue * 100) <= 5:
                    anomalies.append(
                        {
                            "anomaly_type": "매출정체",
                            "severity": "주의",
                            "detail": "연속 분기 매출 정체가 감지되었습니다",
                        }
                    )

    if not comment:
        anomalies.append(
            {
                "anomaly_type": "코멘트미입력",
                "severity": "알림",
                "detail": "심사역 코멘트가 비어 있습니다",
            }
        )

    # Remove duplicate anomaly_type rows while keeping the first detection detail.
    deduped: list[dict[str, str]] = []
    seen_types: set[str] = set()
    for row in anomalies:
        key = row["anomaly_type"]
        if key in seen_types:
            continue
        seen_types.add(key)
        deduped.append(row)
    return deduped
