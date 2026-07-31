export default function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-64 items-center justify-center gap-2 text-sm text-foreground-500"
    >
      <i className="ri-loader-4-line animate-spin text-base" aria-hidden="true"></i>
      页面加载中...
    </div>
  );
}
