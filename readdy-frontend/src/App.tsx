import { Suspense, type ComponentType, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import type { BrowserRouterProps } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { ToastProvider } from "@/hooks/useToast";
import { CompanyAuthProvider, useCompanyAuth } from "@/auth/companyAuth";
import { CompanyPermissionsProvider } from "@/auth/companyPermissions";
import { ProductRoleProvider } from "@/auth/productRole";
import AppErrorBoundary from "@/components/ui/AppErrorBoundary";
import RouteLoadingFallback from "@/components/ui/RouteLoadingFallback";

type BrowserRouterFutureProps = BrowserRouterProps & {
  future: {
    v7_startTransition: boolean;
    v7_relativeSplatPath: boolean;
  };
};

const FutureBrowserRouter = BrowserRouter as ComponentType<BrowserRouterFutureProps>;

function CompanySecurityBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCompanyAuth();
  return (
    <CompanyPermissionsProvider key={isAuthenticated ? 'authenticated' : 'anonymous'}>
      {children}
    </CompanyPermissionsProvider>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AppErrorBoundary>
        <FutureBrowserRouter
          basename={__BASE_PATH__}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <CompanyAuthProvider>
            <ProductRoleProvider>
              <CompanySecurityBoundary>
                <ToastProvider>
                  <Suspense fallback={<RouteLoadingFallback />}>
                    <AppRoutes />
                  </Suspense>
                </ToastProvider>
              </CompanySecurityBoundary>
            </ProductRoleProvider>
          </CompanyAuthProvider>
        </FutureBrowserRouter>
      </AppErrorBoundary>
    </I18nextProvider>
  );
}

export default App;
