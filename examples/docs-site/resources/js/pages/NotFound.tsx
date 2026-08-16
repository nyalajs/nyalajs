import { Head, Link } from "@nyalajs/inertia/client";
import { FileQuestion } from "lucide-react";
import { DocsLayout } from "@/layouts/docs-layout";
import { Button } from "@/components/ui/button";
import type { NavGroup } from "../types/docs";

interface Props {
    slug: string;
    nav: NavGroup[];
    [key: string]: unknown;
}

export default function NotFound({ slug }: Props) {
    return (
        <DocsLayout>
            <Head title="Page Not Found" />
            <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
                <FileQuestion className="h-12 w-12 text-muted-foreground/50" />
                <h1 className="text-2xl font-semibold">Page not found</h1>
                <p className="max-w-md text-muted-foreground">
                    There's no doc at <code className="rounded bg-muted px-1.5 py-0.5">/docs/{slug}</code>.
                </p>
                <Button asChild>
                    <Link href="/docs/introduction">Back to docs</Link>
                </Button>
            </div>
        </DocsLayout>
    );
}
