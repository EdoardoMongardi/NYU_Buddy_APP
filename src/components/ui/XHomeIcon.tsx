import React from 'react';

export function XHomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.25 9.75L12 2.25l9.75 7.5v10.5a1.5 1.5 0 01-1.5 1.5H15v-6H9v6H3.75a1.5 1.5 0 01-1.5-1.5V9.75zM12 4.183l-7.5 5.77V19.5h3v-6a1.5 1.5 0 011.5-1.5h6a1.5 1.5 0 011.5 1.5v6h3V9.953l-7.5-5.77z"
      />
    </svg>
  );
}
