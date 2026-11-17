export function trace(event: string, fields: Record<string, unknown>) {
  if (process.env.WEATHER_TRACE === '1')
    console.info(JSON.stringify({ event, at: Date.now(), ...fields }));
}
