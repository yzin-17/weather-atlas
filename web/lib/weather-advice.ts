import type { AdviceIntent, AskResult, HourWeather, Locale } from './types.ts';
import { condition } from './ui-text.ts';
import { isFiniteNumber as finite } from './validation.ts';

export const adviceIntents: AdviceIntent[] = [
  'clothing',
  'outdoor',
  'laundry',
  'sun',
  'conditions',
];
export const isAdviceIntent = (value: unknown): value is AdviceIntent =>
  adviceIntents.some((intent) => intent === value);
export function adviceIntent(question: string): AdviceIntent | null {
  if (/laundry|dry clothes|晾衣|晒衣|曬衣|洗衣|빨래/i.test(question)) return 'laundry';
  if (
    /clothing|wear|dress|衣服|穿衣|穿什么|穿什麼|外套|短袖|长袖|長袖|옷|입을|입어|겉옷/i.test(
      question,
    )
  )
    return 'clothing';
  if (
    /\bsun(?:screen|burn| protection)?\b|\buv\b|紫外线|紫外線|防晒|防曬|遮阳|遮陽|자외선|자외선차단|선크림/i.test(
      question,
    )
  )
    return 'sun';
  if (
    /outdoor|running|run\b|cycling|bike|hiking|picnic|户外|戶外|跑步|骑行|騎行|骑车|騎車|登山|露营|露營|野餐|出游|出遊|야외|달리기|러닝|자전거|등산|소풍/i.test(
      question,
    )
  )
    return 'outdoor';
  if (
    /conditions|snow|fog|thunder|晴|阴|陰|多云|多雲|雾|霧|下雪|降雪|雷雨|눈이|안개|천둥/i.test(
      question,
    )
  )
    return 'conditions';
  return null;
}

