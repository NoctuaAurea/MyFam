import React from "react";
import { createRoot } from "react-dom/client";
import MyFam from "./MyFam.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { AuthProvider, AuthGate } from "./auth.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <MyFam />
        </AuthGate>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
