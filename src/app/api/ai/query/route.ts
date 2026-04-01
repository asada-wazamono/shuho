import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assigneeLoadScore, } from "@/lib/loadScore";
import { getLoadLabel, type Involvement, type SkillLevel } from "@/lib/constants";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const DOMAIN_SQL_RULES = `【用語ルール（厳守）】
■ 案件ステータス
- 決定案件 = "Project".status = 'good'
- 提案案件 = "Project".status IN ('undecided','bad')
- Bad案件  = "Project".status = 'bad'
- 未定案件 = "Project".status = 'undecided'
- 進行中の案件 = "Project"."projectStatus" = 'active'（かつ status='good' を推奨）
- 完了した案件 = "Project"."projectStatus" = 'completed'
- 中断した案件 = "Project"."projectStatus" = 'suspended'

■ 予算・売上（最重要）
- 売上・売り上げ = 決定案件（status='good'）の "SubProject"."departmentBudget" の合計
- 部門予算（担当者別）= "SubProjectAssignee" → "SubProject" → "Project"(status='good') で "SubProject"."departmentBudget" を SUM
- 部門予算（部署別）  = "Project"."ownerDepartment" でグループ化し "SubProject"."departmentBudget" を SUM
- 全体予算（部署別）  = "Project"."ownerDepartment" でグループ化し "Project"."totalBudget" を SUM
- "Project"."departmentBudget" は旧データ互換用のため集計には使わないこと（必ず "SubProject"."departmentBudget" を使う）
- 全体予算 = "Project"."totalBudget"
- 任意額   = "Project"."optionalAmount"

■ 担当者
- 担当者名（子案件）= "SubProjectAssignee" と "User" をJOIN（新規データはこちら）
- 担当者名（親案件）= "ProjectAssignee" と "User" をJOIN（旧データ参照時のみ）
- クライアント名    = "Client".name（JOIN）

■ 確度
- A確度 = "Project".certainty = 'A(70%)'
- B確度 = "Project".certainty = 'B(50%)'
- C確度 = "Project".certainty = 'C(30%)'
- 決定（確度）= "Project".certainty = '決定'

【重要】
- 「決定」「提案」を certainty や projectType で判定しないこと。必ず status を使うこと。
- テーブル名とカラム名は実在名のみを使うこと。
- 返答はSQL本文のみ（説明文なし）。`;

const ROUTING_RULES = `あなたは質問ルーティング判定器です。
以下の質問を「A(SQL集計系)」または「B(JSON分析系)」に分類し、AまたはBの1文字だけ返してください。

判定ルール:
- A(SQL集計系):
  - 件数、合計、平均、順位、上位N、特定条件での抽出など
  - 明確に数値や条件を指定して一覧・集計を求める質問
- B(JSON分析系):
  - 傾向分析、偏り、比較、忙しさ評価、要約、所感、優先順位づけ
  - 曖昧な比較（例: 「どっちが忙しい？」）や文脈解釈が必要な質問
  - 人名比較で「忙しい/大変/余裕」など評価語を含む質問はBを優先
  - 「負荷」「忙しい」「キャパ」「大変」「余裕」「過多」に関する質問は必ずB（負荷スコアはDBに保存されておらず、SQLでは取得不可）

補助ルール:
- 人名が含まれていても、明確な数値抽出（例: 「山田の決定案件数」）はA
- 不明な場合はBを返す`;

function extractGeminiText(payload: unknown): string {
  const text =
    (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  return text;
}

class GeminiApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

async function callGemini(
  prompt: string,
  apiKey: string,
  history?: GeminiContent[]
): Promise<string> {
  const contents: GeminiContent[] = [
    ...(history ?? []),
    { role: "user", parts: [{ text: prompt }] },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new GeminiApiError(response.status, `Gemini API error: ${response.status} ${text}`);
  }
  const json = (await response.json()) as unknown;
  const text = extractGeminiText(json);
  if (!text) throw new Error("Gemini response is empty");
  return text;
}

function normalizeSql(raw: string): string {
  const stripped = raw
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
    .replace(/;+$/, "")
    .trim();
  return stripped;
}

function ensureSelectOnly(sql: string): void {
  if (!/^select\b/i.test(sql)) {
    throw new Error("SELECT文のみ実行できます");
  }
  if (sql.includes(";")) {
    throw new Error("複数文のSQLは実行できません");
  }
  if (/\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|pragma|vacuum|reindex|begin|commit|rollback)\b/i.test(sql)) {
    throw new Error("危険なSQLが含まれています");
  }
}

