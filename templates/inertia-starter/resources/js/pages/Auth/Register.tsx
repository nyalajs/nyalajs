import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";

export default function Register() {
    const { data, setData, post, processing, errors } = useForm({
        name: "",
        email: "",
        password: "",
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        post("/register");
    }

    return (
        <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 400, margin: "4rem auto", padding: "0 1rem" }}>
            <Head title="Register" />
            <h1>Register</h1>

            <form onSubmit={submit}>
                <div style={{ marginBottom: "1rem" }}>
                    <label htmlFor="name">Name</label>
                    <input
                        id="name"
                        type="text"
                        value={data.name}
                        onChange={(e) => setData("name", e.target.value)}
                        style={{ display: "block", width: "100%", padding: "0.5rem" }}
                    />
                    {errors.name && <div style={{ color: "#dc2626" }}>{errors.name}</div>}
                </div>

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
                    {processing ? "Registering..." : "Register"}
                </button>
            </form>

            <p style={{ marginTop: "1rem" }}>
                Already have an account? <Link href="/login">Log in</Link>
            </p>
        </div>
    );
}
