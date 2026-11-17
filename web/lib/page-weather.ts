import { cache } from 'react';
import { getWeather } from './weather.ts';

// metadata 与正文在同次渲染共享结果，包括失败；不为索引判断再次请求上游。
export const pageWeather = cache(async (lat: unknown, lon: unknown) => {
  try {
    const { comparisonHours, ...display } = await getWeather(lat, lon);
    return display;
  } catch {
    return null;
  }
});
