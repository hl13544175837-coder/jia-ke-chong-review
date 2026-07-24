import type { ComponentType } from "react";
import { BrowserRouter } from "react-router-dom";
import type { BrowserRouterProps } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { ToastProvider } from "@/hooks/useToast";

type BrowserRouterFutureProps = BrowserRouterProps & {
  future: {
    v7_startTransition: boolean;
    v7_relativeSplatPath: boolean;
  };
};

const FutureBrowserRouter = BrowserRouter as ComponentType<BrowserRouterFutureProps>;

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <FutureBrowserRouter
        basename={__BASE_PATH__}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </FutureBrowserRouter>
    </I18nextProvider>
  );
}

export default App;
