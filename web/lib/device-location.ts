type LocationPermission = Pick<
  PermissionStatus,
  'state' | 'addEventListener' | 'removeEventListener'
>;
type LocationPermissions = {
  query: (descriptor: { name: 'geolocation' }) => Promise<LocationPermission>;
};

export function locateWithPermissionRecovery({
  geolocation,
  permissions,
  isCurrent,
  onPending,
  onSuccess,
  onError,
}: {
  geolocation: Pick<Geolocation, 'getCurrentPosition'>;
  permissions?: LocationPermissions;
  isCurrent: () => boolean;
  onPending: () => void;
  onSuccess: PositionCallback;
  onError: PositionErrorCallback;
}) {
  let active = true,
    pending = false,
    failed = false,
    recovered = false,
    grantDuringRequest = false;
  let permission: LocationPermission | undefined;
  let previousState: PermissionState | undefined;
  const current = () => active && isCurrent();
  function cancel() {
    active = false;
    permission?.removeEventListener('change', changed);
  }
  function recover() {
    if (!current() || pending || !failed || recovered) return;
    recovered = true;
    request();
  }
  function changed() {
    if (!current() || !permission) return;
    const state = permission.state;
    if (state === 'granted' && previousState !== 'granted') {
      grantDuringRequest = pending;
      recover();
    }
    previousState = state;
  }
  function request() {
    if (!current()) return;
    pending = true;
    failed = false;
    onPending();
    geolocation.getCurrentPosition(
      (position) => {
        if (!current()) return;
        pending = false;
        cancel();
        onSuccess(position);
      },
      (error) => {
        if (!current()) return;
        pending = false;
        failed = true;
        onError(error);
        if (grantDuringRequest && permission?.state === 'granted') recover();
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 },
    );
  }
  // 直接请求定位以保留用户手势；Permissions API 只负责失败后的授权恢复。
  // 等待授权不另设计时器，也不在权限变化但首请求仍正常等待时重复取位置。
  if (permissions) {
    void permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!current()) return;
        permission = status;
        previousState = status.state;
        status.addEventListener('change', changed);
        if (failed && status.state === 'granted') recover();
      })
      .catch(() => {
        /* 不支持权限查询时仍保留原生定位请求。 */
      });
  }
  request();
  return cancel;
}
