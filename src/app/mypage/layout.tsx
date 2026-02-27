import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/Header";

export default async function MypageLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?from=/mypage");
  if (session.role === "admin") redirect("/admin");

  return (
    <>
      <Header
        department={session.department}
        name={session.name}
        isAdmin={false}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
