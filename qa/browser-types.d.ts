/** 仅供受控浏览器验收注入，应用运行时不依赖这些字段。 */
interface Window {
  __grantLocation: () => void;
  __geoCalls: PositionOptions[];
  __geoCount: number;
  __pendingGeo: PositionCallback;
  __lateGeo: PositionCallback;
  __lateGPS: PositionCallback;
  __locationCalls: number;
  __locationSuccess: PositionCallback;
  __clicked: number;
  __lcp: number;
  __tile: number;
  __waLCP: number;
}
