export function SettingsSheet({
  doneCount,
  onClear,
  onClose,
}: {
  doneCount: number;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>
        <div className="sub">Mini Todo · 本地优先，数据只在这台 Mac 上</div>

        <div className="sheet-row">
          <span className="k">快速记录</span>
          <kbd>⌘ ⇧ Space</kbd>
        </div>
        <div className="sheet-row">
          <span className="k">新建任务</span>
          <kbd>⌘ N</kbd>
        </div>
        <div className="sheet-row">
          <span className="k">搜索</span>
          <kbd>⌘ K</kbd>
        </div>
        <div className="sheet-row">
          <span className="k">关闭窗口</span>
          <kbd>⌘ W</kbd>
        </div>
        <div className="sheet-row">
          <span className="k">切换清单</span>
          <kbd>⌘ 1 – 4</kbd>
        </div>
        <div className="sheet-row">
          <span className="k">数据存储</span>
          <span style={{ fontSize: 11, color: "#8f8b9d" }}>本机 SQLite</span>
        </div>
        <div className="sheet-row">
          <span className="k">双击任务改名 · 拖动排序</span>
          <span style={{ fontSize: 11, color: "#8f8b9d" }}>鼠标操作</span>
        </div>
        <div className="sheet-row">
          <span className="k">到点提醒</span>
          <span style={{ fontSize: 11, color: "#8f8b9d" }}>系统通知</span>
        </div>

        <div className="sheet-actions">
          <button
            className="btn ghost"
            disabled={doneCount === 0}
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            清除已完成（{doneCount}）
          </button>
          <button className="btn primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}
