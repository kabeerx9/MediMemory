import { createFileRoute } from "@tanstack/react-router";

import { UploadPage } from "@/features/connect/upload-page";

// Public on purpose: opened from a link an AI app hands out mid-chat, often in
// a phone browser with no Caretalk session. The token is the credential.
export const Route = createFileRoute("/upload/$token")({
  component: RouteComponent,
});

function RouteComponent() {
  const { token } = Route.useParams();
  return <UploadPage token={token} />;
}
