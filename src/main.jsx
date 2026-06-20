import React from "react";
import { createRoot } from "react-dom/client";
import MyFam from "./MyFam.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MyFam />
    </ErrorBoundary>
  </React.StrictMode>
);
