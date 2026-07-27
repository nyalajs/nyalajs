import * as React from "react";
import { NavItem } from "../services/layout-data.service";

export interface SiteLayoutProps {
    siteName: string;
    footerText: string;
    headerNav: NavItem[];
    footerNav: NavItem[];
    children: React.ReactNode;
}

/**
 * Public-site chrome (header nav + footer), composed inside each page
 * component — not passed as ViewOptions.layout, since that stays reserved
 * for the plain <html>/<head> shell (see @nyalajs/react's DefaultLayout).
 */
export function SiteLayout({ siteName, footerText, headerNav, footerNav, children }: SiteLayoutProps) {
    return (
        <div className="site">
            <header className="site-header">
                <a className="site-brand" href="/">
                    {siteName}
                </a>
                <nav className="site-nav">
                    {headerNav.map((item) => (
                        <a key={item.href} href={item.href}>
                            {item.label}
                        </a>
                    ))}
                </nav>
            </header>
            <main className="site-main">{children}</main>
            <footer className="site-footer">
                <nav className="site-footer-nav">
                    {footerNav.map((item) => (
                        <a key={item.href} href={item.href}>
                            {item.label}
                        </a>
                    ))}
                </nav>
                <p>{footerText}</p>
            </footer>
        </div>
    );
}
