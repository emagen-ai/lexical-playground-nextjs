'use client'
import "../package/index.css";
import dynamic from 'next/dynamic';

const PlaygroundApp = dynamic(() => import('../package/App'), {
  ssr: false, // This disables server-side rendering for the component
});
export default function App() {
  return (
    <PlaygroundApp />
  );
}
