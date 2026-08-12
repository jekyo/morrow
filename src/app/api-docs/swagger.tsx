"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import "./swagger-theme.css";

// swagger-ui-react is a browser-only bundle (touches window/document at import time),
// so it is loaded client-side only.
const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  ssr: false,
  loading: () => <p className="text-secondary p-8 font-mono text-sm">Loading API reference…</p>,
});

export function Swagger() {
  return <SwaggerUI url="/api/v1/openapi.json" docExpansion="list" defaultModelsExpandDepth={0} />;
}
