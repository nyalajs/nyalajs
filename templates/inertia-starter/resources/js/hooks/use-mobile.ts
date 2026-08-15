import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 1024;

/** True below the dashboard's mobile breakpoint (matches the sidebar's lg: collapse). */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState<boolean>(
        typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
    );

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        mql.addEventListener("change", onChange);
        onChange();
        return () => mql.removeEventListener("change", onChange);
    }, []);

    return isMobile;
}
