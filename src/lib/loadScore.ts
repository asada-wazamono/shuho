import { JUDGMENT_WEIGHT } from "./constants";

// 案件負荷スコア = 業務レベル + 稼働負荷レベル + (判断負荷レベル × 1.5) 最大17.5
export function projectLoadScore(
  businessLevel: number,
  workloadLevel: number,
  judgmentLevel: number
): number {
  return businessLevel + workloadLevel + judgmentLevel * JUDGMENT_WEIGHT;
}

// 担当者負荷スコア = 担当案件の案件負荷スコア合計（単純合算）
export function assigneeLoadScore(
  projects: { businessLevel: number; workloadLevel: number; judgmentLevel: number }[]
): number {
  return projects.reduce(
    (sum, p) => sum + projectLoadScore(p.businessLevel, p.workloadLevel, p.judgmentLevel),
    0
  );
}
