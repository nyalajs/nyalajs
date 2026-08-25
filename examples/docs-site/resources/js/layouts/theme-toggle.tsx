import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "nyala-docs-theme";

/** Real light/dark switch — app.css already defines a full .dark palette, nothing ever toggled the class until now. */
function applyTheme(dark: boolean) {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
}

function initialIsDark(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
    // Starts false on both server and first client render (SSR/hydration
    // has no access to localStorage or matchMedia) — the real value is
    // applied in the effect below, same "avoid a hydration mismatch"
    // reasoning any localStorage-backed toggle needs. A one-frame flash of
    // the wrong icon is preferable to a React hydration warning.
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const dark = initialIsDark();
        setIsDark(dark);
        applyTheme(dark);
    }, []);

    function toggle() {
        const next = !isDark;
        setIsDark(next);
        applyTheme(next);
    }

    return (
        <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={toggle} aria-label="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
    );
}
