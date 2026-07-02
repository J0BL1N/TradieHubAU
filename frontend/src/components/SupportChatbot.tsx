import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { MessageSquare, X, Send, User, Sparkles } from 'lucide-react';
import { playSoundSafe } from '../lib/soundPreferences';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  links?: Array<{ label: string; to: string }>;
}

export default function SupportChatbot() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Hi there! I\'m your TradieHubAU helper. How can I help you use the site today?',
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatbotRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close when clicking outside on desktop
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && chatbotRef.current && !chatbotRef.current.contains(e.target as Node)) {
        // Only close if screen is desktop width to avoid mobile bottom sheet conflicts
        if (window.innerWidth >= 768) {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Helper to generate context-specific profile status text
  const getProfileStatusText = (): string => {
    if (!user) {
      return "You are currently browsing as a guest. You can view public listings, but you'll need to sign in to post jobs, message users, or apply/quote.";
    }

    const role = profile?.role || 'customer';
    const isTradie = role === 'tradie' || role === 'dual';

    if (role === 'customer') {
      return "You are registered as a Customer. You can post jobs, message tradies, and approve completion proofs. Quoting and applying is reserved for verified Tradies.";
    }

    const idVerified = profile?.identity_verified || false;
    const tradieVerified = profile?.tradie_verified || false;

    if (isTradie && !idVerified) {
      return "You are registered as a Tradie, but your identity is not verified. Please go to My Profile -> Verification to upload your photo ID.";
    }

    if (isTradie && !tradieVerified) {
      return "Your identity is verified, but your Tradie credentials (licence, insurance) are awaiting admin review. Once approved by our team, you will be able to apply and quote.";
    }

    if (isTradie && tradieVerified) {
      return "Your Tradie account is fully verified! You can apply for open jobs, send quotes, and submit completion proofs.";
    }

    return "You are signed in. Visit your profile verification tab to check active credentials.";
  };

  const getBotResponse = (query: string): { text: string; links?: Array<{ label: string; to: string }> } => {
    const q = query.toLowerCase().trim();

    // 1. Post a job
    if (q.includes('post') || q.includes('create job') || q.includes('new job')) {
      return {
        text: 'To post a job, click the "Post a Job" button in the navigation header or go to the Post Job page. Fill in the title, trade categories, description, and suburb. Once posted, local tradies will be notified to quote.',
        links: [{ label: 'Post a Job', to: '/post-job' }]
      };
    }

    // 2. Browse jobs
    if (q.includes('browse job') || q.includes('find job') || q.includes('search job') || q.includes('view job')) {
      return {
        text: 'You can browse open jobs on our Jobs board. Filter by trade category, state, region, or suburb to find work in your local service area.',
        links: [{ label: 'Browse Jobs', to: '/jobs' }]
      };
    }

    // 3. Why can\'t apply / quote
    if (q.includes('apply') || q.includes('quote') || q.includes('bid') || q.includes('why can\'t') || q.includes('locked')) {
      if (!user) {
        return {
          text: 'You must be signed in to apply or quote. Please register or log in first.',
          links: [{ label: 'Log In', to: '/login' }]
        };
      }
      const role = profile?.role || 'customer';
      if (role === 'customer') {
        return {
          text: 'Customers cannot apply or quote on jobs. If you are a tradesperson, you can change your role or register a tradie profile in your account settings.',
          links: [{ label: 'My Profile', to: '/profile' }]
        };
      }
      if (!profile?.tradie_verified) {
        return {
          text: 'To apply or quote on jobs, you must have an approved tradie profile. Complete your ID verification and submit your licence and insurance credentials in the profile page.',
          links: [{ label: 'Verify Account', to: '/profile' }]
        };
      }
      return {
        text: 'Your tradie account is fully verified. If you still cannot apply to a job, verify that: 1) the job is not closed or already accepted; 2) the job does not belong to you; 3) you have not already submitted a quote.',
        links: [{ label: 'Jobs Board', to: '/jobs' }]
      };
    }

    // 4. Verification
    if (q.includes('verify') || q.includes('verification') || q.includes('selfie') || q.includes('licence') || q.includes('insurance')) {
      return {
        text: 'TradieHubAU uses identity and credential verification to build trust. Customers need identity verification for secure jobs, while tradies must submit public liability insurance and trade licences. Go to My Profile -> Verification to submit your documents.',
        links: [{ label: 'Verification Tab', to: '/profile' }]
      };
    }

    // 5. Protected payments / payment released / payment funded
    if (q.includes('payment') || q.includes('pay') || q.includes('funded') || q.includes('escrow') || q.includes('release')) {
      return {
        text: 'We secure quotes using a secure payment ledger. The customer funds the job payment to our secure system before the tradie starts work. Once work is completed and approved, the funded payment is released. This protects both customers and tradies.',
        links: [{ label: 'Secure Payments Info', to: '/protected-payments' }]
      };
    }

    // 6. Submit proof / complete work
    if (q.includes('proof') || q.includes('complete') || q.includes('finish') || q.includes('completion')) {
      return {
        text: 'When a job is done, the tradie uploads completion proof (description and photos of finished work) on the job details screen. This prompts the customer to review and release the secure funded payment.',
        links: [{ label: 'My Jobs', to: '/jobs' }]
      };
    }

    // 7. Raise a dispute
    if (q.includes('dispute') || q.includes('issue') || q.includes('problem') || q.includes('refund') || q.includes('arbitration')) {
      return {
        text: 'If a disagreement arises regarding work quality or completion, either party can raise a dispute. This locks the secure job payment and places it in our admin review queue for review and resolution.',
        links: [{ label: 'Dispute Process Explainer', to: '/dispute-process' }]
      };
    }

    // 8. Messages / Chat
    if (q.includes('message') || q.includes('chat') || q.includes('talk') || q.includes('contact')) {
      return {
        text: 'You can chat in real-time with customers or tradies on any active job page. Go to the Messages tab to view active chat threads.',
        links: [{ label: 'Inbox', to: '/messages' }]
      };
    }

    // 9. Sounds / Audio
    if (q.includes('sound') || q.includes('audio') || q.includes('chime') || q.includes('volume') || q.includes('alert')) {
      return {
        text: 'You can configure chat and notification sounds on the My Profile page under the "App Sounds" tab. Enable/disable chimes and choose your preferred alert tones.',
        links: [{ label: 'App Sounds', to: '/profile' }]
      };
    }

    // 10. Edit profile
    if (q.includes('profile') || q.includes('edit') || q.includes('avatar') || q.includes('change name')) {
      return {
        text: 'To edit your display name, contact phone, or trade settings, go to the My Profile settings page.',
        links: [{ label: 'Edit Profile', to: '/profile' }]
      };
    }

    // 11. Invoices / Receipts
    if (q.includes('invoice') || q.includes('receipt') || q.includes('bill')) {
      return {
        text: 'Once a job is approved and payment is released, the platform automatically generates invoicing receipt records. You can download these records in your dashboard.',
        links: [{ label: 'My Jobs', to: '/jobs' }]
      };
    }

    // 12. Support / Human
    if (q.includes('support') || q.includes('contact') || q.includes('human') || q.includes('help') || q.includes('agent')) {
      return {
        text: 'For tax questions, payment settlements, identity validation details, or safety concerns, please contact our support staff directly or email support@tradiehub.com.au.',
        links: [{ label: 'Contact Support', to: '/support' }]
      };
    }

    // Default response
    return {
      text: 'I can help with basic site directions, verification questions, secure payment flows, and profile settings. If you need account specific support, please contact our team.',
      links: [{ label: 'Support Page', to: '/support' }]
    };
  };

  const handleSend = (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Simulate bot response after a brief visual delay
    setTimeout(() => {
      const response = getBotResponse(textToSend);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response.text,
        links: response.links,
      };
      setMessages(prev => [...prev, botMsg]);
      // Play reserved bot-reply sound
      void playSoundSafe('/audio/bot-reply.mp3');
    }, 400);
  };

  const handleChipClick = (text: string) => {
    handleSend(text);
  };

  const quickPrompts = [
    'How do I post a job?',
    'Why can\'t I apply?',
    'How do payments work?',
    'How do I verify?',
    'How do I raise a dispute?',
    'How do I change sounds?',
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={chatbotRef}>
      {/* Closed State Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4.5 py-3 bg-primary hover:bg-primary/95 text-primary-foreground rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 min-h-12 min-w-[130px] justify-center"
          aria-label="Open support chat"
        >
          <MessageSquare className="h-5 w-5 animate-pulse text-primary-foreground" />
          <span className="text-[11px] font-black uppercase tracking-wider">Need help?</span>
        </button>
      )}

      {/* Open State Panel */}
      {isOpen && (
        <div className="w-[340px] sm:w-[380px] h-[520px] max-h-[85vh] bg-card border border-border/70 rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

          {/* Header */}
          <div className="bg-primary px-4 py-3.5 text-primary-foreground flex items-center justify-between shadow-sm relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary opacity-40"></div>
            <div className="relative flex items-center gap-2.5">
              <div className="p-1.5 bg-white/10 rounded-xl">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider">TradieHubAU Help</h3>
                <p className="text-[9px] opacity-80 font-bold mt-0.5">Ask questions about using the site</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/15 rounded-lg text-primary-foreground transition-all relative"
              aria-label="Close support chat"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* User Status Bar (Profile-Aware) */}
          <div className="px-4 py-2 bg-muted/40 border-b border-border/40 flex items-start gap-2 shrink-0">
            <User className="h-3.5 w-3.5 text-primary/75 mt-0.5 shrink-0" />
            <p className="text-[9px] font-bold text-muted-foreground leading-normal">
              {getProfileStatusText()}
            </p>
          </div>

          {/* Messages and Quick Prompts Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5 flex flex-col">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-semibold leading-normal ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none shadow-sm'
                      : 'bg-card text-foreground/90 border border-border/40 rounded-tl-none shadow-xs'
                  }`}
                >
                  <div>{msg.text}</div>
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.links.map((link, i) => (
                        <Link
                          key={i}
                          to={link.to}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-muted text-[9px] font-black uppercase text-primary border border-border/60 rounded-lg shadow-xs transition-all"
                        >
                          {link.label} &rarr;
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />

            {/* Quick Prompt Chips */}
            {messages.length === 1 && (
              <div className="space-y-2 pt-2 shrink-0">
                <p className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-wider">Suggested Questions</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleChipClick(prompt)}
                      className="px-3 py-2 bg-background border border-border/60 hover:bg-muted/40 hover:border-border text-left rounded-xl text-[10px] font-bold text-foreground/85 transition-all shadow-xs"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="px-4 py-3 border-t border-border/60 bg-background flex gap-2 items-center shrink-0"
          >
            <label htmlFor="chatbot-input" className="sr-only">Type your question</label>
            <input
              id="chatbot-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-grow h-10 bg-muted/65 hover:bg-muted/90 focus:bg-background border border-border/50 focus:border-primary/60 rounded-xl px-3.5 text-xs font-semibold placeholder:text-muted-foreground/50 transition-all text-foreground outline-none"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-10 w-10 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl transition-all disabled:opacity-40 flex items-center justify-center shrink-0 active:scale-95"
              aria-label="Send question"
            >
              <Send className="h-4 w-4 text-primary-foreground" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
