import type { AskInput, AskOptions, AskResult, Place, Plan, SingleContext } from './types.ts';
import { AskError, atDate, clockIn, copyFor, modelPlan, rulePlan, validPlan } from './ask.ts';
import { cityDirectory, localPlace } from './catalog.ts';
import { validSingleContext, validPlace } from './contracts.ts';
import { answerText } from './ask-copy.ts';
import { isRecord } from './validation.ts';
import { adviceIntent } from './weather-advice.ts';

const normalize = (name: string) =>
  name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const dateMention =
  /today|tomorrow|tonight|今天|今早|今晚|明天|明早|明晚|后天|後天|오늘|내일|모레|\d{4}-\d\d-\d\d/i;
const periodMention =
  /morning|afternoon|evening|上午|早上|下午|晚上|아침|오전|오후|저녁|\d\s*[-–到至]/i;
const explicitMetric =
  /rain|precipitation|umbrella|temperature|cold|warm|weather|forecast|walk|雨|伞|傘|气温|氣溫|温度|溫度|冷|热|熱|天气|天氣|预报|預報|散步|날씨|비가|강수|기온|온도|산책/i;
const hasMetric = (question: string) =>
  explicitMetric.test(question) || adviceIntent(question) !== null;

async function resolveCity(
  query: string,
  locale: AskInput['locale'],
  search?: AskOptions['searchPlaces'],
): Promise<Place> {
  const [name, ...hints] = query
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!name) throw new AskError(400, 'CITY_NOT_FOUND', 'A city name is required.');
  const matchesHints = (place: Place) =>
    hints.every((hint) =>
      [place.region, place.country].some((value) => value && normalize(value) === normalize(hint)),
    );
  const known = cityDirectory.filter(
    (city) =>
      city.names.some((candidate) => normalize(candidate) === normalize(name)) &&
      matchesHints(localPlace(city, locale)),
  );
  if (known.length === 1) return { ...localPlace(known[0], locale), lookup: query };
  if (!search) throw new AskError(400, 'CITY_NOT_FOUND', 'City search is unavailable.');
  const results = (await search(name, locale)).places.filter(validPlace).filter(matchesHints);
  if (!results.length) throw new AskError(400, 'CITY_NOT_FOUND', 'No matching city.');
  const exact = results.filter((city) => normalize(city.name) === normalize(name));
  const candidates = exact.length ? exact : results;
  const unique = [...new Map(candidates.map((city) => [`${city.lat},${city.lon}`, city])).values()];
  if (unique.length !== 1)
    throw new AskError(400, 'AMBIGUOUS_CITY', 'Specify the city and region.');
  return { ...unique[0], lookup: query };
}

function checkedContext(raw: unknown, input: AskInput, timestamp: number): SingleContext | null {
  if (raw === null || raw === undefined) return null;
  if (
    !validSingleContext(raw) ||
    !validPlan(raw.plan) ||
    !raw.city.lookup ||
    raw.city.lookup.length > 100
  )
    throw new AskError(400, 'INVALID_INPUT', 'Invalid single-city context.');
  if (raw.origin !== `${input.lat},${input.lon}`) return null;
  if (
    timestamp - raw.createdAt > 3600000 ||
    raw.createdAt > timestamp + 1000 ||
    raw.dateAnchor < 0 ||
    raw.dateAnchor > timestamp + 1000
  )
    throw new AskError(409, 'STALE_FORECAST', 'Refresh the city forecast.');
  return raw;
}

