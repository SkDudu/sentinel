import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { bodyChatPrompt } from "../../../shared/body-prompt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { api } from "@/services/api";

type Turn = { id: string; role: "user" | "assistant"; content: string };

export function BodyChatDialog({
  open,
  onOpenChange,
  method,
  path,
  summary,
  requestBodySchema,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method: string;
  path: string;
  summary?: string;
  requestBodySchema?: unknown;
  onUse: (body: unknown) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState<unknown>(null);
  const run = useRef(0);

  async function send(history: Array<{ role: "user" | "assistant"; content: string }>, token: number) {
    setBusy(true);
    setStatus("Pensando no body…");
    setBody(null);
    const assistantId = `assistant-${history.length}`;
    setTurns((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    try {
      await api.streamBodyChat(
        { method, path, summary, requestBodySchema, messages: history },
        (event, data) => {
          if (run.current !== token) return;
          if (event === "status" && typeof data.text === "string") setStatus(data.text);
          if (event === "delta" && typeof data.text === "string") {
            setStatus(null);
            if (run.current !== token) return;
            const piece = data.text;
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === assistantId ? { ...turn, content: turn.content + piece } : turn,
              ),
            );
          }
          if (event === "done") {
            setStatus(typeof data.note === "string" ? data.note : null);
            if (data.body) setBody(data.body);
          }
          if (event === "error" && typeof data.message === "string") {
            setStatus(data.message);
            toast.add({
              title: "Não deu para gerar o body",
              description: data.message,
              type: "error",
            });
          }
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui falar com a IA. Tente de novo.";
      setStatus(message);
      toast.add({ title: "Não deu para gerar o body", description: message, type: "error" });
    } finally {
      if (run.current === token) setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setTurns([]);
      setStatus(null);
      setDraft("");
      setBody(null);
      return;
    }
    const token = ++run.current;
    const prompt = bodyChatPrompt({ method, path, summary, requestBodySchema });
    const first = [{ role: "user" as const, content: prompt }];
    setTurns([{ id: "user-0", role: "user", content: prompt }]);
    void send(first, token);
    return () => {
      run.current += 1;
    };
    // Só na abertura. O pedido padrão já leva método, path e schema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    const history = [
      ...turns
        .filter((turn) => turn.content.trim())
        .map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: text },
    ];
    setDraft("");
    setTurns((prev) => [...prev, { id: `user-${prev.length}`, role: "user", content: text }]);
    void send(history, ++run.current);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(40rem,calc(100dvh-2rem))] max-w-lg flex-col gap-3 overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gerar body</DialogTitle>
          <DialogDescription>
            {method} {path}
          </DialogDescription>
        </DialogHeader>
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent aria-busy={busy}>
                {turns.map((turn) => (
                  <MessageScrollerItem
                    key={turn.id}
                    messageId={turn.id}
                    scrollAnchor={turn.role === "user"}
                  >
                    <Message align={turn.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <p className="max-w-[85%] rounded-lg bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-foreground group-data-[align=end]/message:bg-primary group-data-[align=end]/message:text-primary-foreground">
                          {turn.content || (busy ? "" : "…")}
                        </p>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
                {status ? (
                  <MessageScrollerItem messageId="status">
                    <Marker role="status">
                      {busy ? (
                        <MarkerIcon>
                          <Spinner />
                        </MarkerIcon>
                      ) : null}
                      <MarkerContent>{status}</MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            value={draft}
            placeholder="Peça um ajuste no body"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Enviar">
            <ArrowUp />
          </Button>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" disabled={!body} onClick={() => body && onUse(body)}>
            Usar este body
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
