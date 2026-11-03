/**
 * 轻量中文自然语言解析：从「明天 3 点 提交周报」里拆出时间和标题。
 * 不追求覆盖所有说法，够日常快记就行。
 */

type Parsed = { title: string; dueAt: number | null };

const WEEK_MAP: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

function atTime(day: Date, hour: number, minute: number) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseTask(raw: string): Parsed {
  let text = raw.trim();
  let day: Date | null = null;
  let hour: number | null = null;
  let minute = 0;
  const consumed: Array<[number, number]> = [];

  const eat = (m: RegExpMatchArray) => {
    consumed.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  };

  // 1. 日期
  const dayRules: Array<[RegExp, () => Date]> = [
    [/大后天/, () => { const d = todayStart(); d.setDate(d.getDate() + 3); return d; }],
    [/后天/, () => { const d = todayStart(); d.setDate(d.getDate() + 2); return d; }],
    [/明天|明日|明早|明晚/, () => { const d = todayStart(); d.setDate(d.getDate() + 1); return d; }],
    [/今天|今日|今晚|今早/, () => todayStart()],
  ];

  for (const [re, make] of dayRules) {
    const m = text.match(re);
    if (m) { day = make(); eat(m); break; }
  }

  if (!day) {
    // 下周三 / 本周五 / 周五 / 星期三
    const m = text.match(/(下{1,2}|本|这)?\s*(?:周|星期|礼拜)([一二三四五六日天])/);
    if (m) {
      const target = WEEK_MAP[m[2]];
      const base = todayStart();
      const cur = base.getDay();
      let delta = (target - cur + 7) % 7;
      if (m[1]?.startsWith("下")) delta += 7;
      else if (delta === 0) delta = 0;
      const d = new Date(base);
      d.setDate(d.getDate() + delta);
      day = d;
      eat(m);
    }
  }

  // 2. 时间：下午 3 点 / 15:30 / 晚上八点
  const cnNum: Record<string, number> = {
    零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const cnToNum = (s: string) => {
    if (/^\d+$/.test(s)) return Number(s);
    if (s === "十") return 10;
    if (s.startsWith("十")) return 10 + (cnNum[s[1]] ?? 0);
    if (s.endsWith("十")) return (cnNum[s[0]] ?? 0) * 10;
    if (s.includes("十")) {
      const [a, b] = s.split("十");
      return (cnNum[a] ?? 0) * 10 + (cnNum[b] ?? 0);
    }
    return cnNum[s] ?? NaN;
  };

  const periodRe = /(凌晨|早上|上午|中午|下午|傍晚|晚上)/;
  const periodM = text.match(periodRe);
  const period = periodM?.[1] ?? null;

  const timeM = text.match(/(\d{1,2}|[一二两三四五六七八九十]{1,2})\s*[点時时:：]\s*(\d{1,2}|[一二三四五六七八九十]{1,2})?\s*分?/);
  if (timeM) {
    let h = cnToNum(timeM[1]);
    const mm = timeM[2] ? cnToNum(timeM[2]) : 0;
    if (!Number.isNaN(h)) {
      if ((period === "下午" || period === "晚上" || period === "傍晚") && h < 12) h += 12;
      if (period === "中午" && h < 11) h += 12;
      hour = Math.min(23, h);
      minute = Number.isNaN(mm) ? 0 : Math.min(59, mm);
      eat(timeM);
      if (periodM) eat(periodM);
    }
  } else if (periodM) {
    // 只说「下午」没给点 → 默认 15:00
    hour = periodM[1] === "下午" ? 15 : periodM[1] === "晚上" ? 20 : periodM[1] === "中午" ? 12 : 9;
    eat(periodM);
  }

  if (hour !== null && !day) {
    const candidate = atTime(todayStart(), hour, minute);
    // 时间已过 → 顺延到明天
    day = candidate.getTime() < Date.now() ? (() => { const d = todayStart(); d.setDate(d.getDate() + 1); return d; })() : todayStart();
  }

  // 3. 清理标题
  let title = text;
  consumed
    .sort((a, b) => b[0] - a[0])
    .forEach(([s, e]) => { title = title.slice(0, s) + title.slice(e); });
  title = title.replace(/\s{2,}/g, " ").replace(/^[\s,，、]+|[\s,，、]+$/g, "").trim();

  let dueAt: number | null = null;
  if (day) {
    const d = new Date(day);
    if (hour !== null) {
      d.setHours(hour, minute, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    dueAt = d.getTime();
  }

  return { title: title || raw.trim(), dueAt };
}
