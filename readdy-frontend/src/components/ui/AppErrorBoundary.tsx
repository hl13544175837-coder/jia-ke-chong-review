import { Component, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background-50 px-5">
        <section role="alert" className="w-full max-w-md rounded-2xl border border-background-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <i className="ri-error-warning-line text-2xl" aria-hidden="true"></i>
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground-900">页面暂时无法显示</h1>
          <p className="mt-2 text-sm leading-6 text-foreground-500">
            当前页面遇到了异常，你可以重新加载，或者返回工作台继续处理其他任务。
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="rounded-lg border border-background-300 bg-white px-5 py-2.5 text-sm font-medium text-foreground-700 hover:bg-background-50"
            >
              返回工作台
            </button>
          </div>
        </section>
      </main>
    );
  }
}
