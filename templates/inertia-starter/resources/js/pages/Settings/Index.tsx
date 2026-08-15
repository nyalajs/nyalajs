import { FormEvent } from "react";
import { Head, useForm, usePage } from "@nyalajs/inertia/client";
import { AdminLayout } from "@/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
    user: { id: string; name: string; email: string } | null;
    [key: string]: unknown;
}

export default function SettingsIndex() {
    const { props } = usePage<PageProps>();
    const user = props.user;

    const profileForm = useForm({ name: user?.name ?? "" });
    const passwordForm = useForm({ currentPassword: "", newPassword: "" });

    function submitProfile(e: FormEvent) {
        e.preventDefault();
        profileForm.post("/settings/profile", { preserveScroll: true });
    }

    function submitPassword(e: FormEvent) {
        e.preventDefault();
        passwordForm.post("/settings/password", {
            preserveScroll: true,
            onSuccess: () => passwordForm.reset(),
        });
    }

    return (
        <AdminLayout>
            <Head title="Settings" />

            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">Manage your account profile and password.</p>
            </div>

            <form onSubmit={submitProfile}>
                <Card className="mt-6 max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Profile</CardTitle>
                        <CardDescription>Your name and email address.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" value={user?.email ?? ""} disabled />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={profileForm.data.name}
                                onChange={(e) => profileForm.setData("name", e.target.value)}
                                aria-invalid={!!profileForm.errors.name}
                            />
                            {profileForm.errors.name && (
                                <p className="text-sm text-destructive">{profileForm.errors.name}</p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end">
                        <Button type="submit" disabled={profileForm.processing}>
                            {profileForm.processing ? "Saving..." : "Save profile"}
                        </Button>
                    </CardFooter>
                </Card>
            </form>

            <form onSubmit={submitPassword}>
                <Card className="mt-6 max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Password</CardTitle>
                        <CardDescription>Change your account password.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        <div className="grid gap-2">
                            <Label htmlFor="currentPassword">Current password</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.data.currentPassword}
                                onChange={(e) => passwordForm.setData("currentPassword", e.target.value)}
                                aria-invalid={!!passwordForm.errors.currentPassword}
                            />
                            {passwordForm.errors.currentPassword && (
                                <p className="text-sm text-destructive">{passwordForm.errors.currentPassword}</p>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="newPassword">New password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={passwordForm.data.newPassword}
                                onChange={(e) => passwordForm.setData("newPassword", e.target.value)}
                                aria-invalid={!!passwordForm.errors.newPassword}
                            />
                            {passwordForm.errors.newPassword && (
                                <p className="text-sm text-destructive">{passwordForm.errors.newPassword}</p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end">
                        <Button type="submit" disabled={passwordForm.processing}>
                            {passwordForm.processing ? "Saving..." : "Change password"}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </AdminLayout>
    );
}
