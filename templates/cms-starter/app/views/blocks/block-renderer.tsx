import { PageBlock } from "../../models/page.model";
import { HeroBlock } from "./hero-block";
import { RichTextBlock } from "./rich-text-block";
import { ImageBlock } from "./image-block";
import { CtaBlock } from "./cta-block";

const BLOCK_COMPONENTS: Record<string, (props: { data: any }) => JSX.Element> = {
    hero: HeroBlock,
    "rich-text": RichTextBlock,
    image: ImageBlock,
    cta: CtaBlock,
};

/**
 * Renders a Page's `blocks` array. An unrecognized block type renders
 * nothing rather than crashing the whole page — a bad/future block type
 * shouldn't take down a page that otherwise renders fine.
 */
export function BlockRenderer({ blocks }: { blocks: PageBlock[] }) {
    return (
        <>
            {blocks.map((block, index) => {
                const Component = BLOCK_COMPONENTS[block.type];
                if (!Component) return null;
                return <Component key={index} data={block.data} />;
            })}
        </>
    );
}
