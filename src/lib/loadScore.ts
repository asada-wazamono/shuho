import { INVOLVEMENT_WEIGHTS, PROJECT_BASE_LOAD, PROPOSAL_BASE_LOADS, type Involvement } from "./constants";

/**
 * 子案件のチーム構成に基づき、各担当者の負荷スコアを按分して返す。
 * 子案件の総負荷(PROJECT_BASE_LOAD=10)を関わり度の重みで比例配分する。
 *
 * 例：メイン1人+サブ1人の場合
 *   総重み = 3 + 1 = 4
 *   メインのスコア = (3/4) × 10 = 7.5
 *   サブのスコア   = (1/4) × 10 = 2.5
 *
 * @returns userId → 負荷スコア のマップ
 */
export function calcSubProjectLoads(
  assignees: { userId: string; involvement: Involvement }[]
): Record<string, number> {
  const totalWeight = assignees.reduce(
    (sum, a) => sum + INVOLVEMENT_WEIGHTS[a.involvement],
    0
  );
  if (totalWeight === 0) return {};
  const result: Record<string, number> = {};
  for (const a of assignees) {
    result[a.userId] =
      Math.round((INVOLVEMENT_WEIGHTS[a.involvement] / totalWeight) * PROJECT_BASE_LOAD * 10) / 10;
  }
  return result;
}

/**
 * 提案案件の担当者ごとの負荷スコアを返す。
 * 種別ごとの基本負荷(PROPOSAL_BASE_LOADS)を関わり度の重みで按分する。
 *
 * @returns userId → 負荷スコア のマップ
 */
export function calcProposalLoad(
  assignees: { userId: string; involvement: Involvement }[],
  projectType: string
): Record<string, number> {
  const baseLoad = PROPOSAL_BASE_LOADS[projectType] ?? 1;
  const totalWeight = assignees.reduce(
    (sum, a) => sum + INVOLVEMENT_WEIGHTS[a.involvement],
    0
  );
  if (totalWeight === 0) return {};
  const result: Record<string, number> = {};
  for (const a of assignees) {
    result[a.userId] =
      Math.round((INVOLVEMENT_WEIGHTS[a.involvement] / totalWeight) * baseLoad * 10) / 10;
  }
  return result;
}

/**
 * 担当者の総負荷スコア（担当する全子案件のスコア合計）
 * calcSubProjectLoads で算出した個人スコアを合算する
 */
export function assigneeLoadScore(
  assignments: { involvement: Involvement; score: number }[]
): number {
  return Math.round(
    assignments.reduce((sum, a) => sum + a.score, 0) * 10
  ) / 10;
}