function includesDecidedKeyword(question: string): boolean {
  return question.includes("決定案件") || question.includes("決定");
}

function includesProposalKeyword(question: string): boolean {
  return question.includes("提案案件") || question.includes("提案");
}

function hasExpectedStatusCondition(sql: string, question: string): boolean {
  // クォートあり("status")・なし(status)どちらにも対応
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");
  if (includesDecidedKeyword(question)) {
    return /"?status"?\s*=\s*'good'/.test(normalized);
  }
  if (includesProposalKeyword(question)) {
    return /"?status"?\s+in\s*\(\s*'undecided'\s*,\s*'bad'\s*\)|"?status"?\s*!=\s*'good'|"?status"?\s*<>\s*'good'/.test(normalized);
  }
  return true;
}

function isLoadQuestion(question: string): boolean {
  return /負荷|忙し|多忙|大変|余裕|過多|過負荷|高負荷|ランキング|アサイン|抱えてる|キャパ|稼働/.test(question);
}

type TargetMonth = { year: number; month: number; label: string };

function extractTargetMonth(question: string): TargetMonth | null {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;

  if (/今月/.test(question)) return { year: cy, month: cm, label: `${cy}年${cm}月` };
  if (/来月/.test(question)) {
    const nm = cm === 12 ? 1 : cm + 1;
    const ny = cm === 12 ? cy + 1 : cy;
    return { year: ny, month: nm, label: `${ny}年${nm}月` };
  }
  if (/再来月/.test(question)) {
    const raw = cm + 2;
    const nm = raw > 12 ? raw - 12 : raw;
    const ny = raw > 12 ? cy + 1 : cy;
    return { year: ny, month: nm, label: `${ny}年${nm}月` };
  }
  const match = question.match(/(\d{1,2})月/);
  if (match) {
    const month = parseInt(match[1]);
    if (month >= 1 && month <= 12) {
      const year = month < cm ? cy + 1 : cy;
      return { year, month, label: `${year}年${month}月` };
    }
  }
  return null;
}

async function computeLoadSummary(targetMonth?: TargetMonth) {
  const users = await prisma.user.findMany({
    where: { role: "staff" },
    select: { id: true, name: true, department: true },
  });

  // 対象月が指定されている場合、その月に実施中の子案件のみに絞る
  // 条件: periodEnd が null（期間未定＝継続中とみなす）または periodEnd >= 対象月初日
  //       かつ periodStart が null または periodStart <= 対象月末日
  const monthStart = targetMonth ? new Date(targetMonth.year, targetMonth.month - 1, 1) : null;
  const monthEnd = targetMonth ? new Date(targetMonth.year, targetMonth.month, 0, 23, 59, 59) : null;

  const subProjects = await prisma.subProject.findMany({
    where: {
      status: "active",
      parent: { status: "good", mergedIntoId: null },
      ...(monthStart && monthEnd ? {
        AND: [
          { OR: [{ periodEnd: null }, { periodEnd: { gte: monthStart } }] },
          { OR: [{ periodStart: null }, { periodStart: { lte: monthEnd } }] },
        ],
      } : {}),
    },
    include: {
      parent: { select: { name: true } },
      assignees: {
        include: { user: { select: { id: true, name: true, department: true } } },
      },
    },
  });

  const userAgg: Record<string, {
    name: string; department: string; totalLoad: number; subProjectCount: number;
    assignments: { parentName: string; subProjectName: string; involvement: string; score: number; periodEnd: string | null }[];
  }> = {};
  for (const u of users) {
    userAgg[u.id] = { name: u.name, department: u.department, totalLoad: 0, subProjectCount: 0, assignments: [] };
  }

  for (const sp of subProjects) {
    for (const a of sp.assignees) {
      const target = userAgg[a.userId];
      if (!target) continue;
      const score = assigneeLoadScore([{
        involvement: a.involvement as Involvement,
        skillLevel: a.skillLevel as SkillLevel,
      }]);
      target.totalLoad += score;
      target.subProjectCount += 1;
      target.assignments.push({
        parentName: sp.parent.name,
        subProjectName: sp.name,
        involvement: a.involvement,
        score,
        periodEnd: sp.periodEnd ? sp.periodEnd.toISOString().slice(0, 7) : null,
      });
    }
  }

  return Object.values(userAgg)
    .map((u) => ({
      name: u.name,
      department: u.department,
      totalLoad: Math.round(u.totalLoad * 10) / 10,
      label: getLoadLabel(u.totalLoad),
      subProjectCount: u.subProjectCount,
      topAssignments: u.assignments
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((a) => `${a.parentName}／${a.subProjectName}(スコア${a.score}${a.periodEnd ? " 〜" + a.periodEnd : ""})`),
    }))
    .sort((a, b) => b.totalLoad - a.totalLoad);
}

