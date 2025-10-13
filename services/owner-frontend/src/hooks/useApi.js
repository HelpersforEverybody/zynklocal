// src/hooks/useApi.js
export function getApiBase() {
    // 1) runtime injection (Capacitor / native can set window.__API_BASE)
    if (typeof window !== "undefined" && window.__API_BASE && String(window.__API_BASE).trim()) {
        return String(window.__API_BASE).replace(/\/$/, "");
    }

    // 2) build-time env (Vite)
    const envUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.REACT_APP_API_URL ||
        import.meta.env.VITE_PUBLIC_API_URL ||
        "";

    if (envUrl && String(envUrl).trim()) return String(envUrl).replace(/\/$/, "");

    // 3) local dev fallback when running on localhost
    if (typeof window !== "undefined" && window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
        return "http://localhost:3000";
    }

    // 4) final production default (your Render backend URL)
    return "https://whatsapp-saas-frontend1.onrender.com";
}
