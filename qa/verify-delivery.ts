import { verifyDelivery } from './lib/archive.ts';

const directory = process.env.DELIVERY_DIR;
if (!directory) throw Error('必须提供 DELIVERY_DIR');
const report = await verifyDelivery({
  directory,
  kernelEntryMode: 'basename',
  requiredKernelMarkers: ['/api/reverse', '/api/map-tiles/'],
  kernelMarkerError: '调试应用必须包含本版反查与真实天气地图功能',
});
console.log(JSON.stringify(report.产物));
