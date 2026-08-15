import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
            <Head title="Log in" />

            <Link href="/" className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-semibold">Nyala Inertia Starter</span>
            </Link>

            <form onSubmit={submit} className="w-full max-w-sm">
                <Card>
                    <CardHeader>
                        <CardTitle>Log in</CardTitle>
                        <CardDescription>Welcome back — enter your credentials to continue.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={data.email}
                                onChange={(e) => setData("email", e.target.value)}
                                aria-invalid={!!errors.email}
                            />
                            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={data.password}
                                onChange={(e) => setData("password", e.target.value)}
                                aria-invalid={!!errors.password}
                            />
                            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={processing}>
                            {processing ? "Logging in..." : "Log in"}
                        </Button>
                        <p className="text-center text-sm text-muted-foreground">
                            No account?{" "}
                            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
                                Register
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
