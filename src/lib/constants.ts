// 部署（要件どおり固定）
export const DEPARTMENTS = ["1DCD", "2DCD", "3DCD", "戦略PL", "DS", "AEPL", "Admin"] as const;
export type Department = (typeof DEPARTMENTS)[number];

// 案件種別（「指名(決定)」は削除）
export const PROJECT_TYPES = [
  "AE提案",
  "自主提案",
  "競合コンペ",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

// 案件確度
export const CERTAINTY_OPTIONS = [
  "決定",
  "A(70%)",
  "B(50%)",
  "C(30%)",
] as const;
export type Certainty = (typeof CERTAINTY_OPTIONS)[number];

// 業務内容
export const BUSINESS_CONTENTS = [
  "グラフィック制作",
  "映像制作",
  "WEB制作",
  "イベント制作",
  "PR",
  "インフルエンサー",
  "コンサル",
] as const;
export type BusinessContent = (typeof BUSINESS_CONTENTS)[number];

// Good / Bad / 未定
export const PROJECT_RESULT_STATUS = ["good", "bad", "undecided"] as const;
export type ProjectResultStatus = (typeof PROJECT_RESULT_STATUS)[number];

// 提案案件ステータス
export const PROPOSAL_STATUS_OPTIONS = [
  "preparing",
  "waiting_response",
  "following_up",
  "re_proposing",
  "negotiating",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS_OPTIONS)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  preparing:       "準備中",
  waiting_response: "提案済・回答待ち",
  following_up:    "追客中",
  re_proposing:    "再提案中",
  negotiating:     "条件交渉中",
};

// 親案件 実行フェーズステータス（Good確定後）
export const EXECUTION_STATUS_OPTIONS = [
  "active",
  "suspended",
  "completed",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUS_OPTIONS)[number];

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  active:    "進行中",
  suspended: "中断",
  completed: "完了",
};

// 子案件ステータス
export const SUB_PROJECT_STATUS_OPTIONS = [
  "active",
  "completed",
] as const;
export type SubProjectStatus = (typeof SUB_PROJECT_STATUS_OPTIONS)[number];

export const SUB_PROJECT_STATUS_LABELS: Record<SubProjectStatus, string> = {
  active:    "進行中",
  completed: "完了",
};

// ─── 担当者負荷 2軸定義 ─────────────────────────────────────────

// 軸① 関わり度
export const INVOLVEMENT_OPTIONS = ["MAIN", "SUB", "ADVICE"] as const;
export type Involvement = (typeof INVOLVEMENT_OPTIONS)[number];

export const INVOLVEMENT_LABELS: Record<Involvement, string> = {
  MAIN:   "高",
  SUB:    "中",
  ADVICE: "低",
};

// 軸② スキルレベル（案件単位で入力）
export const SKILL_LEVEL_OPTIONS = [1, 2, 3] as const;
export type SkillLevel = (typeof SKILL_LEVEL_OPTIONS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  1: "Lv.1 — 都度サポートが必要",
  2: "Lv.2 — 基本は自走できる",
  3: "Lv.3 — 他者をリードできる",
};

// 負荷スコアマトリクス（旧方式・後方互換のため残存）
export const LOAD_MATRIX: Record<Involvement, Record<SkillLevel, number>> = {
  MAIN:   { 1: 10, 2: 7, 3: 5 },
  SUB:    { 1: 6,  2: 4, 3: 3 },
  ADVICE: { 1: 2,  2: 2, 3: 1 },
};

// 関わり度の重み（新方式：チーム構成按分）
// 子案件の総負荷(10)を関わり度の重みで按分する
export const INVOLVEMENT_WEIGHTS: Record<Involvement, number> = {
  MAIN:   3,
  SUB:    1,
  ADVICE: 0.25,
};

export const PROJECT_BASE_LOAD = 10; // 子案件1件あたりの総負荷ポイント

// 提案案件の種別ごとの基本負荷ポイント（競合コンペ=5, AE提案=1, 自主提案=1）
export const PROPOSAL_BASE_LOADS: Record<string, number> = {
  "競合コンペ": 5,
  "AE提案":    1,
  "自主提案":  1,
};

// 担当者負荷スコア判定基準
export const LOAD_THRESHOLDS = {
  UNDER:  10, // 〜10：余裕あり
  NORMAL: 20, // 11〜20：通常稼働
  HIGH:   32, // 21〜32：やや過多
  HEAVY:  45, // 33〜45：高負荷
  // 46以上：過負荷
} as const;

export function getLoadLabel(score: number): string {
  if (score <= LOAD_THRESHOLDS.UNDER)  return "余裕あり";
  if (score <= LOAD_THRESHOLDS.NORMAL) return "通常稼働";
  if (score <= LOAD_THRESHOLDS.HIGH)   return "やや過多";
  if (score <= LOAD_THRESHOLDS.HEAVY)  return "高負荷";
  return "過負荷";
}

// 子案件単体の負荷ラベル（スコア 1〜10）
export function getProjectLoadLabel(score: number): string {
  if (score <= 3)  return "軽い";
  if (score <= 5)  return "標準";
  if (score <= 7)  return "やや重い";
  if (score <= 9)  return "重い";
  return "非常に重い";
}

// 子案件業務内容（親案件より詳細な選択肢）
export const SUB_PROJECT_BUSINESS_CONTENTS = [
  // グラフィック系
  "キービジュアル制作",
  "フライヤー・チラシ",
  "パンフレット・冊子",
  "バナー広告",
  "OOH・交通広告",
  "パッケージデザイン",
  // 映像系
  "TV-CM制作",
  "Web動画・SNS動画",
  "プロモーション映像",
  "記録・ドキュメント映像",
  "ライブ配信",
  // WEB系
  "LP・特設サイト制作",
  "コーポレートサイト",
  "ECサイト",
  "バナー・WEB素材",
  "SNS運用・コンテンツ制作",
  // イベント系
  "店頭・POP UPイベント",
  "展示会・見本市",
  "セミナー・シンポジウム",
  "社内イベント・式典",
  "スポーツ・エンタメイベント",
  // PR系
  "プレスリリース・広報支援",
  "メディアアプローチ",
  "インフルエンサー施策",
  // コンサル系
  "戦略立案・コンサルティング",
  "リサーチ・調査",
  // その他
  "その他",
] as const;
export type SubProjectBusinessContent = (typeof SUB_PROJECT_BUSINESS_CONTENTS)[number];
