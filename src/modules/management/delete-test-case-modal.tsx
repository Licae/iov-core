import { AnimatePresence, motion } from "motion/react";

type DeleteTestCaseCandidate = {
  id: number;
  title: string;
};

type DeleteTestCaseModalProps = {
  deleteTestCaseCandidate: DeleteTestCaseCandidate | null;
  isDeletingTestCase: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export const DeleteTestCaseModal = ({
  deleteTestCaseCandidate,
  isDeletingTestCase,
  onClose,
  onConfirm,
}: DeleteTestCaseModalProps) => {
  return (
    <AnimatePresence>
      {deleteTestCaseCandidate ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => {
            if (!isDeletingTestCase) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="glass-card w-full max-w-md rounded-2xl bg-card p-6 modal-surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-lg font-bold">确认删除测试用例</div>
            <div className="mt-3 text-sm text-text-secondary leading-relaxed">
              即将删除
              <span className="mx-1 font-semibold text-text-primary">{deleteTestCaseCandidate.title}</span>
              ，删除后无法恢复。
            </div>
            <div className="mt-2 text-xs text-muted">关联需求/TARA 关系会一并解除。</div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingTestCase}
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm font-bold text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeletingTestCase}
                onClick={() => void onConfirm()}
                className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold hover:bg-danger/90 transition-colors disabled:opacity-50"
              >
                {isDeletingTestCase ? "删除中..." : "确认删除"}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
