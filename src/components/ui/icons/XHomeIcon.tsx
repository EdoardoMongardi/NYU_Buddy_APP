import React from 'react';

export function HomeIconOutline(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props} fill="currentColor">
            <g>
                <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM5 19.5V8.428l7-4.375 7 4.375V19.5c0 .276-.224.5-.5.5h-5v-5.5c0-1.381-1.119-2.5-2.5-2.5s-2.5 1.119-2.5 2.5V20H5.5c-.276 0-.5-.224-.5-.5z" />
            </g>
        </svg>
    );
}

export function HomeIconSolid(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props} fill="currentColor">
            <g>
                <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM13 20h-2v-5.5c0-.552.448-1 1-1s1 .448 1 1V20z" />
            </g>
        </svg>
    );
}
