import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.user.deleteMany({
    where: { role: "staff" },
  });

  return Response.json({ ok: true, deleted: result.count });
}
