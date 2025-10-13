// src/hooks/useWindowSize.js
import { useState, useEffect } from "react";

/**
 * useWindowSize
 * Simple hook that returns current window width and a useful isMobile boolean.
 * Default mobile breakpoint is < 768px (Tailwind's md).
 */
export default function useWindowSize(breakpoint = 768) {
    const isBrowser = typeof window !== "undefined";
    const [width, setWidth] = useState(isBrowser ? window.innerWidth : 1200);
    const [height, setHeight] = useState(isBrowser ? window.innerHeight : 800);

    useEffect(() => {
        if (!isBrowser) return;
        const onResize = () => {
            setWidth(window.innerWidth);
            setHeight(window.innerHeight);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [isBrowser]);

    return {
        width,
        height,
        isMobile: width < breakpoint,
        isTabletOrMobile: width < 1024,
    };
}
