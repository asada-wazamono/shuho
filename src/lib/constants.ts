// 部署（要件どおり固定）
export const DEPARTMENTS = ["1DCD", "2DCD", "3DCD", "戦略PL"] as const;
export type Department = (typeof DEPARTMENTS)[number];

// 案件種別
export const PROJECT_TYPES = [
  "指名(決定)",
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

// 負荷レベル 1〜5
export const LOAD_LEVELS = [1, 2, 3, 4, 5] as const;

export const PROPOSAL_STATUS_OPTIONS = [
  "preparing",
  "waiting_response",
  "following_up",
  "re_proposing",
  "negotiating",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS_OPTIONS)[number];

export const PROJECT_STATUS_OPTIONS = [
  "preparing",
  "in_progress",
  "waiting_client",
  "adjusting",
  "on_hold",
  "completed",
  "ongoing",
] as const;
export type ProjectProgressStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  preparing: "準備中",
  waiting_response: "提案済・回答待ち",
  following_up: "追客中",
  re_proposing: "再提案中",
  negotiating: "条件交渉中",
};

export const PROPOSAL_EFFORT_TYPES = [
  "existing_continuation",
  "existing_new",
  "fully_new",
] as const;
export type ProposalEffortType = (typeof PROPOSAL_EFFORT_TYPES)[number];

export const PROPOSAL_EFFORT_LABELS: Record<ProposalEffortType, string> = {
  existing_continuation: "既存継続",
  existing_new: "既存新規",
  fully_new: "完全新規",
};

// 提案案件の負荷ウェイト（案件全体の重さ。担当者人数で均等割りして個人負荷を算出）
export const PROPOSAL_EFFORT_WEIGHTS: Record<ProposalEffortType, number> = {
  existing_continuation: 1.0,
  existing_new: 2.5,
  fully_new: 4.0,
};

export const PROJECT_STATUS_LABELS: Record<ProjectProgressStatus, string> = {
  preparing: "準備中",
  in_progress: "進行中",
  waiting_client: "クライアント確認待ち",
  adjusting: "調整中",
  on_hold: "一時停止",
  completed: "完了・納品済み",
  ongoing: "継続運用中",
};

// 負荷スコア係数（判断負荷レベル × JUDGMENT_WEIGHT。将来変更可能にする）
export const JUDGMENT_WEIGHT = 1.5;

// 担当者負荷スコア判定基準（要件どおり）
export const LOAD_THRESHOLDS = {
  UNDER: 10,   // 〜10：余裕あり
  NORMAL: 18,  // 11〜18：通常稼働
  HIGH: 25,    // 19〜25：やや過多
  HEAVY: 35,   // 26〜35：高負荷
  // 36以上：過負荷
} as const;

export function getLoadLabel(score: number): string {
  if (score <= LOAD_THRESHOLDS.UNDER) return "余裕あり";
  if (score <= LOAD_THRESHOLDS.NORMAL) return "通常稼働";
  if (score <= LOAD_THRESHOLDS.HIGH) return "やや過多";
  if (score <= LOAD_THRESHOLDS.HEAVY) return "高負荷";
  return "過負荷";
}

// 案件単体の負荷ラベル（案件負荷スコア: 2.5〜17.5 想定）
export function getProjectLoadLabel(score: number): string {
  if (score < 7) return "軽い";
  if (score < 10) return "標準";
  if (score < 13) return "やや重い";
  if (score < 16) return "重い";
  return "非常に重い";
}
