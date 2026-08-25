import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** Single-field admin login — see app/controllers/auth.controller.ts's doc comment for why one password is enough here. */
export default function AdminLogin() {
    const { data, setData, post, processing, errors } = useForm({ password: "" });

    function submit(e: FormEvent) {
        e.preventDefault();
        post("/admin/login");
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
            <Head title="Admin login" />

            <Link href="/" className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-semibold">Nyala Docs</span>
            </Link>

            <form onSubmit={submit} className="w-full max-w-sm">
                <Card>
                    <CardHeader>
                        <CardTitle>Admin login</CardTitle>
                        <CardDescription>Enter the admin password to create, edit, or delete docs.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                autoFocus
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
                        <Link
                            href="/"
                            className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                        >
                            Back to docs
                        </Link>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
