/**
 * 会計年度ユーティリティ（4月始まり）
 * 例: 2026/3/31 → FY2025 (前期)
 *     2026/4/1  → FY2026 (今期)
 */

export function getFiscalYear(date: Date): number {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  return month >= 4 ? year : year - 1;
}

export function currentFiscalYear(): number {
  return getFiscalYear(new Date());
}

/** 会計年度の開始日・終了日を返す */
export function fiscalYearRange(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(`${fy}-04-01T00:00:00.000+09:00`),
    end:   new Date(`${fy + 1}-03-31T23:59:59.999+09:00`),
  };
}