function wantsTabularAnswer(question: string): boolean {
  return question.includes("表") || question.includes("テーブル");
}

function wantsProjectListStyleTable(question: string): boolean {
  return wantsTabularAnswer(question) && (question.includes("案件") || question.includes("案件一覧"));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY が未設定です" }, { status: 500 });
  }

  const body = (await request.json()) as {
    question?: string;
    conversationHistory?: Array<{ question: string; answer: string }>;
  };
  const question = String(body.question ?? "").trim();
  if (!question) {
    return Response.json({ error: "質問を入力してください" }, { status: 400 });
  }

  // 過去の会話をGeminiのcontents形式に変換（最大5ターン）
  const geminiHistory: GeminiContent[] = (body.conversationHistory ?? [])
    .slice(-5)
    .flatMap((h) => [
      { role: "user" as const, parts: [{ text: h.question }] },
      { role: "model" as const, parts: [{ text: h.answer }] },
    ]);

  // ルーティングはhistoryなしで判定（現在の質問のみ）
  let logId: string | null = null;

  try {
    const routingPrompt = `${ROUTING_RULES}

質問:
${question}`;

    const routeDecision = await callGemini(routingPrompt, apiKey);
    const route = routeDecision.trim() === "A" ? "A" : "B";

    const log = await prisma.aiQueryLog.create({
      data: { userId: session.id, userName: session.name, question, mode: route },
    });
    logId = log.id;

    if (route === "A") {
      const tableSqlInstruction = wantsProjectListStyleTable(question)
        ? `
【案件一覧表の列ルール】
案件の一覧を求められた場合は、可能な限り次の列をこの順番・この別名でSELECTしてください。
- p.status AS "状態"
- p."ownerDepartment" AS "担当部署"
- c.name AS "クライアント"
- p.name AS "案件名"
- p."projectType" AS "種別"
- p."businessContent" AS "業務内容"
- p."totalBudget" AS "全体予算"
- p."departmentBudget" AS "部門予算"
- p."optionalAmount" AS "任意額"
- p."periodStart" AS "実施開始"
- p."periodEnd" AS "実施終了"
- p."statusUpdatedAt" AS "ステータス更新日"
- p."updatedAt" AS "最終更新日"
担当者は "ProjectAssignee" と "User" をJOINして、"担当者" 列に u.department || ':' || u.name を連結して入れてください。`
        : "";

      const sqlPrompt = `あなたはPostgreSQLのクエリ生成AIです。
以下のスキーマを元に、質問に答えるSELECT文を生成してください。
コードブロックなしで、SQLのみを返してください。

【絶対ルール: 識別子のクォート】
Prisma + PostgreSQLではテーブル名・camelCaseカラム名はダブルクォート必須。
- テーブル名: 常にクォート → "Project", "User", "Client", "ProjectAssignee"
- camelCaseカラム: 常にクォート → "clientId", "projectType", "ownerDepartment" など
- 小文字のみのカラム: クォート不要 → id, name, status, note, role, email, department

【完全スキーマ（実際のカラム名）】
"Project": id, name, status, note,
  "clientId", "projectType", "proposalStatus", "projectStatus",
  "totalBudget", "departmentBudget"(旧), "optionalAmount",
  "ownerDepartment", "statusUpdatedAt", "proposalDate",
  "periodStart", "periodEnd", "proposalEffortType", "mergedIntoId",
  "businessContent", certainty, "createdAt", "updatedAt"

"SubProject": id, "parentId", name, status,
  "departmentBudget"(部門予算・メイン), "businessContent",
  "periodStart", "periodEnd", "createdAt", "updatedAt"
  ※ "parentId" = "Project".id（外部キー）

"SubProjectAssignee": id, "subProjectId", "userId", involvement, "skillLevel"
  ※ involvement: 'MAIN'(メイン) | 'SUB'(サブ) | 'ADVICE'(アドバイス)
  ※ skillLevel: 1(要サポート) | 2(自走可) | 3(リード可)

"User": id, name, email, department, role, "loginId", "createdAt", "updatedAt"

"Client": id, name, note, "createdAt"

"ProjectAssignee": id, "projectId", "userId",
  "businessLevel", "workloadLevel", "judgmentLevel"（旧データ用）

【クエリ例】
-- 決定案件の一覧（クライアント付き）
SELECT p.name, p."ownerDepartment", p."totalBudget", c.name AS "クライアント"
FROM "Project" p
JOIN "Client" c ON p."clientId" = c.id
WHERE p.status = 'good'

-- 部署別 全体予算・部門予算（決定案件）
SELECT p."ownerDepartment" AS 部署,
       SUM(p."totalBudget") AS 全体予算合計,
       SUM(sp."departmentBudget") AS 部門予算合計
FROM "Project" p
LEFT JOIN "SubProject" sp ON sp."parentId" = p.id
WHERE p.status = 'good'
GROUP BY p."ownerDepartment"
ORDER BY 部門予算合計 DESC

-- 担当者別 部門予算（売り上げ）ランキング
SELECT u.name AS 担当者, u.department AS 部署,
       SUM(sp."departmentBudget") AS 部門予算合計
FROM "User" u
JOIN "SubProjectAssignee" spa ON spa."userId" = u.id
JOIN "SubProject" sp ON spa."subProjectId" = sp.id
JOIN "Project" p ON sp."parentId" = p.id
WHERE p.status = 'good'
GROUP BY u.id, u.name, u.department
ORDER BY 部門予算合計 DESC

${DOMAIN_SQL_RULES}
${tableSqlInstruction}

【人名条件ルール】
- "User".name の一致は前方一致(LIKE)を優先する
- 例: 山田なら u.name LIKE '山田%'

【忙しさ比較ルール】
- 「忙しい」「負荷比較」などは件数COUNTではなく負荷指標を優先
- 担当者別の負荷は "ProjectAssignee"."businessLevel", "workloadLevel", "judgmentLevel" を使う
  workloadScore = pa."businessLevel" + pa."workloadLevel" + pa."judgmentLevel" * 1.5
- 担当者比較ではこの workloadScore の合計または平均で比較する

【質問】
${question}`;

      const generatedRawSql = await callGemini(sqlPrompt, apiKey);
      let sql = normalizeSql(generatedRawSql);
      ensureSelectOnly(sql);

      if (!hasExpectedStatusCondition(sql, question)) {
        const regeneratePrompt = `${sqlPrompt}

【追加指示】
今のSQLは用語ルールを満たしていません。用語ルールを厳守して再生成してください。`;
        sql = normalizeSql(await callGemini(regeneratePrompt, apiKey));
        ensureSelectOnly(sql);
      }

      let rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);

      if (rows.length === 0 && (includesDecidedKeyword(question) || includesProposalKeyword(question))) {
        const retryPrompt = `${sqlPrompt}

【追加指示】
0件でした。status条件の解釈ミスの可能性があります。
用語ルールを厳守し、status条件を明示してSQLを再生成してください。`;
        const retrySql = normalizeSql(await callGemini(retryPrompt, apiKey));
        ensureSelectOnly(retrySql);
        if (retrySql !== sql) {
          sql = retrySql;
          rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
        }
      }

      const summarizePrompt = `あなたは案件管理データの分析アシスタントです。
以下の質問とSQL結果をもとに、日本語で回答してください。

【回答フォーマットの厳守事項】
- 結論・数値を最初の1文で端的に述べること
- 補足が必要な場合は箇条書き3点以内に絞ること
- 見出し（##・###など）は使わないこと
- 回答全体は200字以内を目安にすること
${wantsTabularAnswer(question) ? "・表形式を希望しているため、結果が1件以上ある場合はMarkdown表を含めること（表以外の説明は最小限に）" : ""}
${wantsProjectListStyleTable(question) ? "・案件一覧形式は「状態/担当部署/担当者/クライアント/案件名/種別/業務内容/全体予算/部門予算/任意額/実施開始/実施終了/ステータス更新日/最終更新日」の列を優先すること" : ""}

【質問】
${question}

【SQL結果(JSON)】
${JSON.stringify(rows)}`;

      const answer = await callGemini(summarizePrompt, apiKey, geminiHistory);
      if (logId) {
        await prisma.aiQueryLog.update({ where: { id: logId }, data: { answer } });
      }
      return Response.json({ answer, mode: "A", sql, rowCount: rows.length });
    }

    let analysisPrompt: string;

    if (isLoadQuestion(question)) {
      // 負荷系質問：対象月を抽出してフィルタリング
      const targetMonth = extractTargetMonth(question);
      const loadSummary = await computeLoadSummary(targetMonth ?? undefined);

      const periodNote = targetMonth
        ? `※ ${targetMonth.label}に実施期間が重なる案件のみを対象にしています（期間終了済みの案件は除外）`
        : `※ 現時点で進行中の案件を対象にしています`;

      const loadContext = loadSummary.map((u) =>
        `${u.name}（${u.department}）: スコア${u.totalLoad} [${u.label}] ${u.subProjectCount}件` +
        (u.topAssignments.length > 0 ? `\n  担当: ${u.topAssignments.join(" / ")}` : "")
      ).join("\n");

      analysisPrompt = `あなたは案件管理データの分析アシスタントです。
以下の質問に対して、担当者別の負荷スコアデータをもとに日本語で回答してください。

負荷スコアの判定基準:
- 〜10: 余裕あり  /  11〜20: 通常稼働  /  21〜32: やや過多  /  33〜45: 高負荷  /  46以上: 過負荷

【回答フォーマットの厳守事項】
- 特定の人名が含まれる場合（個人指名）:
  **氏名（部署）** — スコアXX ／ 判定ラベル ／ X件
  を最初の1行に必ず出す。その後、担当案件をMarkdown表（案件名・終了月・スコア列）で表示する。
  終了月が記載されている場合は必ず表に含めること。

- 複数人 or 全体を問う場合:
  上位をMarkdown表（氏名・部署・スコア・判定・件数）で表示する。
  表の後に、スコア上位3人の担当案件を箇条書きで補足する。

- 「${periodNote}」の一文を回答の末尾に必ず添える。
- 見出し（##など）は使わない。

【質問】
${question}

【担当者別負荷サマリー（スコア降順・${targetMonth ? targetMonth.label + "対象" : "現時点"}）】
${loadContext}`;

    } else {
      // 通常の分析：案件JSONを渡す
      const projects = await prisma.project.findMany({
        where: { mergedIntoId: null },
        include: {
          client: { select: { id: true, name: true } },
          assignees: {
            include: { user: { select: { id: true, name: true, department: true, role: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      const compactProjects = projects.map((p) => ({
        id: p.id,
        name: p.name,
        client: p.client,
        status: p.status,
        proposalStatus: p.proposalStatus,
        projectStatus: p.projectStatus,
        projectType: p.projectType,
        certainty: p.certainty,
        businessContent: p.businessContent,
        totalBudget: p.totalBudget,
        departmentBudget: p.departmentBudget,
        optionalAmount: p.optionalAmount,
        ownerDepartment: p.ownerDepartment,
        proposalDate: p.proposalDate,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        statusUpdatedAt: p.statusUpdatedAt,
        assignees: p.assignees.map((a) => ({ ...a.user })),
      }));

      analysisPrompt = `あなたは案件管理データの分析アシスタントです。
以下の質問に対して、JSONデータを読み取り日本語で回答してください。

【回答フォーマットの厳守事項】
- 結論を最初の1〜2文で端的に述べること
- 理由・根拠は箇条書き3点以内に絞ること
- 見出し（##・###など）は使わないこと
- 「全体傾向」「偏り」「注意点」「次のアクション」などの固定見出しは不要
- 回答全体は300字以内を目安にすること
- アプリ内チャットなので、読みやすさを最優先にすること
${wantsTabularAnswer(question) ? "・表形式を求められた場合のみMarkdown表を使うこと（表以外の説明は最小限に）" : ""}
${wantsProjectListStyleTable(question) ? "・案件一覧形式は「状態/担当部署/担当者/クライアント/案件名/種別/業務内容/全体予算/部門予算/任意額/実施開始/実施終了/ステータス更新日/最終更新日」の列を優先すること" : ""}

【質問】
${question}

【案件データ(JSON)】
${JSON.stringify(compactProjects)}`;
    }

    const answer = await callGemini(analysisPrompt, apiKey, geminiHistory);
    if (logId) {
      await prisma.aiQueryLog.update({ where: { id: logId }, data: { answer } });
    }
    return Response.json({ answer, mode: "B" });
  } catch (error) {
    if (error instanceof GeminiApiError && error.status === 429) {
      return Response.json(
        {
          error: "Gemini APIの利用上限に達しました。少し待ってから再試行してください。",
          detail: error.message,
        },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : "回答生成に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
