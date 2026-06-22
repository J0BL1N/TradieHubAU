import { MessageSquare, Send, User } from 'lucide-react';

export default function Messages() {
  const mockThreads = [
    { id: 1, name: 'Dave Harrison', lastMessage: 'Hey, are you free for a call tomorrow?', time: '10:42 AM', unread: true },
    { id: 2, name: 'Rebecca Sterling', lastMessage: 'Thanks for sending through the quote.', time: 'Yesterday', unread: false },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
      {/* Threads List */}
      <div className="bg-card border rounded-2xl p-4 flex flex-col space-y-4">
        <h2 className="text-xl font-bold px-2 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Chats
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {mockThreads.map((thread) => (
            <div
              key={thread.id}
              className={`p-4 rounded-xl cursor-pointer hover:bg-muted/50 transition-all flex items-center justify-between gap-4 border ${
                thread.unread ? 'bg-primary/5 border-primary/20' : 'border-transparent bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm truncate text-foreground">{thread.name}</h4>
                  <p className={`text-xs truncate ${thread.unread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                    {thread.lastMessage}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-semibold text-muted-foreground">{thread.time}</span>
                {thread.unread && <div className="h-2 w-2 rounded-full bg-primary ml-auto mt-1"></div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Conversation Placeholder */}
      <div className="lg:col-span-2 bg-card border rounded-2xl flex flex-col justify-between overflow-hidden relative">
        <div className="p-4 border-b bg-muted/20 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Dave Harrison</h3>
            <p className="text-xs text-primary font-semibold">Licensed Electrician</p>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-muted/5">
          {/* Incoming */}
          <div className="flex items-end gap-2.5 max-w-[70%]">
            <div className="p-4 bg-card border rounded-2xl rounded-bl-none text-sm text-foreground leading-relaxed shadow-sm">
              Hey, I saw your job request for installing the ceiling fans. I can head out on Wednesday morning if that suits you?
            </div>
          </div>

          {/* Outgoing */}
          <div className="flex items-end gap-2.5 max-w-[70%] ml-auto justify-end">
            <div className="p-4 bg-primary text-primary-foreground rounded-2xl rounded-br-none text-sm leading-relaxed shadow-md">
              Hi Dave! Wednesday morning works perfectly. What is your estimated hourly rate for the installation?
            </div>
          </div>

          {/* Incoming */}
          <div className="flex items-end gap-2.5 max-w-[70%]">
            <div className="p-4 bg-card border rounded-2xl rounded-bl-none text-sm text-foreground leading-relaxed shadow-sm">
              Usually $80/hr plus a standard callout fee. I can send a firm quote once I see the fittings. Hey, are you free for a call tomorrow?
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex items-center gap-3">
          <input
            type="text"
            placeholder="Type your message here..."
            className="flex-1 bg-background border rounded-xl px-4 py-3 outline-none focus:border-primary/50 transition-all text-sm"
          />
          <button className="bg-primary text-primary-foreground p-3 rounded-xl hover:bg-primary/95 transition-all shadow-md shrink-0">
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
