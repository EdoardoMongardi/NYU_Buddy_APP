import { notFound } from 'next/navigation';
import DesignPlaygroundClient from './client';

export const metadata = {
    title: 'Design Playground | NYU Buddy',
};

export default function DesignPlaygroundPage() {
    if (process.env.NEXT_PUBLIC_SHOW_DESIGN_PLAYGROUND !== 'true') {
        notFound();
    }
    return <DesignPlaygroundClient />;
}
