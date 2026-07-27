export interface LoginPageProps {
    error?: string;
}

export function LoginPage({ error }: LoginPageProps) {
    return (
        <div className="login-page">
            <div className="login-card">
                <h1>Sign in</h1>
                {error && <p className="error-message">{error}</p>}
                <form method="POST" action="/admin/login" className="form-grid">
                    <div>
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" required autoFocus />
                    </div>
                    <div>
                        <label htmlFor="password">Password</label>
                        <input id="password" name="password" type="password" required />
                    </div>
                    <button type="submit" className="btn btn-primary">
                        Sign in
                    </button>
                </form>
            </div>
        </div>
    );
}
