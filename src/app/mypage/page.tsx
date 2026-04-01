import { MypageSummary } from "./MypageSummary";
import { ProjectTabs } from "./ProjectTabs";
import { ClientSelector } from "./ClientSelector";

export default function MypagePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-stone-800">マイページ</h1>
        <ClientSelector />
      </div>

      <MypageSummary />
      <ProjectTabs />
    </div>
  );
}
