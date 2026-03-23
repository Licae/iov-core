import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import type { TestCase } from "../../api/types";

type ManagementPageProps = {
  managementCategoryFilter: string;
  managementSecurityDomainFilter: string;
  managementAutomationFilter: string;
  managementSearchQuery: string;
  managementCategoryOptions: string[];
  managementSecurityDomainOptions: string[];
  managementFilteredTestCases: TestCase[];
  setManagementCategoryFilter: (value: string) => void;
  setManagementSecurityDomainFilter: (value: string) => void;
  setManagementAutomationFilter: (value: string) => void;
  setManagementSearchQuery: (value: string) => void;
  onOpenImport: () => void;
  onOpenCreate: () => void;
  onViewCase: (tc: TestCase) => void;
  onEditCase: (tc: TestCase) => void;
  onDeleteCase: (id: number) => void;
};

export const ManagementPage = ({
  managementCategoryFilter,
  managementSecurityDomainFilter,
  managementAutomationFilter,
  managementSearchQuery,
  managementCategoryOptions,
  managementSecurityDomainOptions,
  managementFilteredTestCases,
  setManagementCategoryFilter,
  setManagementSecurityDomainFilter,
  setManagementAutomationFilter,
  setManagementSearchQuery,
  onOpenImport,
  onOpenCreate,
  onViewCase,
  onEditCase,
  onDeleteCase,
}: ManagementPageProps) => {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">测试用例管理</h2>
          <p className="text-sm text-text-secondary">维护全球 V2X 与车载系统安全测试基准库。</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center justify-end">
          <select
            value={managementCategoryFilter}
            onChange={(e) => setManagementCategoryFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-28 focus:outline-none focus:border-accent transition-all"
          >
            <option value="All">全部类别</option>
            {managementCategoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select
            value={managementSecurityDomainFilter}
            onChange={(e) => setManagementSecurityDomainFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-32 focus:outline-none focus:border-accent transition-all"
          >
            <option value="All">全部安全分类</option>
            {managementSecurityDomainOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select
            value={managementAutomationFilter}
            onChange={(e) => setManagementAutomationFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-24 focus:outline-none focus:border-accent transition-all"
          >
            <option value="All">全部自动化</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors" size={14} />
            <input
              type="text"
              placeholder="搜索名称、类别、安全分类或工具..."
              value={managementSearchQuery}
              onChange={(e) => setManagementSearchQuery(e.target.value)}
              className="bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent transition-all"
            />
          </div>
          <button
            onClick={onOpenImport}
            className="px-4 py-2 rounded-lg border border-border text-xs font-bold uppercase hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Plus size={14} /> 批量导入
          </button>
          <button
            onClick={onOpenCreate}
            className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-[#4433EE] transition-colors"
          >
            <Plus size={14} /> 新建用例
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden table-shell">
        <table className="w-full text-left data-table">
          <thead>
            <tr className="border-b border-border bg-white/2">
              <th className="px-6 py-4 text-[10px] font-bold uppercase text-muted tracking-widest w-16">序号</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">类别</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">安全分类</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">名称</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">预期结果</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">工具</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">自动化</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">需求关联</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest">TARA关联</th>
              <th className="px-8 py-4 text-[10px] font-bold uppercase text-muted tracking-widest text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {managementFilteredTestCases.map((tc, index) => (
              <tr key={tc.id} className="hover:bg-white/2 transition-colors group">
                <td className="px-6 py-4 text-xs text-muted font-mono">
                  {index + 1}
                </td>
                <td className="px-8 py-4">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-muted">
                    {tc.category}
                  </span>
                </td>
                <td className="px-8 py-4">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {tc.security_domain || "未分类"}
                  </span>
                </td>
                <td className="px-8 py-4">
                  <div className="font-bold text-sm">{tc.title}</div>
                  <div className="text-[10px] text-muted truncate max-w-xs">{tc.protocol} • {tc.type}</div>
                </td>
                <td className="px-8 py-4 text-xs text-text-secondary max-w-sm">
                  <div className="line-clamp-2">{tc.expected_result || "-"}</div>
                </td>
                <td className="px-8 py-4 text-xs font-mono text-accent">{tc.test_tool || "-"}</td>
                <td className="px-8 py-4">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tc.automation_level === "A" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                    {tc.automation_level || "B"}
                  </span>
                </td>
                <td className="px-8 py-4 text-xs text-text-secondary">
                  {Number(tc.requirement_count || 0)}
                </td>
                <td className="px-8 py-4 text-xs text-text-secondary">
                  {Number(tc.tara_count || 0)}
                </td>
                <td className="px-8 py-4">
                  <div className="flex gap-2 justify-end opacity-100">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewCase(tc); }} className="p-1.5 hover:bg-white/10 rounded text-muted hover:text-white">
                      <Search size={14} />
                    </button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditCase(tc); }} className="p-1.5 hover:bg-white/10 rounded text-muted hover:text-white">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteCase(tc.id); }} className="p-1.5 hover:bg-white/10 rounded text-danger/50 hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
