import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.department !== undefined) data.department = body.department ? String(body.department) : null;
  if (body.note !== undefined) data.note = body.note ? String(body.note) : null;

  const client = await prisma.client.update({
    where: { id },
    data: data as never,
  });
  return Response.json(client);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const linked = await prisma.project.count({ where: { clientId: id } });
  if (linked > 0) {
    await prisma.client.update({
      where: { id },
      data: { disabledAt: new Date() },
    });
    return Response.json({ ok: true, disabled: true });
  }
  await prisma.client.delete({ where: { id } });
  return Response.json({ ok: true });
}
