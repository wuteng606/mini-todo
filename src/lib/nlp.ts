/**
 * 轻量中文自然语言解析：从「明天 3 点 提交周报」里拆出时间和标题。
 * 不追求覆盖所有说法，够日常快记就行。
 */

type Parsed = { title: string; dueAt: number | null };

const WEEK_MAP: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 中文数字 → 阿拉伯数字，支持「十」「十五」「二十三」「零五」 */
function cnToNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.endsWith("十")) return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN_NUM[a] ?? 0) * 10 + (CN_NUM[b] ?? 0);
  }
  if ([...s].every((ch) => ch in CN_NUM)) {
    return [...s].reduce((n, ch) => n * 10 + CN_NUM[ch], 0);
  }
  return NaN;
}

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

function addDays(day: Date, days: number) {
  const d = new Date(day);
  d.setDate(d.getDate() + days);
  return d;
}

const CN_TIME = "[零一二两三四五六七八九十]{1,3}";
const TIME_RE = new RegExp(
  `(\\d{1,2}|${CN_TIME})\\s*[点時时:：]\\s*(半|\\d{1,2}|${CN_TIME})?\\s*分?`,
);
const PERIOD_RE = /(凌晨|早上|上午|中午|下午|傍晚|晚上)/;

export function parseTask(raw: string): Parsed {
  const text = raw.trim();
  let day: Date | null = null;
  let dayWord = "";
  let dayEnd = 0;
  let hour: number | null = null;
  let minute = 0;
  const consumed: Array<[number, number]> = [];

  const eat = (m: RegExpMatchArray) => {
    consumed.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  };

  const foundDay = (m: RegExpMatchArray, make: () => Date) => {
    day = make();
    dayWord = m[0];
    dayEnd = (m.index ?? 0) + m[0].length;
    eat(m);
  };

  // 1. 日期
  const dayRules: Array<[RegExp, () => Date]> = [
    [/大后天/, () => addDays(todayStart(), 3)],
    [/后天/, () => addDays(todayStart(), 2)],
    [/明天|明日|明早|明晚/, () => addDays(todayStart(), 1)],
    [/今天|今日|今晚|今早/, () => todayStart()],
  ];

  for (const [re, make] of dayRules) {
    const m = text.match(re);
    if (m) { foundDay(m, make); break; }
  }

  if (!day) {
    // 下周三 / 本周五 / 周五 / 星期三
    const m = text.match(/(下{1,2}|本|这)?\s*(?:周|星期|礼拜)([一二三四五六日天])/);
    if (m) {
      const target = WEEK_MAP[m[2]];
      const base = todayStart();
      let date: Date;
      if (m[1]) {
        // 「本周 / 这周」按自然周（周一开头）算；「下周 / 下下周」再往后推
        const weekOffset = m[1] === "下" ? 1 : m[1] === "下下" ? 2 : 0;
        const monday = addDays(base, -((base.getDay() + 6) % 7) + weekOffset * 7);
        date = addDays(monday, (target + 6) % 7);
      } else {
        // 只说「周三」时取最近的那个周三（含今天）
        date = addDays(base, (target - base.getDay() + 7) % 7);
      }
      foundDay(m, () => date);
    }
  }

  // 2. 时间：下午 3 点 / 15:30 / 晚上八点 / 明晚八点半
  const timeM = text.match(TIME_RE);
  const periodM = text.match(PERIOD_RE);

  // 只有紧跟在日期 / 时间旁边的时段词才算时间的一部分，
  // 避免把标题里的「下午茶」「晚上」也吃掉。
  let period: string | null = null;
  if (periodM) {
    const ps = periodM.index ?? 0;
    const pe = ps + periodM[0].length;
    const timeStart = timeM?.index ?? 0;
    if (timeM && pe <= timeStart && text.slice(pe, timeStart).trim() === "") {
      period = periodM[1];
    } else if (!timeM && day && ps >= dayEnd && text.slice(dayEnd, ps).trim() === "") {
      period = periodM[1];
    } else if (!timeM && !day && ps === 0) {
      period = periodM[1];
    }
  }
  // 「明早 / 明晚 / 今早 / 今晚」本身自带时段
  if (!period && /早$/.test(dayWord)) period = "早上";
  if (!period && /晚$/.test(dayWord)) period = "晚上";

  if (timeM) {
    let h = cnToNum(timeM[1]);
    const rawMinute = timeM[2];
    const mm = rawMinute === "半" ? 30 : rawMinute ? cnToNum(rawMinute) : 0;
    if (!Number.isNaN(h)) {
      if (period === "凌晨" && h === 12) h = 0;
      else if ((period === "下午" || period === "晚上" || period === "傍晚") && h < 12) h += 12;
      else if (period === "中午" && h < 11) h += 12;
      hour = Math.min(23, h);
      minute = Number.isNaN(mm) ? 0 : Math.min(59, mm);
      eat(timeM);
      if (periodM && period === periodM[1]) eat(periodM);
    }
  } else if (period) {
    // 只说「下午 / 明晚」没给点 → 默认一个合理时间
    hour =
      period === "凌晨" ? 0
      : period === "中午" ? 12
      : period === "下午" ? 15
      : period === "晚上" || period === "傍晚" ? 20
      : 9;
    if (periodM && period === periodM[1]) eat(periodM);
  }

  if (hour !== null && !day) {
    const candidate = atTime(todayStart(), hour, minute);
    // 时间已过 → 顺延到明天
    day = candidate.getTime() < Date.now() ? addDays(todayStart(), 1) : todayStart();
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
