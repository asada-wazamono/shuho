import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const DOMAIN_SQL_RULES = `【用語ルール（厳守）】
- 決定案件 = Project.status = 'good'
- 提案案件 = Project.status IN ('undecided','bad')
- Bad案件 = Project.status = 'bad'
- 未定案件 = Project.status = 'undecided'
- 部門予算 = Project.departmentBudget
- 全体予算 = Project.totalBudget
- 任意額 = Project.optionalAmount
- クライアント名 = Client.name（JOIN）
- 担当者名 = User.name（ProjectAssignee と User をJOIN）

【重要】
- 「決定」「提案」を certainty や projectType で判定しないこと。必ず Project.status を使うこと。
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

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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
  const normalized = sql.toLowerCase().replace(/\s+/g, " ");
  if (includesDecidedKeyword(question)) {
    return /status\s*=\s*'good'/.test(normalized);
  }
  if (includesProposalKeyword(question)) {
    return /status\s+in\s*\(\s*'undecided'\s*,\s*'bad'\s*\)|status\s*!=\s*'good'|status\s*<>\s*'good'/.test(normalized);
  }
  return true;
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

  const body = (await request.json()) as { question?: string };
  const question = String(body.question ?? "").trim();
  if (!question) {
    return Response.json({ error: "質問を入力してください" }, { status: 400 });
  }

  try {
    const routingPrompt = `${ROUTING_RULES}

質問:
${question}`;

    const routeDecision = await callGemini(routingPrompt, apiKey);
    const route = routeDecision.trim() === "A" ? "A" : "B";

    await prisma.aiQueryLog.create({
      data: { userId: session.id, userName: session.name, question, mode: route },
    });

    if (route === "A") {
      const tableSqlInstruction = wantsProjectListStyleTable(question)
        ? `
【案件一覧表の列ルール】
案件の一覧を求められた場合は、可能な限り次の列をこの順番・この別名でSELECTしてください。
- status AS "状態"
- ownerDepartment AS "担当部署"
- client.name AS "クライアント"
- project.name AS "案件名"
- projectType AS "種別"
- businessContent AS "業務内容"
- totalBudget AS "全体予算"
- departmentBudget AS "部門予算"
- optionalAmount AS "任意額"
- periodStart AS "実施開始"
- periodEnd AS "実施終了"
- statusUpdatedAt AS "ステータス更新日"
- updatedAt AS "最終更新日"
担当者は ProjectAssignee と User をJOINして、"担当者" 列に「部署:氏名」を連結して入れてください。`
        : "";

      const sqlPrompt = `あなたはPostgreSQLのクエリ生成AIです。
以下のスキーマを元に、質問に答えるSELECT文を生成してください。
コードブロックなしで、SQLのみを返してください。
※PostgreSQL構文を使用すること（SQLite構文は使わないこと）。

【重要: テーブル名のルール】
テーブル名は必ずダブルクォートで囲むこと（PostgreSQLは大文字小文字を区別するため）。
- 正: FROM "Project" / JOIN "User" / JOIN "ProjectAssignee" / JOIN "Client"
- 誤: FROM project / FROM Project（クォートなし）

【スキーマ概要】
- "User": id, name, department, role
- "Client": id, name
- "Project": id, name, projectType, status, proposalStatus, projectStatus,
           totalBudget, departmentBudget, optionalAmount,
           ownerDepartment, statusUpdatedAt, clientId
- "ProjectAssignee": projectId, userId, businessLevel, workloadLevel, judgmentLevel

${DOMAIN_SQL_RULES}
${tableSqlInstruction}

【人名条件ルール】
- User.name の一致は完全一致(IN)より前方一致(LIKE)を優先する
- 例: 山田なら User.name LIKE '山田%'

【忙しさ比較ルール】
- 「忙しい」「負荷比較」などは、案件数COUNTではなく負荷指標を優先
- 担当者別の負荷は ProjectAssignee.businessLevel, ProjectAssignee.workloadLevel, ProjectAssignee.judgmentLevel を使う
  workloadScore = ProjectAssignee.businessLevel + ProjectAssignee.workloadLevel + ProjectAssignee.judgmentLevel * 1.5
- Project.businessLevel等はデフォルト値。担当者個別の負荷はProjectAssigneeを参照すること
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
以下の質問とSQL結果をもとに、日本語で簡潔に回答してください。
数値は読みやすく整理し、必要なら箇条書きにしてください。
${wantsTabularAnswer(question) ? "質問者は表形式を希望しています。結果が1件以上ある場合はMarkdown表を必ず含めてください。" : ""}
${wantsProjectListStyleTable(question) ? "質問者は『案件一覧の表みたいに』を希望しています。列名は可能な限り「状態/担当部署/担当者/クライアント/案件名/種別/業務内容/全体予算/部門予算/任意額/実施開始/実施終了/ステータス更新日/最終更新日」に合わせて表を作ってください。" : ""}

【質問】
${question}

【SQL結果(JSON)】
${JSON.stringify(rows)}`;

      const answer = await callGemini(summarizePrompt, apiKey);
      return Response.json({ answer, mode: "A", sql, rowCount: rows.length });
    }

    const projects = await prisma.project.findMany({
      where: { mergedIntoId: null },
      include: {
        client: { select: { id: true, name: true } },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, department: true, role: true },
            },
          },
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
      businessLevel: p.businessLevel,
      workloadLevel: p.workloadLevel,
      judgmentLevel: p.judgmentLevel,
      totalBudget: p.totalBudget,
      departmentBudget: p.departmentBudget,
      optionalAmount: p.optionalAmount,
      ownerDepartment: p.ownerDepartment,
      proposalDate: p.proposalDate,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      statusUpdatedAt: p.statusUpdatedAt,
      assignees: p.assignees.map((a) => ({
        ...a.user,
        businessLevel: a.businessLevel,
        workloadLevel: a.workloadLevel,
        judgmentLevel: a.judgmentLevel,
      })),
    }));

    const analysisPrompt = `あなたは案件管理データの分析アシスタントです。
以下の質問に対して、JSONデータを読み取り日本語で回答してください。
全体傾向、偏り、注意点、次のアクションを簡潔に整理してください。
${wantsTabularAnswer(question) ? "表形式を求められた場合は、結果をMarkdown表で出力してください。" : ""}
${wantsProjectListStyleTable(question) ? "案件一覧形式を求められた場合は「状態/担当部署/担当者/クライアント/案件名/種別/業務内容/全体予算/部門予算/任意額/実施開始/実施終了/ステータス更新日/最終更新日」の列を優先してください。" : ""}

【質問】
${question}

【案件データ(JSON)】
${JSON.stringify(compactProjects)}`;

    const answer = await callGemini(analysisPrompt, apiKey);
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
