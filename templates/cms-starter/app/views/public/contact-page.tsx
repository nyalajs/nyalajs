import { SiteLayout, SiteLayoutProps } from "../layout";

export interface ContactPageProps {
    chrome: Omit<SiteLayoutProps, "children">;
    submitted?: boolean;
    error?: string;
}

export function ContactPage({ chrome, submitted, error }: ContactPageProps) {
    return (
        <SiteLayout {...chrome}>
            <h1>Contact</h1>
            {submitted ? (
                <p>Thanks — we'll get back to you soon.</p>
            ) : (
                <>
                    {error && <p className="error-message">{error}</p>}
                    <form method="POST" action="/contact" className="contact-form">
                        <div>
                            <label htmlFor="name">Name</label>
                            <input id="name" name="name" required />
                        </div>
                        <div>
                            <label htmlFor="email">Email</label>
                            <input id="email" name="email" type="email" required />
                        </div>
                        <div>
                            <label htmlFor="message">Message</label>
                            <textarea id="message" name="message" rows={6} required />
                        </div>
                        <button type="submit">Send</button>
                    </form>
                </>
            )}
        </SiteLayout>
    );
}
