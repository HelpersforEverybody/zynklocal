// src/components/MainLayout.jsx (Tailwind-only)
import React from "react";

export default function MainLayout({ children }) {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Desktop sidebar */}
            <aside className="hidden md:flex md:flex-col md:w-72 md:min-h-screen bg-white border-r">
                <div className="p-4 text-xl font-semibold">Zynk Owner</div>
                <nav className="flex-1 p-4 space-y-2">
                    <a className="block px-3 py-2 rounded hover:bg-gray-100">Dashboard</a>
                    <a className="block px-3 py-2 rounded hover:bg-gray-100">Orders</a>
                    <a className="block px-3 py-2 rounded hover:bg-gray-100">Menu</a>
                    <a className="block px-3 py-2 rounded hover:bg-gray-100">Settings</a>
                </nav>
            </aside>

            {/* Mobile top bar */}
            <header className="md:hidden bg-white border-b p-3 flex items-center justify-between">
                <div className="text-lg font-semibold">Zynk Owner</div>
                <button className="p-2 rounded bg-gray-100">☰</button>
            </header>

            {/* Main content area */}
            <main className="md:ml-72 p-4">
                {children}
            </main>

            {/* Mobile bottom nav */}
            <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t flex justify-around py-2">
                <button className="text-xs">Dashboard</button>
                <button className="text-xs">Orders</button>
                <button className="text-xs">Menu</button>
                <button className="text-xs">More</button>
            </nav>
        </div>
    );
}