// 无密钥模式仅识别明确城市模板；没有识别到城市时不从任意文本猜坐标。
function ruleCity(question: string): string | null {
  const known = cityDirectory.find((city) =>
    city.names.some((name) => normalize(question).includes(normalize(name))),
  );
  if (known)
    return known.names.find((name) => normalize(question).includes(normalize(name))) || null;
  const q = question
    .trim()
    .replace(/[？?。.!！]$/, '')
    .replace(/^(?:请问|請問|请|請)/, '')
    .replace(/^(?:今天|明天|后天|後天|现在|現在)/, '');
  const candidate =
    q.match(
      /^([\p{Script=Han}]{2,30}?)(?:的)?(?:天气|天氣|气温|氣溫|温度|溫度|穿什么|穿什麼|穿衣|适合|適合|防晒|防曬|紫外线|紫外線)/u,
    )?.[1] ||
    q.match(/(?:weather|temperature|rain)\s+in\s+(.+?)(?:\s+(?:today|tomorrow)|$)/i)?.[1] ||
    q.match(/^(.+?)\s+(?:weather|forecast)(?:\s|$)/i)?.[1] ||
    q.match(/^([가-힣]{2,20})\s*(?:오늘|내일)?\s*날씨/u)?.[1] ||
    null;
  return candidate &&
    !/^(?:what|how|when|where|the\b|next\b|today\b|tomorrow\b|future\b|앞으로|오늘|내일|未来|未來|当前|目前|本地|这里|這裡|当地|當地|下午|上午|晚上|早上|出门|出門|户外|戶外|需要|需不需要|要不要|可以|能不能|是否|怎么|怎麼|如何|会不会|會不會)/i.test(
      candidate,
    )
    ? candidate
    : null;
}

function inheritPlan(
  plan: Plan,
  question: string,
  prior: SingleContext | null,
  today: string,
  zone: string,
): Plan {
  if (!prior || plan.intent === 'unsupported' || plan.intent === 'outside') return plan;
  const previous = prior.plan;
  let result = plan;
  if (
    previous.window === 'days' &&
    result.window === 'next' &&
    !dateMention.test(question) &&
    !periodMention.test(question) &&
    !/\d+\s*(?:hours?|小时|小時|시간)/i.test(question)
  ) {
    result = {
      intent: result.intent,
      window: 'local',
      startDay: previous.startDay,
      dayCount: previous.dayCount,
      fromHour: 0,
      toHour: 23,
    };
  }
  if (
    !dateMention.test(question) &&
    'startDay' in previous &&
    previous.startDay !== undefined &&
    (result.window === 'days' || result.window === 'local')
  ) {
    const priorDay = atDate(clockIn(zone)(prior.dateAnchor / 1000).date, previous.startDay);
    const offset = (Date.parse(priorDay) - Date.parse(today)) / 86400000;
    result = { ...result, startDay: offset };
  }
  if (
    !periodMention.test(question) &&
    !/\d+\s*(?:hours?|小时|小時|시간)|现在|現在|\bnow\b/i.test(question) &&
    previous.window === 'local' &&
    result.intent !== 'daily' &&
    result.intent !== 'unsupported' &&
    result.intent !== 'outside'
  ) {
    result = {
      ...previous,
      ...('startDay' in result ? { startDay: result.startDay } : {}),
      intent: result.intent,
    };
  }
  return result;
}

