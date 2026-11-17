import type { UIMessage } from 'ai';
import type { AskResult } from './types.ts';

export type WeatherPhase = 'weather' | 'city' | 'model';
export type WeatherMessage = UIMessage<
  unknown,
  {
    weather: AskResult;
    phase: { phase: WeatherPhase };
  }
>;

export type AskFailure = { status: number; code: string };
