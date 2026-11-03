import { useEffect, useRef, useState } from "react";
import { TAGS, TAG_CLASS, type TagName, type Task } from "../lib/types";

export function TaskEditor({
  task,
  onSave,
  onDelete,
  onClose,
}: {
  task: Task;
  onSave: (patch: { title: string; tag: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [tag, setTag] = useState<TagName>((task.tag as TagName) ?? "生活");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const clean = title.trim();
    if (!clean) return;
    onSave({ title: clean, tag });
  };

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet edit-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>编辑任务</h3>
        <div className="sub">改标题或换个分类，回车保存</div>

        <div className="edit-field">
          <input
            ref={inputRef}
            value={title}
            placeholder="任务标题"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
          />
        </div>

        <div className="edit-tags">
          {TAGS.map((t) => (
            <button
              key={t}
              className={`tag ${TAG_CLASS[t]} tag-pick${tag === t ? " on" : ""}`}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="sheet-actions">
          <button className="btn ghost danger" onClick={onDelete}>删除</button>
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit} disabled={!title.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
