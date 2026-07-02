import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { MessageSquare, X, Send, User, Sparkles, ChevronLeft, HelpCircle } from 'lucide-react';
import { playSoundSafe } from '../lib/soundPreferences';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  links?: Array<{ label: string; to: string }>;
  suggestedCategories?: string[];
  suggestedPrompts?: string[];
}

export default function SupportChatbot() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
        if (window.innerWidth >= 768) {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const categories = [
    { id: 'customer_help', name: 'Customer Help' },
    { id: 'tradie_help', name: 'Tradie Help' },
    { id: 'verification', name: 'Verification' },
    { id: 'payments', name: 'Protected Payments' },
    { id: 'messages', name: 'Messages & Chat' },
    { id: 'disputes', name: 'Disputes' },
    { id: 'profile', name: 'Profile & Settings' },
    { id: 'job_details', name: 'Job Details Workspace' },
  ];

  const categoryQuestions: Record<string, string[]> = {
    customer_help: [
      'How do I post a job?',
      'How do I review quotes?',
      'How do I approve completed work?',
      'How do I raise a dispute?',
    ],
    tradie_help: [
      'How do I apply for jobs?',
      'Why can’t I quote?',
      'How do I submit completion proof?',
      'Why are contact details locked?',
    ],
    verification: [
      'What is account verification?',
      'How do I verify my identity?',
      'What is tradie credential check?',
      'Why is my verification pending?',
    ],
    payments: [
      'What are protected payments?',
      'What does payment funded mean?',
      'How do I release payment?',
      'Why is payment release blocked?',
    ],
    messages: [
      'How do messages work?',
      'Why can’t I message someone?',
      'Why is contact information hidden?',
      'How do I change sound alerts?',
    ],
    disputes: [
      'How do I raise a dispute?',
      'What happens during disputes?',
      'How do I contact dispute support?',
    ],
    profile: [
      'How do I edit my profile?',
      'How do I select app sounds?',
      'What can I do on my account?',
    ],
    job_details: [
      'Explain the Job Details card',
      'What is the Contract tab?',
      'What are Requests?',
      'What is Evidence?',
      'Why is a button disabled?',
      'How do invoices and receipts work?',
    ],
  };

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

  const getPageAwareText = (): string | null => {
    if (path === '/profile') {
      return "Looks like you’re on Profile — I can help with verification, sounds, or account settings.";
    }
    if (path.startsWith('/jobs') || path.startsWith('/browse-jobs')) {
      return "Looks like you're on the Jobs page — I can help with posting, applying, quoting, secure payments, variations, or disputes.";
    }
    if (path.startsWith('/messages')) {
      return "Looks like you're on Messages — I can help with chat threads, locked contact info, or sound alerts.";
    }
    if (path.startsWith('/protected-payments')) {
      return "Looks like you're learning about Payments — I can explain funding, contract active status, and releases.";
    }
    if (path.startsWith('/dispute-process')) {
      return "Looks like you're reviewing the Dispute process — I can explain how to open a dispute or how review works.";
    }
    return null;
  };

  const getBotResponse = (query: string): {
    text: string;
    links?: Array<{ label: string; to: string }>;
    suggestedCategories?: string[];
    suggestedPrompts?: string[];
  } => {
    const q = query.toLowerCase().trim();

    // Account capability summary
    if (q.includes('what can i do') || q.includes('my account') || q.includes('capability') || q.includes('capabilities')) {
      if (!user) {
        return {
          text: 'Guest Account Capabilities:\n1. Browse open jobs board and listings.\n2. Browse public tradie profiles.\n\n*Note: To post jobs, message users, or quote on work, please sign in or register.*',
          links: [
            { label: 'Register / Sign In', to: '/login' },
            { label: 'Browse Jobs', to: '/jobs' }
          ]
        };
      }

      const role = profile?.role || 'customer';
      const isVerifiedTradie = profile?.tradie_verified || false;
      const isIdVerified = profile?.identity_verified || false;

      if (role === 'customer') {
        return {
          text: `Customer Account (${profile?.display_name || 'Active User'}):\n1. Post new jobs to the jobs board.\n2. Review incoming quotes from verified tradies.\n3. Message tradies regarding your postings.\n4. Fund secure payments to keep work protected.\n5. Review completion evidence and release payments.\n6. Raise disputes if issues arise.`,
          links: [
            { label: 'Post a Job', to: '/post-job' },
            { label: 'My Jobs Dashboard', to: '/jobs' }
          ]
        };
      }

      if (!isIdVerified) {
        return {
          text: `Unverified Tradie Account:\n1. Browse open jobs board listings.\n2. View customer job postings.\n\n*Lock: You must upload identity verification details before you can quote or apply.*`,
          links: [{ label: 'Verify Identity Now', to: '/profile' }]
        };
      }

      if (!isVerifiedTradie) {
        return {
          text: `Pending Credentials Review:\n1. Your ID is uploaded, but licence or public liability insurance verification is pending admin approval.\n2. Once approved by staff, you can bid, quote, and apply for jobs.`,
          links: [{ label: 'Check Verification Tab', to: '/profile' }]
        };
      }

      return {
        text: `Verified Tradie Account:\n1. Quote on open jobs board listings.\n2. Message customers on active threads.\n3. Send custom quotation lists.\n4. Request variation adjustments or early payment releases.\n5. Upload finished work photos/evidence and submit completion proof.`,
        links: [
          { label: 'Browse Jobs Board', to: '/jobs' },
          { label: 'My Inbox', to: '/messages' }
        ]
      };
    }

    // Trust, Licence, Badges, and Quote due diligence question handlers
    if (q.includes('trust') || q.includes('check') || q.includes('licens') || q.includes('licence') || q.includes('allowed to do') || q.includes('allowed to work') || q.includes('badge') || q.includes('verified mean')) {
      if (q.includes('can i quote') || q.includes('allowed to do') || q.includes('allowed to work')) {
        return {
          text: 'Contractor Licence & Quote Responsibilities:\n' +
            '1. Tradies remain responsible for checking that they hold the correct current licence, insurance, qualifications, and experience for the exact work they quote or accept.\n' +
            '2. Licensing and registration requirements can vary by state, licence class, job value, and job scope.\n' +
            '3. Tradies must not use handyman/general maintenance categories to quote on regulated work.\n' +
            '*Note: This is not legal, building, tax, or insurance advice.*',
          links: [
            { label: 'Check Verification Rules', to: '/profile' },
            { label: 'Browse Jobs Board', to: '/jobs' }
          ]
        };
      }

      if (q.includes('badge') || q.includes('verified mean')) {
        return {
          text: 'TradieHubAU Trust Badges Explained:\n' +
            '1. ID Checked: Photo ID matches name details.\n' +
            '2. Insurance Checked: Holds active public liability insurance.\n' +
            '3. Licensed Trade Verified: State-specific trade licence submitted & verified by admin.\n' +
            '\n' +
            '**Important Notice:** Badges show TradieHubAU review status only. Customers should still check licence/insurance suitability for their specific job. Requirements vary by state, licence class, and job scope.',
          links: [
            { label: 'My Verification Panel', to: '/profile' }
          ]
        };
      }

      // Default trust / due diligence matching
      return {
        text: 'Trust & Due Diligence Guidelines:\n' +
          '1. **Platform Checks:** TradieHubAU runs platform trust checks (ID, ABN, base insurance, trade credentials) to reduce risk, but this does not replace the customer\'s own due diligence.\n' +
          '2. **Customer Due Diligence:** Customers should review the tradie\'s profile, verification badges, quote details, reviews, experience, and uploaded completion evidence before accepting work or releasing payment.\n' +
          '3. **Verify Licence Suitability:** Confirm that the contractor holds the correct active licence registration for the specific work, state/territory, job value, and job scope. Requirements vary by state, licence class, and job scope.\n' +
          '4. **Raise Disputes:** Raise a dispute or contact support before approving work if you are not satisfied with the evidence or outcome. This is not legal, building, tax, or insurance advice.',
        links: [
          { label: 'Dispute Process Explainer', to: '/dispute-process' },
          { label: 'Protected Payments', to: '/protected-payments' }
        ]
      };
    }

    // 1. Post a job
    if (q.includes('post') || q.includes('create job') || q.includes('new job')) {
      return {
        text: 'To post a job:\n1. Click "Post a Job" in the header or dashboard.\n2. Select relevant trade categories (e.g. Plumbing, Electrical).\n3. Provide descriptions, photo references, and the suburb.\n4. Click Post to notify local qualified tradespeople.',
        links: [{ label: 'Post a Job →', to: '/post-job' }]
      };
    }

    // 2. Browse jobs
    if (q.includes('browse job') || q.includes('find job') || q.includes('search job') || q.includes('view job')) {
      return {
        text: 'To browse open jobs:\n1. Go to the Jobs board.\n2. Filter listings by trade type, region, state, or suburb.\n3. Click any listing card to view full descriptions and requirements.',
        links: [{ label: 'Browse Jobs →', to: '/jobs' }]
      };
    }

    // 3. Why can't I apply? / Why can't I quote?
    if (q.includes('apply for jobs') || q.includes('can’t i quote') || q.includes('cant i quote') || q.includes('can\'t i quote') || q.includes('quote locked') || q.includes('apply locked') || q.includes('cannot apply') || q.includes('cant apply') || q.includes('can\'t apply') || q.includes('why are contact') || q.includes('details locked')) {
      if (!user) {
        return {
          text: 'Applications and quotes require an active account. Please register or sign in first.',
          links: [{ label: 'Sign In / Join →', to: '/login' }]
        };
      }
      const role = profile?.role || 'customer';
      if (role === 'customer') {
        return {
          text: 'Quoting and applying is restricted to tradespeople. Customers post jobs and hire tradies. If you are a tradesperson, you can check your role or configure profile credentials.',
          links: [{ label: 'My Profile →', to: '/profile' }]
        };
      }
      if (!profile?.identity_verified) {
        return {
          text: 'To apply or quote, you must complete identity verification. Please upload photo identification documents in the verification section.',
          links: [{ label: 'Verify Identity →', to: '/profile' }]
        };
      }
      if (!profile?.tradie_verified) {
        return {
          text: 'Your identity is verified, but your trade credentials (licence, liability insurance) are awaiting admin review. Once approved, bidding will be unlocked.',
          links: [{ label: 'Credential Status →', to: '/profile' }]
        };
      }
      return {
        text: 'Your tradie account is verified. If you cannot apply, check if:\n1. You are the owner of the job.\n2. You have already submitted a quote.\n3. The job status is closed or already awarded.\n4. Direct contact details are locked for safety prior to quote acceptance.',
        links: [{ label: 'Jobs Board →', to: '/jobs' }]
      };
    }

    // 4. Verification
    if (q.includes('verification') || q.includes('verify') || q.includes('selfie') || q.includes('licence') || q.includes('insurance') || q.includes('credential')) {
      return {
        text: 'Verification Details:\n1. Customer ID: Required for high-value secure jobs to protect users.\n2. Tradie ID: Selfie and photo ID to check authenticity.\n3. Credentials: Trade licence and Public Liability Insurance certificate uploads, reviewed by admin staff.',
        links: [{ label: 'Verification Section →', to: '/profile' }]
      };
    }

    // 5. Protected payments / escrow / payment release blocked / approve work disabled / release payment
    if (q.includes('payment') || q.includes('pay') || q.includes('funded') || q.includes('escrow') || q.includes('release') || q.includes('approve work') || q.includes('receipt') || q.includes('invoice')) {
      if (q.includes('funded')) {
        return {
          text: 'Payment Funded status means the customer has successfully deposited the accepted quote budget into the secure ledger system. Tradies should not start physical work until the status is officially "Funded".',
          links: [{ label: 'Payments Explainer →', to: '/protected-payments' }]
        };
      }
      if (q.includes('release blocked') || q.includes('approve work disabled') || q.includes('disabled') || q.includes('blocked')) {
        return {
          text: 'The "Approve Completed Work" and "Release Payment" controls are locked until:\n1. The contracted tradie submits formal completion proof and description.\n2. Any active dispute on the job is fully resolved by the administrator.',
          links: [{ label: 'My Jobs Dashboard →', to: '/jobs' }]
        };
      }
      if (q.includes('invoice') || q.includes('receipt')) {
        return {
          text: 'Invoicing & Receipts:\n1. Once payment is released, the system generates invoicing receipt records automatically.\n2. Customers download the "View Receipt".\n3. Tradies download the "Payout Statement" breakdown.\n*Note: Tax and GST statements conform to standard calculations.*',
          links: [{ label: 'Jobs Dashboard →', to: '/jobs' }]
        };
      }
      return {
        text: 'Protected Payments Flow:\n1. Customer accepts a quote and funds the secure payment ledger.\n2. Tradie performs work under "Funded" status.\n3. Tradie uploads completion proof.\n4. Customer reviews and approves work to release the payment.',
        links: [{ label: 'Learn Protected Payments →', to: '/protected-payments' }]
      };
    }

    // 6. Submit proof / completion proof / completion proof needed
    if (q.includes('proof') || q.includes('complete') || q.includes('finish') || q.includes('milestone')) {
      return {
        text: 'Completion Proof:\n1. Required before customers can release secure payments.\n2. Tradies upload finished photos and descriptions under the Job Details "Evidence" tab.\n3. Customers review these details before clicking "Approve Completed Work".',
        links: [{ label: 'My Jobs Dashboard →', to: '/jobs' }]
      };
    }

    // 7. Dispute / dispute process / raise dispute
    if (q.includes('dispute') || q.includes('issue') || q.includes('problem') || q.includes('refund') || q.includes('arbitration')) {
      return {
        text: 'Dispute Handling:\n1. Either party can raise a dispute inside the job workspace if work is unsatisfactory.\n2. This locks the funded payment in place.\n3. Admin staff review the contract breakdown, requests, and evidence timeline to arbitrate.',
        links: [{ label: 'Dispute Process Explainer →', to: '/dispute-process' }]
      };
    }

    // 8. Messages / Chat / Why can't I message
    if (q.includes('message') || q.includes('chat') || q.includes('talk') || q.includes('contact') || q.includes('inbox')) {
      return {
        text: 'Real-time Messaging:\n1. Chat is available on any active job Details workspace page.\n2. The inbox contains active user chat threads.\n3. Direct contact phone/email details remain hidden until a quote is accepted to prevent platform bypasses.',
        links: [
          { label: 'My Inbox →', to: '/messages' },
          { label: 'My Jobs Dashboard →', to: '/jobs' }
        ]
      };
    }

    // 9. Sounds / Audio / change sounds
    if (q.includes('sound') || q.includes('audio') || q.includes('chime') || q.includes('volume') || q.includes('alert')) {
      return {
        text: 'Change Sound Alerts:\n1. Go to My Profile page.\n2. Open the "App Sounds" settings tab.\n3. Toggle sound alerts on/off and select your preferred tones.',
        links: [{ label: 'Configure Sounds →', to: '/profile' }]
      };
    }

    // 10. Edit profile
    if (q.includes('profile') || q.includes('edit') || q.includes('avatar') || q.includes('change name') || q.includes('settings')) {
      return {
        text: 'To edit profile details, update names, or upload profile pictures, go to the My Profile settings section.',
        links: [{ label: 'Edit Profile →', to: '/profile' }]
      };
    }

    // 11. Job Details / Contract / Requests / Evidence
    if (q.includes('job details') || q.includes('contract') || q.includes('request') || q.includes('evidence') || q.includes('timeline') || q.includes('variation') || q.includes('early release')) {
      if (q.includes('contract')) {
        return {
          text: 'Job Details - Contract Tab:\nDisplays the binding contract quote line items. These are locked once payment is funded by the customer.',
          links: [{ label: 'Jobs Dashboard →', to: '/jobs' }]
        };
      }
      if (q.includes('request') || q.includes('variation') || q.includes('early release')) {
        return {
          text: 'Job Details - Requests Tab:\n1. Variation Requests: Used by tradies to request changes or extra costs, subject to customer approval.\n2. Early Release: Used to request partial payouts before full completion.',
          links: [{ label: 'Jobs Dashboard →', to: '/jobs' }]
        };
      }
      if (q.includes('evidence') || q.includes('timeline')) {
        return {
          text: 'Job Details - Evidence Tab:\nShows the job action timeline log and completion proof photo/description uploads. Essential for verification prior to approvals.',
          links: [{ label: 'Jobs Dashboard →', to: '/jobs' }]
        };
      }
      return {
        text: 'Job Details Workspace Tabs:\n1. Overview: Status and main actions.\n2. Contract: Bound quote lines.\n3. Requests: Variation and early release requests.\n4. Evidence: Work proof logs and dispute attachments.',
        links: [{ label: 'Jobs Dashboard →', to: '/jobs' }]
      };
    }

    // Default Fallback
    return {
      text: 'I can help with basic site directions, verification, secure payment flows, and profile settings. For this query, please contact our support team or try one of these topics:',
      links: [{ label: 'Contact Support →', to: '/support' }],
      suggestedCategories: ['customer_help', 'tradie_help', 'job_details']
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

    setTimeout(() => {
      const response = getBotResponse(textToSend);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response.text,
        links: response.links,
        suggestedCategories: response.suggestedCategories,
        suggestedPrompts: response.suggestedPrompts,
      };
      setMessages(prev => [...prev, botMsg]);
      void playSoundSafe('/audio/bot-reply.mp3');
    }, 400);
  };

  const handleChipClick = (text: string) => {
    handleSend(text);
  };

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

          {/* Page-Aware Context Bar */}
          {getPageAwareText() && (
            <div className="px-4 py-1.5 bg-primary/5 border-b border-primary/10 flex items-start gap-2 shrink-0">
              <HelpCircle className="h-3.5 w-3.5 text-primary/75 shrink-0 mt-0.5" />
              <p className="text-[9px] font-bold text-primary leading-normal">
                {getPageAwareText()}
              </p>
            </div>
          )}

          {/* Messages and Quick Prompts Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5 flex flex-col">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-semibold leading-normal whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none shadow-sm'
                      : 'bg-card text-foreground/90 border border-border/40 rounded-tl-none shadow-xs'
                  }`}
                >
                  <div>{msg.text}</div>

                  {/* Inline Links/Buttons */}
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.links.map((link, i) => (
                        <Link
                          key={i}
                          to={link.to}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-muted text-[9px] font-black uppercase text-primary border border-border/60 rounded-lg shadow-xs transition-all"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Fallback Suggested Categories */}
                  {msg.suggestedCategories && msg.suggestedCategories.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border/30 space-y-1.5">
                      <p className="text-[8px] font-black text-muted-foreground/80 uppercase">Browse Categories:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedCategories.map((catId) => {
                          const cat = categories.find(c => c.id === catId);
                          if (!cat) return null;
                          return (
                            <button
                              key={catId}
                              type="button"
                              onClick={() => {
                                setSelectedCategory(catId);
                                handleChipClick(cat.name);
                              }}
                              className="px-2 py-1 bg-background hover:bg-muted text-[9px] font-bold text-foreground/80 border border-border/60 rounded-md transition-all shadow-2xs"
                            >
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fallback Suggested Prompts */}
                  {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border/30 space-y-1.5">
                      <p className="text-[8px] font-black text-muted-foreground/80 uppercase">Suggested Prompts:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedPrompts.map((promptText, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSend(promptText)}
                            className="px-2 py-1 bg-background hover:bg-muted text-[9px] font-bold text-foreground/80 border border-border/60 rounded-md transition-all shadow-2xs"
                          >
                            {promptText}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />

            {/* Menu-Guided System (Only displays when in initial state) */}
            {messages.length === 1 && (
              <>
                {selectedCategory === null ? (
                  <div className="space-y-2 pt-2 shrink-0">
                    <p className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-wider">Browse Help Categories</p>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className="px-3 py-2 bg-background border border-border/60 hover:bg-muted/40 hover:border-border text-left rounded-xl text-[10px] font-bold text-foreground/85 transition-all shadow-xs flex items-center justify-between"
                        >
                          <span>{cat.name}</span>
                          <span className="text-muted-foreground/50 text-[10px] font-black">&rarr;</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend('What can I do on my account?')}
                      className="w-full px-3 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 text-center rounded-xl text-[10px] font-bold text-primary transition-all flex items-center justify-center gap-1.5"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>What can I do on my account?</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-wider">
                        {categories.find(c => c.id === selectedCategory)?.name || 'Questions'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className="inline-flex items-center gap-1 text-[9px] font-black text-primary hover:underline"
                      >
                        <ChevronLeft className="h-3 w-3" />
                        <span>Back</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {categoryQuestions[selectedCategory]?.map((qText, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleChipClick(qText)}
                          className="px-3 py-2 bg-background border border-border/60 hover:bg-muted/40 hover:border-border text-left rounded-xl text-[10px] font-bold text-foreground/85 transition-all shadow-xs"
                        >
                          {qText}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
