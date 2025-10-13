// src/hooks/useApi.js
// apiFetch returns an object similar to fetch Response so older code can call res.json()

export function getApiBase() {
    const envUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.REACT_APP_API_URL ||
        import.meta.env.VITE_PUBLIC_API_URL ||
        "";
    if (envUrl && String(envUrl).trim()) return String(envUrl).replace(/\/$/, "");
    return "http://localhost:3000";
}

function buildHeaders(headers = {}) {
    const h = { ...headers };
    if (!h["Content-Type"]) h["Content-Type"] = "application/json";
    return h;
}

/**
 * apiFetch(path, opts)
 * Returns an object similar to a fetch Response:
 *   { ok, status, json: async ()=>data, text: async ()=>text, error, url }
 */
export async function apiFetch(path, opts = {}) {
    const base = getApiBase();
    const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = buildHeaders(opts.headers || {});
    const token = typeof window !== "undefined" ? (localStorage.getItem("merchant_token") || localStorage.getItem("customer_token") || "") : "";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchOpts = {
        method: (opts.method || "GET").toUpperCase(),
        headers,
    };

    if (opts.rawBody) {
        fetchOpts.body = opts.body;
    } else if (typeof opts.body !== "undefined") {
        fetchOpts.body = JSON.stringify(opts.body);
    }

    let nativeRes;
    try {
        nativeRes = await fetch(url, fetchOpts);
    } catch (networkErr) {
        // Return a response-like object representing network failure
        const errText = networkErr && networkErr.message ? networkErr.message : String(networkErr);
        return {
            ok: false,
            status: 0,
            url,
            error: errText,
            json: async () => { throw new Error(errText); },
            text: async () => errText,
        };
    }

    const rawText = await nativeRes.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch (e) { parsed = null; }

    // Return response-like object with json() method to match fetch Response API
    return {
        ok: nativeRes.ok,
        status: nativeRes.status,
        url,
        error: nativeRes.ok ? null : ((parsed && parsed.error) || rawText || `HTTP ${nativeRes.status}`),
        json: async () => parsed,
        text: async () => rawText,
        // convenience shorthand
        _data: parsed,
    };
}
// useApi.js (quick dev change)
export function getApiBase() {
    // replace 192.168.1.42 with your PC ip
    return "http://10.16.115.237:3000";
}

