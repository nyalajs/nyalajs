export interface RichTextBlockData {
    html: string;
}

// `html` is authored by an authenticated admin (same trust boundary as
// Post.content) — never render user/visitor-submitted HTML this way.
export function RichTextBlock({ data }: { data: RichTextBlockData }) {
    return <div className="rich-text" dangerouslySetInnerHTML={{ __html: data.html }} />;
}
