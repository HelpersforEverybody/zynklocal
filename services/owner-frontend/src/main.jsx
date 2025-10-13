// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // keep if you have global styles

const rootEl = document.getElementById("root");
if (!rootEl) {
    throw new Error("#root not found in index.html");
}
createRoot(rootEl).render(<App />);
