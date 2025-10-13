// src/components/MobileBottomNav.jsx
import React from "react";

/**
 * MobileBottomNav — purely presentational.
 * Props:
 *   - view (string) current view
 *   - setView(fn) to switch view
 *
 * This is UI-only and does not change any behavior.
 */
export default function MobileBottomNav({ view, setView }) {
    return (
        <nav className="fixed bottom-3 left-1/2 transform -translate-x-1/2 z-40 w-[94%] max-w-lg bg-white border rounded-lg shadow-lg flex justify-between px-2 py-1 md:hidden">
            <button
                onClick={() => setView("your-shop")}
                className={`flex-1 py-2 text-sm ${view === "your-shop" ? "text-white bg-gray-900 rounded" : "text-gray-700"}`}
            >
                Shop
            </button>
            <button
                onClick={() => setView("menu")}
                className={`flex-1 py-2 text-sm ${view === "menu" ? "text-white bg-blue-600 rounded" : "text-gray-700"}`}
            >
                Menu
            </button>
            <button
                onClick={() => setView("orders")}
                className={`flex-1 py-2 text-sm ${view === "orders" ? "text-white bg-blue-600 rounded" : "text-gray-700"}`}
            >
                Orders
            </button>
        </nav>
    );
}
