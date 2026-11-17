import test from 'node:test';
import assert from 'node:assert/strict';
import { locateWithPermissionRecovery } from '../lib/device-location.ts';

class LocationPermission extends EventTarget {
  state: PermissionState = 'prompt';
  change(state: PermissionState) {
    this.state = state;
    this.dispatchEvent(new Event('change'));
  }
}
const error: GeolocationPositionError = {
  code: 3,
  message: 'timeout',
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
};
const position: GeolocationPosition = {
  coords: {
    latitude: 25.0478,
    longitude: 121.5319,
    accuracy: 0,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return { latitude: this.latitude, longitude: this.longitude };
    },
  },
  timestamp: 1,
  toJSON() {
    return { coords: this.coords.toJSON(), timestamp: this.timestamp };
  },
};
function harness(permissions?: Parameters<typeof locateWithPermissionRecovery>[0]['permissions']) {
  const calls: {
    success: PositionCallback;
    failure?: PositionErrorCallback | null;
    options?: PositionOptions;
  }[] = [];
  const successes: GeolocationPosition[] = [],
    errors: GeolocationPositionError[] = [];
  let current = true,
    pending = 0;
  const cancel = locateWithPermissionRecovery({
    geolocation: {
      getCurrentPosition(success, failure, options) {
        calls.push({ success, failure, options });
      },
    },
    permissions,
    isCurrent: () => current,
    onPending: () => {
      pending++;
    },
    onSuccess: (value) => successes.push(value),
    onError: (value) => errors.push(value),
  });
  return {
    calls,
    successes,
    errors,
    cancel,
    pending: () => pending,
    chooseManually: () => {
      current = false;
    },
  };
}

test('a delayed permission grant retries a failed request once and keeps the returned coordinate', async () => {
  const permission = new LocationPermission();
  const h = harness({ query: async () => permission });
  await Promise.resolve();
  h.calls[0].failure?.(error);
  permission.change('granted');
  assert.equal(h.calls.length, 2);
  assert.equal(h.pending(), 2);
  h.calls[1].success(position);
  assert.deepEqual(h.successes, [position]);
  permission.change('denied');
  permission.change('granted');
  assert.equal(h.calls.length, 2);
});

test('permission grant does not duplicate a pending native request', async () => {
  const permission = new LocationPermission();
  const h = harness({ query: async () => permission });
  await Promise.resolve();
  permission.change('granted');
  assert.equal(h.calls.length, 1);
  h.calls[0].success(position);
  assert.deepEqual(h.successes, [position]);
  assert.deepEqual(h.calls[0].options, {
    timeout: 10000,
    maximumAge: 0,
    enableHighAccuracy: false,
  });
});

test('if the original request fails after grant, recovery still happens but cannot loop', async () => {
  const permission = new LocationPermission();
  const h = harness({ query: async () => permission });
  await Promise.resolve();
  permission.change('granted');
  h.calls[0].failure?.(error);
  assert.equal(h.calls.length, 2);
  h.calls[1].failure?.(error);
  permission.change('prompt');
  permission.change('granted');
  assert.equal(h.calls.length, 2);
  assert.equal(h.errors.length, 2);
});

test('manual city selection cancels permission recovery and ignores late positions', async () => {
  const permission = new LocationPermission();
  const h = harness({ query: async () => permission });
  await Promise.resolve();
  h.calls[0].failure?.(error);
  h.chooseManually();
  permission.change('granted');
  h.calls[0].success(position);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.successes, []);
});

test('canceling before permission query resolves prevents a later grant from restarting location', async () => {
  const permission = new LocationPermission();
  const h = harness({ query: async () => permission });
  h.cancel();
  await Promise.resolve();
  permission.change('granted');
  h.calls[0].success(position);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.successes, []);
});

test('missing or rejected Permissions API keeps the native request and its late callback', async () => {
  for (const permissions of [
    undefined,
    {
      query: async () => {
        throw Error('unsupported');
      },
    },
  ]) {
    const h = harness(permissions);
    await Promise.resolve();
    h.calls[0].success(position);
    assert.deepEqual(h.successes, [position]);
    assert.equal(h.calls.length, 1);
  }
});

test('permission query completing after the first failure may recover an already granted permission', async () => {
  const permission = new LocationPermission();
  permission.state = 'granted';
  const h = harness({ query: async () => permission });
  h.calls[0].failure?.(error);
  await Promise.resolve();
  assert.equal(h.calls.length, 2);
  h.calls[1].success(position);
  assert.deepEqual(h.successes, [position]);
});

test('an unchanged denied or granted state does not repeatedly request location', async () => {
  for (const state of ['denied', 'granted'] as const) {
    const permission = new LocationPermission();
    permission.state = state;
    const h = harness({ query: async () => permission });
    await Promise.resolve();
    h.calls[0].failure?.(error);
    permission.change(state);
    assert.equal(h.calls.length, 1);
    h.cancel();
  }
});
