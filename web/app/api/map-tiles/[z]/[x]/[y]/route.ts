import { isRecord } from '../../../../../../lib/validation.ts';
import { getMapTile } from '../../../../../../lib/map-tiles.ts';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  try {
    const { z, x, y } = await params;
    const tile = await getMapTile(z, x, y);
    const headers = {
      'Content-Type': 'image/png',
      'Cache-Control': tile.cacheControl || `public, max-age=${tile.maxAge}`,
      ETag: tile.etag,
      'X-Map-Source': 'openstreetmap',
      'X-Map-Cache': tile.cache,
    };
    if (request.headers.get('if-none-match') === tile.etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(tile.body), { headers });
  } catch (error) {
    const status =
      isRecord(error) &&
      typeof error.status === 'number' &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;
    return Response.json(
      { error: status === 400 ? 'Invalid tile' : 'Map unavailable' },
      {
        status: status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
