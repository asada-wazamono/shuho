"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

type HeaderProps = {
  department: string;
  name: string;
  isAdmin: boolean;
};

export function Header({ department, name, isAdmin }: HeaderProps) {
  const router = useRouter();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const menuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openMenu() {
    if (menuTimeout.current) clearTimeout(menuTimeout.current);
    setAdminMenuOpen(true);
  }

  function closeMenu() {
    menuTimeout.current = setTimeout(() => setAdminMenuOpen(false), 150);
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-6">
        <Link href={isAdmin ? "/admin" : "/mypage"} className="font-bold text-stone-800">
          週報・案件管理
        </Link>
        {isAdmin && (
          <nav className="hidden gap-4 sm:flex">
            <Link href="/admin" className="text-sm text-stone-600 hover:text-stone-900">
              案件一覧
            </Link>
            <Link href="/admin/summary" className="text-sm text-stone-600 hover:text-stone-900">
              数値サマリー
            </Link>
            {/* 管理ドロップダウン */}
            <div
              className="relative"
              onMouseEnter={openMenu}
              onMouseLeave={closeMenu}
            >
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
              >
                管理
                <span className="text-xs text-stone-400">▾</span>
              </button>
              {adminMenuOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-36 rounded border border-stone-200 bg-white shadow-md"
                  onMouseEnter={openMenu}
                  onMouseLeave={closeMenu}
                >
                  <Link
                    href="/admin/staff"
                    className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    部員管理
                  </Link>
                  <Link
                    href="/admin/clients"
                    className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    onClick={() => setAdminMenuOpen(false)}
                  >
                    クライアント管理
                  </Link>
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-stone-600">
          {department} / {name}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded bg-stone-200 px-3 py-1.5 text-sm hover:bg-stone-300"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
