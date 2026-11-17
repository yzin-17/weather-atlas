import type { Locale } from './types.ts';
interface AnswerCopy {
  preview: string;
  unsupported: string;
  unavailable: string;
  partial: string;
  now: string;
  hour: string;
  week: string;
  rain: (time: string, p: string) => string;
  warm: (time: string, t: string) => string;
  cold: (time: string, t: string) => string;
  temp: (start: string, end: string, lo: string, hi: string) => string;
  walk: (time: string, t: string, p: string) => string;
  current: (t: string) => string;
  day: (date: string, lo: string, hi: string) => string;
  hourlyEnd: (range: string) => string;
}
// Answers are localized here after the planner chooses a supported calculation.
// All temperatures and probabilities passed to these functions come from the snapshot.
export const answerText: Record<Locale, AnswerCopy> = {
  'zh-Hans': {
    preview: '规则预览',
    unsupported:
      '可以问城市天气、气温、降水、穿衣、户外活动、晾衣和防晒，或比较两城温度与降水。当前未提供风速、湿度、空气质量、降水总量和历史天气数据。',
    unavailable: '这份预报没有完整覆盖该时段，请缩短范围或换一个时间。',
    partial: '部分时段缺少所需指标，请换一个时段。',
    now: '当前',
    hour: '逐小时预报',
    week: '按当地日期的逐日预报',
    rain: (time, p) =>
      `所选时段中，${time} 的降水概率最高，为 ${p}%。${Number(p) >= 50 ? '出门建议带伞。' : '仍有下雨的可能，可按行程决定是否带伞。'}`,
    warm: (time, t) => `所选时段最暖的是 ${time}，预计 ${t}°C。`,
    cold: (time, t) => `所选时段最凉的是 ${time}，预计 ${t}°C。`,
    temp: (start, end, lo, hi) => `${start} 至 ${end} 的预报气温为 ${lo} 至 ${hi}°C。`,
    walk: (time, t, p) =>
      `按降水概率最低、再按气温最接近 20°C 排序，推荐 ${time}，预计 ${t}°C，降水概率 ${p}%。`,
    current: (t) => `当前预报气温为 ${t}°C。`,
    day: (date, lo, hi) => `${date}：${lo} 至 ${hi}°C`,
    hourlyEnd: (range) => `精确到小时的数据覆盖 ${range}。`,
  },
  'zh-Hant': {
    preview: '規則預覽',
    unsupported:
      '可以詢問城市天氣、氣溫、降水、穿衣、戶外活動、晾衣和防曬，或比較兩城氣溫與降水。目前未提供風速、濕度、空氣品質、降水總量和歷史天氣資料。',
    unavailable: '這份預報未完整涵蓋該時段，請縮短範圍或改選時間。',
    partial: '部分時段缺少所需指標，請改選時段。',
    now: '目前',
    hour: '逐時預報',
    week: '依當地日期的逐日預報',
    rain: (time, p) =>
      `所選時段中，${time} 的降水機率最高，為 ${p}%。${Number(p) >= 50 ? '出門建議帶傘。' : '仍有下雨的可能，可依行程決定是否帶傘。'}`,
    warm: (time, t) => `所選時段最暖的是 ${time}，預計 ${t}°C。`,
    cold: (time, t) => `所選時段最涼的是 ${time}，預計 ${t}°C。`,
    temp: (start, end, lo, hi) => `${start} 至 ${end} 的預報氣溫為 ${lo} 至 ${hi}°C。`,
    walk: (time, t, p) =>
      `依降水機率最低、再依氣溫最接近 20°C 排序，推薦 ${time}，預計 ${t}°C，降水機率 ${p}%。`,
    current: (t) => `目前預報氣溫為 ${t}°C。`,
    day: (date, lo, hi) => `${date}：${lo} 至 ${hi}°C`,
    hourlyEnd: (range) => `逐時資料涵蓋 ${range}。`,
  },
  en: {
    preview: 'Rules preview',
    unsupported:
      'Ask about city forecasts, temperature, rain, clothing, outdoor activities, laundry or sun protection, or compare temperature and rain in two cities. Wind, humidity, air quality, rainfall totals and historical data are unavailable.',
    unavailable:
      'This forecast does not cover the whole requested period. Try a shorter or different time range.',
    partial: 'Some readings are missing for that period. Try a different window.',
    now: 'Now',
    hour: 'Hourly forecast',
    week: 'Daily outlook in local time',
    rain: (time, p) =>
      `The highest chance of precipitation in that window is ${p}% at ${time}. ${Number(p) >= 50 ? 'It would be sensible to carry an umbrella.' : 'A shower is still possible; consider how long you will be outdoors.'}`,
    warm: (time, t) => `The warmest hour in that window is ${time}, at ${t}°C.`,
    cold: (time, t) => `The coolest hour in that window is ${time}, at ${t}°C.`,
    temp: (start, end, lo, hi) =>
      `From ${start} to ${end}, the forecast ranges from ${lo} to ${hi}°C.`,
    walk: (time, t, p) =>
      `Prioritizing the lowest rain chance, then temperatures closest to 20°C, the best hour is ${time}: ${t}°C and a ${p}% chance of precipitation.`,
    current: (t) => `The current forecast temperature is ${t}°C.`,
    day: (date, lo, hi) => `${date}: ${lo} to ${hi}°C`,
    hourlyEnd: (range) => `Hourly data covers ${range}.`,
  },
  ko: {
    preview: '규칙 기반 미리보기',
    unsupported:
      '도시 날씨, 기온, 강수, 옷차림, 야외 활동, 빨래, 햇빛 차단 또는 두 도시의 기온과 강수 비교를 물어보세요. 풍속, 습도, 대기질, 강수량과 과거 자료는 제공하지 않습니다.',
    unavailable: '예보가 요청한 시간대 전체를 포함하지 않습니다. 다른 시간대를 선택해 주세요.',
    partial: '해당 시간대의 일부 자료가 없습니다. 다른 시간대를 선택해 주세요.',
    now: '현재',
    hour: '시간별 예보',
    week: '현지 날짜 기준 일별 예보',
    rain: (time, p) =>
      `선택한 시간대에는 ${time}의 강수 확률이 ${p}%로 가장 높습니다. ${Number(p) >= 50 ? '외출할 때 우산을 챙기세요.' : '비가 올 가능성이 있으니 외출 시간에 따라 우산을 준비하세요.'}`,
    warm: (time, t) => `선택한 시간대 중 가장 따뜻한 때는 ${time}이며 예상 기온은 ${t}°C입니다.`,
    cold: (time, t) => `선택한 시간대 중 가장 서늘한 때는 ${time}이며 예상 기온은 ${t}°C입니다.`,
    temp: (start, end, lo, hi) => `${start}부터 ${end}까지 예상 기온은 ${lo}~${hi}°C입니다.`,
    walk: (time, t, p) =>
      `강수 확률이 가장 낮고 기온이 20°C에 가까운 시간을 우선하면 ${time}이 좋습니다. 예상 기온은 ${t}°C, 강수 확률은 ${p}%입니다.`,
    current: (t) => `현재 예보 기온은 ${t}°C입니다.`,
    day: (date, lo, hi) => `${date}: ${lo}~${hi}°C`,
    hourlyEnd: (range) => `시간별 자료 범위는 ${range}입니다.`,
  },
};