export async function answerSingleCity(
  input: AskInput,
  raw: unknown,
  { getWeather, searchPlaces, config = {}, transport, now = () => Date.now() }: AskOptions,
): Promise<AskResult> {
  const timestamp = now(),
    epoch = Math.floor(timestamp / 1000);
  const origin = await getWeather(input.lat, input.lon, { fresh: true });
  if (origin.version !== input.version)
    throw new AskError(409, 'STALE_FORECAST', 'Refresh the forecast.');
  if (origin.stale) throw new AskError(503, 'FORECAST_UNAVAILABLE', 'Fresh forecast unavailable.');
  const prior = checkedContext(isRecord(raw) ? raw.singleContext : undefined, input, timestamp);
  let priorCity: Place | null = null;
  if (prior) {
    priorCity = await resolveCity(prior.city.lookup, input.locale, searchPlaces);
    if (
      priorCity.id !== prior.city.id ||
      priorCity.lat !== prior.city.lat ||
      priorCity.lon !== prior.city.lon
    )
      throw new AskError(400, 'INVALID_INPUT', 'City context does not match search results.');
  }
  const priorForecast = priorCity
    ? await getWeather(priorCity.lat, priorCity.lon, { fresh: true })
    : null;
  if (priorForecast?.stale)
    throw new AskError(503, 'FORECAST_UNAVAILABLE', 'Fresh city forecast unavailable.');
  if (prior && priorForecast && priorForecast.version !== prior.city.version)
    throw new AskError(409, 'STALE_FORECAST', 'Refresh the city forecast.');
  const referenceZone = priorForecast?.timezone || origin.timezone;
  const referenceDay = clockIn(referenceZone)(epoch).date;
  const planned = config.apiKey
    ? await modelPlan(input.question, referenceDay, referenceZone, config, transport, prior)
    : null;
  const reset =
    (isRecord(planned) && planned.useCurrentPlace === true) ||
    /当前地点|目前地點|current (?:place|location)|현재 위치/i.test(input.question);
  const query =
    isRecord(planned) && typeof planned.cityQuery === 'string'
      ? planned.cityQuery.trim()
      : config.apiKey
        ? null
        : ruleCity(input.question);
  const city = reset
    ? null
    : query
      ? await resolveCity(query, input.locale, searchPlaces)
      : priorCity;
  const weather = city
    ? priorCity && city.lat === priorCity.lat && city.lon === priorCity.lon && priorForecast
      ? priorForecast
      : await getWeather(city.lat, city.lon, { fresh: true })
    : origin;
  if (weather.stale)
    throw new AskError(503, 'FORECAST_UNAVAILABLE', 'Fresh city forecast unavailable.');
  const sameCity =
    prior &&
    city &&
    city.id === prior.city.id &&
    city.lat === prior.city.lat &&
    city.lon === prior.city.lon;
  if (sameCity && weather.version !== prior.city.version)
    throw new AskError(409, 'STALE_FORECAST', 'Refresh the city forecast.');
  const today = clockIn(weather.timezone)(epoch).date;
  const priorForPlan = sameCity && !reset ? prior : null;
  let stripped = query ? input.question.replace(query, '') : input.question;
  if (!hasMetric(stripped) && priorForPlan) {
    const metric =
      priorForPlan.plan.intent === 'daily' && periodMention.test(stripped)
        ? 'temperature'
        : priorForPlan.plan.intent;
    stripped += ' ' + (metric === 'daily' ? 'weather' : metric);
  }
  let plan = planned || rulePlan(stripped, today);
  if (priorForPlan && periodMention.test(input.question) && !hasMetric(input.question)) {
    const metric = priorForPlan.plan.intent === 'daily' ? 'temperature' : priorForPlan.plan.intent;
    const period = rulePlan(input.question + ' ' + metric, today);
    if (period.window === 'local') plan = period;
  }
  if (city) plan = inheritPlan(plan, input.question, priorForPlan, today, weather.timezone);
  const explicitDate = input.question.match(/\d{4}-\d\d-\d\d/)?.[0];
  if (explicitDate && (plan.window === 'local' || plan.window === 'days')) {
    const offset = (Date.parse(explicitDate) - Date.parse(today)) / 86400000;
    plan = { ...plan, startDay: offset };
    if (atDate(today, offset) !== explicitDate) plan = { intent: 'unsupported' };
  }
  if (!validPlan(plan)) throw new AskError(400, 'INVALID_INPUT', 'Invalid weather plan.');
  const answer = copyFor(
    plan,
    city ? { ...weather, hours: weather.comparisonHours || weather.hours } : weather,
    input.locale,
    epoch,
  );
  if (!config.apiKey) answer.answer = answerText[input.locale].preview + ' · ' + answer.answer;
  if (!city)
    return { ...answer, source: config.apiKey ? 'model' : 'rules', version: origin.version };
  const verifiedCity = { ...city, lookup: city.lookup || city.name, timezone: weather.timezone };
  return {
    ...answer,
    answer: `${city.name} · ${weather.timezone}\n${answer.answer}`,
    evidence: answer.evidence.map((entry) => ({
      ...entry,
      city,
      timezone: weather.timezone,
      version: weather.version,
    })),
    source: config.apiKey ? 'model' : 'rules',
    version: origin.version,
    model: config.apiKey ? config.model || 'gpt-4o-mini' : null,
    singleContext: {
      origin: `${input.lat},${input.lon}`,
      createdAt: timestamp,
      dateAnchor: timestamp,
      city: { ...verifiedCity, version: weather.version },
      plan,
    },
    singleForecast: { city: verifiedCity, forecast: weather },
  };
}
