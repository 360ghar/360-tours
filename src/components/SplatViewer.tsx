import React from 'react';

export const SplatViewer = ({ url }: { url: string }) => {
  // Use PlayCanvas SuperSplat editor in iframe, but ideally we'd use their viewer
  // To avoid iframe UI clutter, you can use the @playcanvas/supersplat engine directly
  // For this v1, the iframe gives the most robust loader.
  
  const embedUrl = `https://playcanvas.com/supersplat/editor?load=${encodeURIComponent(url)}`;
  
  return (
    <iframe 
      src={embedUrl}
      className="w-full h-full border-0"
      title="3D Tour Viewer"
      allow="xr-spatial-tracking; fullscreen; pointer-lock"
    />
  );
};
