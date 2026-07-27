export interface CtaBlockData {
    text: string;
    href: string;
}

export function CtaBlock({ data }: { data: CtaBlockData }) {
    return (
        <div style={{ textAlign: "center" }}>
            <a className="cta" href={data.href}>
                {data.text}
            </a>
        </div>
    );
}
