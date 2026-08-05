import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: "",
        password: "",
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        post("/login");
    }

    return (
        <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 400, margin: "4rem auto", padding: "0 1rem" }}>
            <Head title="Log in" />
            <h1>Log in</h1>

            <form onSubmit={submit}>
                <div style={{ marginBottom: "1rem" }}>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={data.email}
                        onChange={(e) => setData("email", e.target.value)}
                        style={{ display: "block", width: "100%", padding: "0.5rem" }}
                    />
                    {errors.email && <div style={{ color: "#dc2626" }}>{errors.email}</div>}
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={data.password}
                        onChange={(e) => setData("password", e.target.value)}
                        style={{ display: "block", width: "100%", padding: "0.5rem" }}
                    />
                    {errors.password && <div style={{ color: "#dc2626" }}>{errors.password}</div>}
                </div>

                <button type="submit" disabled={processing}>
                    {processing ? "Logging in..." : "Log in"}
                </button>
            </form>

            <p style={{ marginTop: "1rem" }}>
                No account? <Link href="/register">Register</Link>
            </p>
        </div>
    );
}
