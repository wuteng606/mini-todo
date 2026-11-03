const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

export function dayDiff(ts: number) {
  const today = startOfDay(Date.now());
  return Math.round((startOfDay(ts) - today) / 86_400_000);
}

export function timeText(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 任务右侧的时间文案：逾期 / 今天 18:00 / 明天 / 周三 / 6 月 3 日 */
export function dueText(ts: number): { text: string; tone: "normal" | "soon" | "overdue" } {
  const diff = dayDiff(ts);
  const hasTime = new Date(ts).getHours() + new Date(ts).getMinutes() > 0;

  if (diff < 0) return { text: "已逾期", tone: "overdue" };
  if (diff === 0) return { text: hasTime ? timeText(ts) : "今天", tone: "soon" };
  if (diff === 1) return { text: hasTime ? `明天 ${timeText(ts)}` : "明天", tone: "normal" };
  if (diff > 1 && diff < 7) {
    const d = new Date(ts);
    return { text: hasTime ? `${WEEK[d.getDay()]} ${timeText(ts)}` : WEEK[d.getDay()], tone: "normal" };
  }
  const d = new Date(ts);
  return { text: `${d.getMonth() + 1} 月 ${d.getDate()} 日`, tone: "normal" };
}

/** 头部标题下的副标题 */
export function dateLine() {
  const d = new Date();
  const h = d.getHours();
  const greeting = h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 19 ? "下午好" : "晚上好";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEK[d.getDay()]} · ${greeting}`;
}

export function fullDate() {
  const d = new Date();
  return `${WEEK[d.getDay()]}，${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 随机一句鼓励语 */
export function cheer(rate: number) {
  if (rate >= 1) return "全部完成，今天你超棒的 🎉";
  if (rate >= 0.6) return "已经过半啦，再坚持一下 ✨";
  if (rate > 0) return "慢慢来，一件一件就做完了 🌿";
  return "加油，今天也要元气满满呀 🌞";
}
