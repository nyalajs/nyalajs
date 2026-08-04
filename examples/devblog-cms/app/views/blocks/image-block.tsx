export interface ImageBlockData {
    src: string;
    alt?: string;
    caption?: string;
}

export function ImageBlock({ data }: { data: ImageBlockData }) {
    return (
        <figure className="image-block">
            <img src={data.src} alt={data.alt ?? ""} style={{ maxWidth: "100%" }} />
            {data.caption && <figcaption>{data.caption}</figcaption>}
        </figure>
    );
}
