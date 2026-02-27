import { NextRequest } from "next/server";
import { findUserByEmail, verifyPassword, setSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return Response.json({ error: "メールアドレスとパスワードを入力してください" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "メールアドレスまたはパスワードが正しくありません" }, { status: 401 });
    }

    await setSession({
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      department: user.department,
      role: user.role as "admin" | "staff",
    });

    return Response.json({ ok: true, role: user.role });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[login error]", msg);
    return Response.json({ error: `サーバーエラー: ${msg}` }, { status: 500 });
  }
}
