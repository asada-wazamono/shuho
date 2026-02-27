import Link from "next/link";
import { MypageSummary } from "./MypageSummary";
import { ProjectTabs } from "./ProjectTabs";

export default function MypagePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-stone-800">マイページ</h1>
        <Link
          href="/mypage/projects/new"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          ＋新規案件
        </Link>
      </div>

      <MypageSummary />
      <ProjectTabs />
    </div>
  );
}
