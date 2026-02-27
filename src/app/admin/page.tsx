import { AdminProjectList } from "./AdminProjectList";
import { AdminAIChat } from "./AdminAIChat";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <AdminAIChat />
      <h1 className="text-xl font-bold text-stone-800">案件一覧（管理者）</h1>
      <AdminProjectList />
    </div>
  );
}
