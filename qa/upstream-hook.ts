// 仅用于原始源码的受控对照；不修改基线源码或真实服务行为。
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (process.env.TEST_FORECAST_OVERRIDE && url.hostname === 'api.open-meteo.com') {
    const replacement = new URL(process.env.TEST_FORECAST_OVERRIDE);
    replacement.search = url.search;
    const t = performance.now();
    const response = await original(replacement, init);
    console.log(
      JSON.stringify({
        event: 'baseline-upstream',
        ms: performance.now() - t,
        status: response.status,
      }),
    );
    return response;
  }
  return original(input, init);
};
