import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/600.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
