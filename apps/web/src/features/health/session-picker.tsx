import type { ChatSession } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@caretalk/ui/components/dropdown-menu";
import { ChevronDown, Plus } from "lucide-react";

export function SessionPicker({
  sessions,
  currentSessionId,
  onSelect,
  onCreate,
}: {
  sessions: ChatSession[];
  currentSessionId: string;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
}) {
  const current = sessions.find((session) => session.id === currentSessionId);

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button className="max-w-[6.5rem] gap-1 sm:max-w-[14rem] sm:gap-1.5" size="sm" variant="ghost" />}>
          <span className="truncate">{current?.title ?? "New chat"}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[14rem]">
          {sessions.map((session) => (
            <DropdownMenuItem key={session.id} onClick={() => onSelect(session.id)}>
              <span className="truncate">{session.title ?? "Untitled chat"}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        className="w-9 px-0 sm:w-auto sm:px-3"
        onClick={onCreate}
        size="sm"
        variant="ghost"
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">New chat</span>
      </Button>
    </div>
  );
}
