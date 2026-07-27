import * as React from "react";

export default function Counter({ initial }: { initial: number }) {
    const [count, setCount] = React.useState(initial);
    return (
        <button onClick={() => setCount((c) => c + 1)}>
            Count: {count}
        </button>
    );
}
