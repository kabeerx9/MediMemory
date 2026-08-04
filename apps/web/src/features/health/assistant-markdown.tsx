import type { ComponentProps } from "react";
import {
  defaultRehypePlugins,
  Streamdown,
  type Components,
  type ExtraProps,
  type LinkSafetyConfig,
  type StreamdownProps,
  type UrlTransform,
} from "streamdown";

function toHttpsUrl(href: string) {
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const httpsOnlyUrlTransform: UrlTransform = (href) => toHttpsUrl(href);

const normalizeHttpsProtocols = () => (tree: unknown) => {
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;

    const element = node as {
      children?: unknown[];
      properties?: { href?: unknown };
      tagName?: string;
      type?: string;
    };
    if (element.type === "element" && element.tagName === "a" && typeof element.properties?.href === "string") {
      element.properties.href = toHttpsUrl(element.properties.href) ?? element.properties.href;
    }
    element.children?.forEach(visit);
  };

  visit(tree);
};

const rehypePlugins = [
  defaultRehypePlugins.raw,
  normalizeHttpsProtocols,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
] as StreamdownProps["rehypePlugins"];

function AssistantImage({ alt }: ComponentProps<"img"> & ExtraProps) {
  return alt ? <span>{alt}</span> : null;
}

function AssistantStrong({
  children,
  node: _node,
  ...props
}: ComponentProps<"strong"> & ExtraProps) {
  return <strong {...props}>{children}</strong>;
}

const assistantMarkdownComponents = {
  img: AssistantImage,
  strong: AssistantStrong,
} satisfies Components;

const assistantLinkSafety = { enabled: true } satisfies LinkSafetyConfig;

export function getStreamingAssistantMessageId(
  messages: readonly { id: string; role: string }[],
  status: string,
) {
  if (status !== "streaming") return undefined;

  return messages.reduce<string | undefined>(
    (latestId, message) => (message.role === "assistant" ? message.id : latestId),
    undefined,
  );
}

export function AssistantMarkdown({
  children,
  isStreaming,
}: {
  children: string;
  isStreaming: boolean;
}) {
  return (
    <Streamdown
      className="text-[15px] leading-relaxed text-foreground [&_a]:text-[var(--sentri-accent-violet-deep)] [&_a]:underline [&_a]:underline-offset-2 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      components={assistantMarkdownComponents}
      isAnimating={isStreaming}
      linkSafety={assistantLinkSafety}
      mode={isStreaming ? "streaming" : "static"}
      rehypePlugins={rehypePlugins}
      urlTransform={httpsOnlyUrlTransform}
    >
      {children}
    </Streamdown>
  );
}