const copy = {
  'zh-Hans': {
    facts: (lo: string, hi: string, sky: string) => `气温 ${lo}–${hi}°C；天气：${sky}。`,
    rain: (p: string) => `时段内最高降水概率 ${p}%。`,
    missing: '降水概率缺失，不能据此判断是否会下雨。',
    cold: '建议厚外套并分层穿着，注意保暖。',
    cool: '建议长袖搭配外套，方便增减。',
    mild: '建议轻薄长袖，或短袖搭配薄外套。',
    warm: '可考虑轻薄、透气的衣物。',
    layers: '温差较大，建议携带可增减的外层。',
    umbrella: '出门建议备伞及防雨外层。',
    storm: '预报有雷雨或较强雨雪，建议调整户外安排，优先室内活动。',
    wet: '预报有降水现象或降水概率较高，跑步、骑行或出游可优先改到室内或另选时段。',
    extreme: '气温偏高或偏低，建议减少长时间户外活动。',
    outdoor: '从温度和降水看，可考虑一般户外活动；出发前留意天气变化。',
    laundryWet: '建议室内晾晒，避免衣物被雨雪打湿。',
    laundryDry: '可考虑室外晾晒；当前没有湿度、风速数据，无法判断晾干速度。',
    sun: '当前预报未包含紫外线指数，无法判断防晒等级。如白天外出，可按行程准备遮阳用品。',
    snow: (seen: boolean) => (seen ? '所选时段预报有降雪。' : '所选时段预报未显示降雪。'),
    thunder: (seen: boolean) => (seen ? '所选时段预报有雷雨。' : '所选时段预报未显示雷雨。'),
    unknown: '部分天气现象未知，无法完整判断是否有降雪或雷雨。',
  },
  'zh-Hant': {
    facts: (lo: string, hi: string, sky: string) => `氣溫 ${lo}–${hi}°C；天氣：${sky}。`,
    rain: (p: string) => `時段內最高降水機率 ${p}%。`,
    missing: '降水機率缺失，無法據此判斷是否下雨。',
    cold: '建議厚外套並分層穿著，注意保暖。',
    cool: '建議長袖搭配外套，方便增減。',
    mild: '建議輕薄長袖，或短袖搭配薄外套。',
    warm: '可考慮輕薄、透氣的衣物。',
    layers: '溫差較大，建議攜帶可增減的外層。',
    umbrella: '外出建議備傘及防雨外層。',
    storm: '預報有雷雨或較強雨雪，建議調整戶外安排，優先室內活動。',
    wet: '預報有降水現象或降水機率較高，跑步、騎行或出遊可優先改到室內或另選時段。',
    extreme: '氣溫偏高或偏低，建議減少長時間戶外活動。',
    outdoor: '從氣溫和降水看，可考慮一般戶外活動；出發前留意天氣變化。',
    laundryWet: '建議室內晾曬，避免衣物被雨雪打濕。',
    laundryDry: '可考慮室外晾曬；目前沒有濕度、風速資料，無法判斷晾乾速度。',
    sun: '目前預報未包含紫外線指數，無法判斷防曬等級。如白天外出，可依行程準備遮陽用品。',
    snow: (seen: boolean) => (seen ? '所選時段預報有降雪。' : '所選時段預報未顯示降雪。'),
    thunder: (seen: boolean) => (seen ? '所選時段預報有雷雨。' : '所選時段預報未顯示雷雨。'),
    unknown: '部分天氣現象未知，無法完整判斷是否有降雪或雷雨。',
  },
  en: {
    facts: (lo: string, hi: string, sky: string) =>
      `Temperature ${lo}–${hi}°C; conditions: ${sky}.`,
    rain: (p: string) => `Highest precipitation probability in this window: ${p}%.`,
    missing: 'Precipitation probability is missing, so rain likelihood cannot be assessed.',
    cold: 'Consider a thick outer layer and layered clothing to keep warm.',
    cool: 'Consider long sleeves and a jacket that you can remove.',
    mild: 'Consider a light long-sleeved top, or a T-shirt with a light jacket.',
    warm: 'Consider light, breathable clothing.',
    layers: 'The temperature range is large; bring a removable outer layer.',
    umbrella: 'Bring an umbrella and a rain-resistant outer layer.',
    storm:
      'Thunderstorms or heavier rain or snow are forecast. Adjust outdoor plans and favor indoor activities.',
    wet: 'Precipitation is forecast or its probability is fairly high. Consider indoor alternatives or another time for running, cycling or outings.',
    extreme: 'Temperatures are high or low; consider shorter outdoor activities.',
    outdoor:
      'Temperature and precipitation support considering ordinary outdoor activities; check for changes before leaving.',
    laundryWet: 'Consider drying laundry indoors to avoid rain or snow.',
    laundryDry:
      'Outdoor drying may be an option. Humidity and wind data are unavailable, so drying speed cannot be estimated.',
    sun: 'This forecast does not include a UV index, so a sun-protection level cannot be assessed. For daytime outings, consider shade or sun-protection items appropriate to your plans.',
    snow: (seen: boolean) =>
      seen ? 'Snow is forecast in this window.' : 'The forecast does not show snow in this window.',
    thunder: (seen: boolean) =>
      seen
        ? 'Thunderstorms are forecast in this window.'
        : 'The forecast does not show thunderstorms in this window.',
    unknown:
      'Some weather conditions are unknown, so snow or thunderstorms cannot be fully assessed.',
  },
  ko: {
    facts: (lo: string, hi: string, sky: string) => `기온 ${lo}–${hi}°C, 날씨: ${sky}.`,
    rain: (p: string) => `해당 시간대의 최고 강수 확률은 ${p}%입니다.`,
    missing: '강수 확률 자료가 없어 비가 올 가능성을 판단할 수 없습니다.',
    cold: '두꺼운 겉옷과 여러 겹의 옷으로 보온을 준비하세요.',
    cool: '긴소매와 벗기 쉬운 겉옷을 고려하세요.',
    mild: '얇은 긴소매 또는 반소매에 가벼운 겉옷을 고려하세요.',
    warm: '가볍고 통기성 있는 옷을 고려하세요.',
    layers: '기온 차가 크므로 벗고 입기 쉬운 겉옷을 챙기세요.',
    umbrella: '우산과 비를 막을 겉옷을 챙기세요.',
    storm:
      '뇌우 또는 강한 비나 눈이 예보되어 있습니다. 야외 일정을 조정하고 실내 활동을 우선 고려하세요.',
    wet: '강수가 예보되거나 강수 확률이 높습니다. 달리기, 자전거, 나들이는 실내 대안이나 다른 시간을 고려하세요.',
    extreme: '기온이 높거나 낮으니 장시간 야외 활동을 줄이는 것을 고려하세요.',
    outdoor: '기온과 강수 기준으로 일반 야외 활동을 고려할 수 있습니다. 출발 전 변화를 확인하세요.',
    laundryWet: '비나 눈에 젖지 않도록 실내 건조를 고려하세요.',
    laundryDry:
      '야외 건조를 고려할 수 있습니다. 습도와 바람 자료가 없어 건조 속도는 판단할 수 없습니다.',
    sun: '이 예보에는 자외선 지수가 없어 차단 수준을 판단할 수 없습니다. 낮에 외출한다면 일정에 맞춰 햇빛을 가릴 물품을 준비하세요.',
    snow: (seen: boolean) =>
      seen
        ? '선택한 시간대에 눈이 예보되어 있습니다.'
        : '선택한 시간대 예보에는 눈이 나타나지 않습니다.',
    thunder: (seen: boolean) =>
      seen
        ? '선택한 시간대에 뇌우가 예보되어 있습니다.'
        : '선택한 시간대 예보에는 뇌우가 나타나지 않습니다.',
    unknown: '일부 날씨 현상이 알려지지 않아 눈이나 뇌우를 완전히 판단할 수 없습니다.',
  },
};

