import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === "\r" && !inQuotes)) {
      result.push(current.trim());
      current = "";
      if (c === "\r") break;
    } else if (c !== "\n" || inQuotes) {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "ファイルを選択してください" }, { status: 400 });

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return Response.json({ error: "CSVにデータ行がありません" }, { status: 400 });

    const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").toLowerCase().replace(/\s/g, ""));
    const passwordIdx = header.indexOf("password");
    const nameIdx = header.indexOf("name");
    const emailIdx = header.indexOf("email");
    const departmentIdx = header.indexOf("department");
    const roleIdx = header.indexOf("role");

    if (passwordIdx < 0 || nameIdx < 0 || emailIdx < 0 || departmentIdx < 0) {
      return Response.json({
        error: "CSVに password, name, email, department の列が必要です",
      }, { status: 400 });
    }

    const created: string[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const password = (cols[passwordIdx] ?? "").trim();
      const name = (cols[nameIdx] ?? "").trim();
      const emailVal = (cols[emailIdx] ?? "").trim().toLowerCase();
      const department = (cols[departmentIdx] ?? "1DCD").trim() || "1DCD";
      const role = roleIdx >= 0 ? (cols[roleIdx] ?? "staff").trim() : "staff";

      if (!password || !name || !emailVal) {
        errors.push(`${i + 1}行目: 必須項目（password, name, email）が不足しています`);
        continue;
      }

      const existing = await prisma.user.findUnique({ where: { email: emailVal } });
      if (existing) {
        errors.push(`${i + 1}行目: メールアドレス「${emailVal}」は既に使用されています`);
        continue;
      }

      await prisma.user.create({
        data: {
          loginId: emailVal,
          passwordHash: hashPassword(password),
          name,
          email: emailVal,
          department,
          role: role === "admin" ? "admin" : "staff",
        },
      });
      created.push(emailVal);
    }

    return Response.json({ ok: true, created: created.length, createdIds: created, errors });
  } catch (error) {
    console.error("CSV import failed", error);
    return Response.json({ error: "CSV取り込みに失敗しました" }, { status: 500 });
  }
}
