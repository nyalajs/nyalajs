export interface HeroBlockData {
    heading: string;
    subheading?: string;
}

export function HeroBlock({ data }: { data: HeroBlockData }) {
    return (
        <section className="hero">
            <h1>{data.heading}</h1>
            {data.subheading && <p>{data.subheading}</p>}
        </section>
    );
}