export function adviceFor(
  intent: AdviceIntent,
  hours: HourWeather[],
  locale: Locale,
): Pick<AskResult, 'answer' | 'evidence'> {
  const t = copy[locale],
    number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format;
  const lo = hours.reduce((a, b) => (a.temp <= b.temp ? a : b)),
    hi = hours.reduce((a, b) => (a.temp >= b.temp ? a : b));
  const knownRain = hours.filter((hour): hour is HourWeather & { rain: number } =>
    finite(hour.rain),
  );
  const peak = knownRain.length ? knownRain.reduce((a, b) => (a.rain >= b.rain ? a : b)) : null;
  const completeRain = knownRain.length === hours.length;
  const storm = hours.some((hour) => [65, 67, 82, 86, 95, 96, 99].includes(hour.code));
  const wetCode = hours.some((hour) => hour.code >= 51 && hour.code <= 86);
  const wet = wetCode || (completeRain && peak !== null && peak.rain >= 50);
  const sky = [...new Set(hours.map((hour) => condition(hour.code, locale)))].join(' / ');
  const lines = [
    t.facts(number(lo.temp), number(hi.temp), sky),
    completeRain && peak ? t.rain(number(peak.rain)) : t.missing,
  ];
  if (intent === 'clothing') {
    lines.push(lo.temp < 5 ? t.cold : lo.temp < 15 ? t.cool : lo.temp < 22 ? t.mild : t.warm);
    if (hi.temp - lo.temp >= 8) lines.push(t.layers);
    if (wet) lines.push(t.umbrella);
  } else if (intent === 'outdoor') {
    lines.push(
      storm
        ? t.storm
        : wet
          ? t.wet
          : !completeRain
            ? t.missing
            : hi.temp >= 32 || lo.temp <= 0
              ? t.extreme
              : t.outdoor,
    );
  } else if (intent === 'laundry')
    lines.push(wet ? t.laundryWet : completeRain ? t.laundryDry : t.missing);
  else if (intent === 'sun') lines.push(t.sun);
  else if (intent === 'conditions') {
    if (hours.some((hour) => condition(hour.code, locale) === condition(-1, locale)))
      lines.push(t.unknown);
    else
      lines.push(
        t.snow(hours.some((hour) => [71, 73, 75, 77, 85, 86].includes(hour.code))),
        t.thunder(hours.some((hour) => [95, 96, 99].includes(hour.code))),
      );
  }
  const evidence = new Map(
    hours
      .filter((hour, i) => !hours.slice(0, i).some((other) => other.code === hour.code))
      .map((hour) => [hour.time, hour]),
  );
  for (const hour of [lo, hi, ...(peak ? [peak] : [])]) evidence.set(hour.time, hour);
  return {
    answer: [...new Set(lines)].join('\n'),
    evidence: [...evidence.values()].map(({ time, temp, rain, code }) => ({
      time,
      temp,
      rain,
      code,
    })),
  };
}
