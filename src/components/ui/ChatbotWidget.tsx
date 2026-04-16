import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Send, Bot, User, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your Viral Trim Assistant. Need help finding content, editing clips, or understanding platform limits?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const historyItems = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.chatbot(userMsg, historyItems);

      if (res.success && res.data) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.data!.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the server right now. Try again later." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. 🤕" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        size="icon"
        className={cn(
          "fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-2xl z-50 transition-transform btn-gradient",
          open ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        )}
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-5 w-5" />
      </Button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-4 right-4 w-80 sm:w-96 h-[500px] max-h-[calc(100vh-2rem)] flex flex-col bg-card border border-border/50 rounded-2xl shadow-2xl z-50 transition-all duration-300 origin-bottom-right",
          open ? "scale-100 opacity-100" : "scale-50 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Support Assistant</p>
              <p className="text-[10px] text-green-500 font-medium">Online</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2 max-w-[85%]", m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto")}>
              <div className={cn("h-6 w-6 shrink-0 rounded-full flex items-center justify-center", m.role === "user" ? "bg-muted" : "bg-primary/20")}>
                {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3 text-primary" />}
              </div>
              <div className={cn("rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50")}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 max-w-[85%] mr-auto">
              <div className="h-6 w-6 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <div className="rounded-2xl px-4 py-2 bg-muted/50 flex flex-col justify-center gap-1.5 h-9">
                 <div className="flex gap-1">
                   <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                   <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                   <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 border-t border-border/50 bg-background/50 backdrop-blur-sm rounded-b-2xl">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              disabled={loading}
              className="w-full bg-muted border border-border/50 rounded-full pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading}
              className="absolute right-1 top-1 bottom-1 h-8 w-8 rounded-full bg-primary/90 hover:bg-primary"
            >
              <Send className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
