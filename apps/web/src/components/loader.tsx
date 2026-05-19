import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8 text-sentri-lime">
      <Loader2 className="size-8 animate-spin" />
    </div>
  );
}
