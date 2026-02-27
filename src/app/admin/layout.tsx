import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/Header";

export default async function AdminLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?from=/admin");
  if (session.role !== "admin") redirect("/mypage");

  return (
    <>
      <Header
        department={session.department}
        name={session.name}
        isAdmin={true}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
