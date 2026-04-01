import { Bell, ChevronRight, Moon, Search, Sun } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppView } from "./app-sidebar";

type AppTopbarProps = {
  view: AppView;
  theme: "dark" | "light";
  setTheme: Dispatch<SetStateAction<"dark" | "light">>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
};

const currentViewLabelMap: Record<AppView, string> = {
  dashboard: "仪表盘",
  requirements: "需求管理",
  tara: "威胁分析",
  management: "用例管理",
  suites: "测试套件",
  running: "仿真执行",
  defects: "缺陷日志",
  assets: "测试资产",
  reports: "分析报告",
};

export const AppTopbar = ({
  view,
  theme,
  setTheme,
  searchQuery,
  setSearchQuery,
}: AppTopbarProps) => {
  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur-md z-10 app-topbar">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-secondary">平台</span>
        <ChevronRight size={14} className="text-muted" />
        <span className="text-white font-medium">{currentViewLabelMap[view]}</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <div className="theme-toggle-glow" />
          <div className="segmented-control">
            <div
              className="segmented-thumb"
              style={{ transform: theme === "dark" ? "translateX(0)" : "translateX(calc(100% + 4px))" }}
            />
            <button
              onClick={() => setTheme("dark")}
              className={`segmented-option ${theme === "dark" ? "is-active" : ""}`}
            >
              <Moon size={14} />
              <span>深色</span>
            </button>
            <button
              onClick={() => setTheme("light")}
              className={`segmented-option ${theme === "light" ? "is-active" : ""}`}
            >
              <Sun size={14} />
              <span>浅色</span>
            </button>
          </div>
        </div>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={16} />
          <input
            type="text"
            placeholder="搜索 ECU、VIN、DTC..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="bg-card border border-border rounded-lg pl-10 pr-4 py-1.5 text-xs w-64 focus:outline-none focus:border-accent transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
            <span className="text-[10px] bg-border px-1 rounded text-text-secondary">⌘</span>
            <span className="text-[10px] bg-border px-1 rounded text-text-secondary">K</span>
          </div>
        </div>
        <button className="text-text-secondary hover:text-white transition-colors">
          <Bell size={20} />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent to-sky-400" />
      </div>
    </header>
  );
};
