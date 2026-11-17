import { jsonPath, textAt } from '../../qa/lib/json.ts';
import { parseJson } from '../lib/validation.ts';
import { requireValue } from '../lib/validation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelPlan, answerQuestion } from '../lib/ask.ts';
import { createWeatherService } from '../lib/weather.ts';
import { catalog } from '../lib/catalog.ts';

for (const model of ['gpt-6-luna', 'gpt-4.1-mini'])
  test(`single-city intent request preserves short JSON behavior with ${model}`, async () => {
    const plan = { intent: 'rain', window: 'next', hours: 6 };
    let calls = 0;
    const result = await modelPlan(
      'Will it rain in six hours?',
      '2026-11-16',
      'Asia/Seoul',
      { apiKey: 'fixture', model },
      async (url, init) => {
        calls++;
        assert.equal(url, 'https://api.openai.com/v1/chat/completions');
        const request = parseJson(init.body);
        assert.equal(jsonPath(request, 'model'), model);
        assert.equal(jsonPath(request, 'max_completion_tokens'), 350);
        assert.equal(jsonPath(request, 'response_format', 'type'), 'json_object');
        assert.equal(
          jsonPath(request, 'reasoning_effort'),
          model === 'gpt-6-luna' ? 'none' : undefined,
        );
        return Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] });
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, plan);
  });

test('Luna comparison preserves strict intent extraction and server-calculated weather evidence', async () => {
  const now = () => Date.parse('2026-11-16T00:00Z');
  const service = createWeatherService({ demo: true, clock: now });
  const city = catalog[0],
    forecast = await service.getWeather(city.lat, city.lon);
  let calls = 0;
  const result = await answerQuestion(
    {
      question: '首尔和台北明早7–9点更容易下雨？',
      locale: 'zh-Hans',
      lat: city.lat,
      lon: city.lon,
      version: forecast.version,
    },
    {
      getWeather: service.getWeather,
      now,
      config: { apiKey: 'fixture', model: 'gpt-6-luna' },
      transport: async (_url, init: { body: string }) => {
        calls++;
        const request = parseJson(init.body);
        assert.equal(jsonPath(request, 'model'), 'gpt-6-luna');
        assert.equal(jsonPath(request, 'reasoning_effort'), 'none');
        assert.equal(jsonPath(request, 'max_completion_tokens'), 650);
        assert.equal(jsonPath(request, 'response_format', 'json_schema', 'strict'), true);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cityQueries: ['Seoul', 'Taipei'],
                  plan: {
                    intent: 'rain',
                    window: 'local',
                    startDay: 1,
                    dayCount: 1,
                    fromHour: 7,
                    toHour: 9,
                  },
                  alignmentZone: null,
                }),
              },
            },
          ],
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.source, 'model');
  assert.equal(result.model, 'gpt-6-luna');
  assert.equal(requireValue(result.comparisons).length, 2);
  for (const row of requireValue(result.comparisons)) {
    assert(row.complete && row.evidence.length === 3);
    assert.equal(row.value, Math.max(...row.evidence.map((hour) => requireValue(hour.rain))));
  }
});
