import { LOAD_MATRIX, type Involvement, type SkillLevel } from "./constants";

/**
 * 子案件1件における担当者1人分の負荷スコアを返す
 * スコアマトリクス（関わり度 × スキルLv）に基づいて算出
 */
export function subProjectLoadScore(
  involvement: Involvement,
  skillLevel: SkillLevel
): number {
  return LOAD_MATRIX[involvement][skillLevel];
}

/**
 * 担当者の総負荷スコア（担当する全子案件のスコア合計）
 * 完了ステータスの子案件は除外済みのリストを渡すこと
 */
export function assigneeLoadScore(
  assignments: { involvement: Involvement; skillLevel: SkillLevel }[]
): number {
  return assignments.reduce(
    (sum, a) => sum + subProjectLoadScore(a.involvement, a.skillLevel),
    0
  );
}
