import { isRecord } from './validation.ts';

interface ServiceFailure {
  status: number;
  code: string;
  message: string;
}
const weatherBrand = Symbol.for('weather-atlas.WeatherError');
const askBrand = Symbol.for('weather-atlas.AskError');
function branded(value: unknown, brand: symbol): value is ServiceFailure {
  return (
    isRecord(value) &&
    value[brand] === true &&
    typeof value.message === 'string' &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    typeof value.status === 'number' &&
    Number.isInteger(value.status) &&
    value.status >= 400 &&
    value.status <= 599
  );
}
export const isWeatherError = (value: unknown): value is ServiceFailure =>
  branded(value, weatherBrand);
export const isAskError = (value: unknown): value is ServiceFailure => branded(value, askBrand);
export class WeatherError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WeatherError';
    Object.defineProperty(this, weatherBrand, { value: true });
    this.status = status;
    this.code = code;
  }
}
export class AskError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string | undefined) {
    super(message);
    this.name = 'AskError';
    Object.defineProperty(this, askBrand, { value: true });
    this.status = status;
    this.code = code;
  }
}
