import { Fragment } from "react";
import { BrainCircuit } from "lucide-react";
import { motion } from "motion/react";
import type { Defect } from "../../api/types";

type DefectsPageProps = {
  defects: Defect[];
  defectSummary: Record<string, number>;
  page: number;
  total: number;
  totalPages: number;
  isFetching?: boolean;
  analyzingDefectId: string | null;
  defectAnalysis: Record<string, string>;
  onAnalyzeDefect: (defect: Defect) => void;
  onChangePage: (page: number) => void;
  onExportReport: () => void;
};

const getSeverityBadgeClass = (severity: string) => {
  if (severity === "Critical") return "bg-danger/20 text-danger border border-danger/30";
  if (severity === "Major") return "bg-warning/20 text-warning border border-warning/30";
  return "bg-accent/20 text-accent border border-accent/30";
};

export const DefectsPage = ({
  defects,
  defectSummary,
  page,
  total,
  totalPages,
  isFetching = false,
  analyzingDefectId,
  defectAnalysis,
  onAnalyzeDefect,
  onChangePage,
  onExportReport,
}: DefectsPageProps) => {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold mb-2">缺陷与诊断日志</h2>
          <p className="text-sm text-text-secondary">从测试中捕获的 DTC 故障码与安全漏洞。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onExportReport} className="px-4 py-2 rounded-lg bg-danger text-white text-xs font-bold uppercase">导出报告</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border-l-4 border-danger">
          <div className="text-[10px] font-bold text-danger uppercase mb-1">致命 (Critical)</div>
          <div className="text-3xl font-bold">{String(defectSummary.Critical || 0).padStart(2, "0")}</div>
          <div className="text-[10px] text-muted mt-2">需要立即修复的安全漏洞</div>
        </div>
        <div className="glass-card p-6 border-l-4 border-warning">
          <div className="text-[10px] font-bold text-warning uppercase mb-1">严重 (Major)</div>
          <div className="text-3xl font-bold">{String(defectSummary.Major || 0).padStart(2, "0")}</div>
          <div className="text-[10px] text-muted mt-2">影响核心功能的逻辑错误</div>
        </div>
        <div className="glass-card p-6 border-l-4 border-accent">
          <div className="text-[10px] font-bold text-accent uppercase mb-1">一般 (Minor)</div>
          <div className="text-3xl font-bold">{String(defectSummary.Minor || 0).padStart(2, "0")}</div>
          <div className="text-[10px] text-muted mt-2">非关键性的显示或性能问题</div>
        </div>
      </div>

      <div className="glass-card overflow-hidden table-shell">
        <table className="w-full text-left data-table">
          <thead>
            <tr className="bg-white/[0.02] text-[10px] uppercase tracking-widest font-bold text-muted">
              <th className="py-4 px-8 border-b border-border">缺陷 ID</th>
              <th className="py-4 px-4 border-b border-border">描述</th>
              <th className="py-4 px-4 border-b border-border">来源模块</th>
              <th className="py-4 px-4 border-b border-border">严重程度</th>
              <th className="py-4 px-4 border-b border-border">状态</th>
              <th className="py-4 px-4 border-b border-border">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {defects.map((defect) => (
              <Fragment key={defect.id}>
                <tr className="hover:bg-white/[0.01] transition-colors">
                  <td className="py-4 px-8 font-mono text-xs font-bold text-accent">{defect.id}</td>
                  <td className="py-4 px-4 text-sm font-medium">{defect.description}</td>
                  <td className="py-4 px-4 text-xs text-muted">{defect.module}</td>
                  <td className="py-4 px-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${getSeverityBadgeClass(defect.severity)}`}>
                      {defect.severity}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-xs font-bold uppercase">{defect.status}</td>
                  <td className="py-4 px-4">
                    <button
                      onClick={() => onAnalyzeDefect(defect)}
                      disabled={analyzingDefectId === defect.id}
                      className="flex items-center gap-2 text-accent hover:text-white transition-colors text-[10px] font-bold uppercase"
                    >
                      {analyzingDefectId === defect.id ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                          <BrainCircuit size={14} />
                        </motion.div>
                      ) : <BrainCircuit size={14} />}
                      AI 诊断
                    </button>
                  </td>
                </tr>
                {defectAnalysis[defect.id] ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-4 bg-accent/5 border-y border-accent/10">
                      <div className="flex gap-4">
                        <BrainCircuit size={20} className="text-accent shrink-0 mt-1" />
                        <div className="text-xs text-text-secondary leading-relaxed">
                          <div className="font-bold text-accent mb-2 uppercase tracking-widest">AI 智能分析报告</div>
                          <div className="whitespace-pre-wrap break-words">{defectAnalysis[defect.id]}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {defects.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted italic">未发现缺陷记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="flex items-center justify-between gap-4 px-8 py-4 border-t border-border bg-white/[0.02]">
          <div className="text-xs text-muted">
            共 {total} 条缺陷，当前第 {Math.max(page, 1)} / {Math.max(totalPages, 1)} 页
            {isFetching ? " · 正在刷新..." : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangePage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-2 rounded-lg border border-border text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <button
              onClick={() => onChangePage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-2 rounded-lg border border-border text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
