import {
  BarChart3,
  BrainCircuit,
  Database,
  FileWarning,
  LayoutDashboard,
  Layers3,
  PlayCircle,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { SidebarItem } from "./app-shell-components";

export type AppView =
  | "dashboard"
  | "running"
  | "defects"
  | "assets"
  | "reports"
  | "management"
  | "suites"
  | "requirements"
  | "tara";

type AppSidebarProps = {
  view: AppView;
  testSuitesCount: number;
  activeExecutionTasksCount: number;
  onChangeView: (view: AppView) => void;
};

export const AppSidebar = ({
  view,
  testSuitesCount,
  activeExecutionTasksCount,
  onChangeView,
}: AppSidebarProps) => {
  return (
    <aside className="w-64 border-r border-border flex flex-col bg-bg z-20 app-sidebar">
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent rounded flex items-center justify-center">
            <Zap size={18} className="text-white" fill="white" />
          </div>
          <h1 className="text-lg font-bold tracking-tighter uppercase">IOV-CORE</h1>
        </div>
      </div>

      <div className="flex-1 py-4">
        <div className="px-8 mb-4 text-[10px] uppercase tracking-widest text-muted font-bold">平台功能</div>
        <nav className="space-y-1">
          <SidebarItem icon={LayoutDashboard} label="仪表盘" active={view === "dashboard"} onClick={() => onChangeView("dashboard")} />
          <SidebarItem icon={BrainCircuit} label="威胁分析 (TARA)" active={view === "tara"} onClick={() => onChangeView("tara")} />
          <SidebarItem icon={ShieldCheck} label="需求管理" active={view === "requirements"} onClick={() => onChangeView("requirements")} />
          <SidebarItem icon={Database} label="用例管理" active={view === "management"} onClick={() => onChangeView("management")} />
          <SidebarItem
            icon={Layers3}
            label="测试套件"
            badge={testSuitesCount ? String(testSuitesCount) : undefined}
            active={view === "suites"}
            onClick={() => onChangeView("suites")}
          />
          <SidebarItem
            icon={PlayCircle}
            label="仿真执行"
            badge={String(activeExecutionTasksCount)}
            active={view === "running"}
            onClick={() => onChangeView("running")}
          />
          <SidebarItem icon={FileWarning} label="缺陷日志" active={view === "defects"} onClick={() => onChangeView("defects")} />
          <SidebarItem icon={Database} label="测试资产" active={view === "assets"} onClick={() => onChangeView("assets")} />
          <SidebarItem icon={BarChart3} label="分析报告" active={view === "reports"} onClick={() => onChangeView("reports")} />
        </nav>

        <div className="px-8 mt-8 mb-4 text-[10px] uppercase tracking-widest text-muted font-bold">系统管理</div>
        <nav className="space-y-1">
          <SidebarItem icon={Users} label="团队成员" onClick={() => {}} />
          <SidebarItem icon={Settings} label="偏好设置" onClick={() => {}} />
        </nav>
      </div>
    </aside>
  );
};
