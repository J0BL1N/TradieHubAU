import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Smile,
  X,
  User,
} from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  getMessageAttachmentsForMessages,
  getConversationMessages,
  getJobConversations,
  getMessageJobDetails,
  markIncomingMessagesRead,
  openJobConversation,
  sendJobMessage,
  sendJobMessageWithAttachments,
} from '../lib/messages';
import { supabase } from '../lib/supabase';
import { KEYS, getSoundPreference, getSoundEnabledPreference, playSoundSafe } from '../lib/soundPreferences';
import { formatJobLocation } from '../lib/auLocations';
import type { ConversationSummary, MessageAttachment, MessageAttachmentInput, MessageJobDetails, MessageRecord } from '../lib/messages';

function formatTimestamp(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    accepted: 'Accepted — awaiting payment',
    payment_held: 'Payment funded — contract active',
    completed_pending_review: 'Completion under review',
    cancelled: 'Cancelled - payment refunded',
    disputed: 'Disputed — admin review',
    completed: 'Completed — payment released',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

interface ModerationResult {
  isBlocked: boolean;
  reasons: string[];
  censoredText: string;
}

function moderateClientMessage(text: string, paymentStatus: string): ModerationResult {
  const reasons: string[] = [];
  let censoredText = text;

  // 1. Censor profanity (always)
  const badWords = ['crap', 'shit', 'fuck', 'bitch', 'asshole', 'cunt', 'bastard', 'idiot', 'stupid'];
  for (const word of badWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    censoredText = censoredText.replace(regex, '*'.repeat(word.length));
  }

  // 2. Detect bypasses (only block if payment status is pending)
  if (paymentStatus === 'pending') {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
    const phoneRegex = /(?:\+?61|0)\s*[23478](?:\s*\d){8}\b|\b\d{4}\s*\d{3}\s*\d{3}\b/i;
    const socialRegex = /\b(facebook|fb|instagram|insta|linkedin|whatsapp|viber|telegram|snapchat|tiktok|socials?|handle)\b/i;

    if (emailRegex.test(text)) {
      reasons.push('email_bypass');
    }
    if (phoneRegex.test(text)) {
      reasons.push('phone_bypass');
    }
    if (socialRegex.test(text)) {
      reasons.push('social_bypass');
    }
  }

  // 3. Detect off-platform payment attempts (always block/flag)
  const paymentRegex = /\b(bank transfer|direct deposit|pay cash|paypal|pay outside|outside the app|off-platform|pay direct|cash payment|bsb|acc number|account number)\b/i;
  if (paymentRegex.test(text)) {
    reasons.push('off_platform_payment');
  }

  const isBlocked = reasons.length > 0;
  return { isBlocked, reasons, censoredText };
}

function sortMessages(messages: MessageRecord[]) {
  return [...messages].sort((a, b) => {
    const byTime = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return byTime || a.id.localeCompare(b.id);
  });
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Payment pending',
    held: 'Payment funded',
    held_in_escrow: 'Payment funded',
    released: 'Payment released',
    refunded: 'Payment refunded',
    failed: 'Payment failed',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

function formatAUD(value: number) {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatCentsToAUD(cents: number) {
  return formatAUD(cents / 100);
}

function formatBudget(min: number | null, max: number | null) {
  if (min && max) return `${formatAUD(min)} - ${formatAUD(max)}`;
  if (min) return `From ${formatAUD(min)}`;
  if (max) return `Up to ${formatAUD(max)}`;
  return 'Not provided';
}

function hasUnreadIncomingUserMessages(messages: MessageRecord[], currentUserId: string) {
  return messages.some(message =>
    message.message_type !== 'system' &&
    message.sender_id !== currentUserId &&
    !message.read
  );
}

const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const MESSAGE_PAGE_SIZE = 10;
const SCROLL_EDGE_THRESHOLD = 96;
const SCROLL_RETRY_DELAYS = [0, 60, 180, 360];

type SelectedAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
};

function friendlyMessageError(message: string | undefined, fallback: string) {
  if (message === 'This beta conversation has reached the temporary 1,000 message limit.') return message;
  if (message === 'Could not load message attachments. Please try refreshing.') return message;
  return fallback;
}

function sanitizeFileName(name: string) {
  const cleanName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleanName || 'attachment';
}

function getImageDimensions(file: File) {
  return new Promise<{ width: number | null; height: number | null }>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    image.src = url;
  });
}

const COMMON_EMOJIS = ['👍', '✅', '🙏', '🙂', '😊', '😄', '👌', '👏', '💬', '📷', '🛠️', '🏠', '⏰', '💰', '🚧', '⭐'];

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [newMessageAvailable, setNewMessageAvailable] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reply, setReply] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ attachments: MessageAttachment[]; index: number } | null>(null);
  const [jobDetailsOpen, setJobDetailsOpen] = useState(false);
  const [jobDetails, setJobDetails] = useState<MessageJobDetails | null>(null);
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [jobDetailsError, setJobDetailsError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const selectedAttachmentsRef = useRef<SelectedAttachment[]>([]);
  const shouldStickToBottomRef = useRef(true);
  const scrollRetryTimeoutsRef = useRef<number[]>([]);

  const messagesCacheRef = useRef<Record<string, MessageRecord[]>>({});
  const hasMoreCacheRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      messagesCacheRef.current[activeConversationId] = messages;
      hasMoreCacheRef.current[activeConversationId] = hasOlderMessages;
    }
  }, [messages, activeConversationId, hasOlderMessages]);

  const activeConversation = useMemo(
    () => conversations.find(conversation => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations]
  );

  const loadJobDetails = useCallback(async (jobId: string) => {
    setJobDetailsLoading(true);
    setJobDetailsError(null);
    try {
      const { data, error: detailsError } = await getMessageJobDetails(jobId);
      if (detailsError || !data) throw detailsError || new Error('Job details could not be loaded.');
      setJobDetails(data);
    } catch (detailsError: any) {
      setJobDetails(null);
      setJobDetailsError(detailsError.message || 'Job details could not be loaded.');
    } finally {
      setJobDetailsLoading(false);
    }
  }, []);

  const isMessageListNearBottom = useCallback(() => {
    const list = messageListRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= SCROLL_EDGE_THRESHOLD;
  }, []);

  const clearScheduledScrolls = useCallback(() => {
    scrollRetryTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    scrollRetryTimeoutsRef.current = [];
  }, []);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scroll = () => {
      const list = messageListRef.current;
      if (!list) return;
      list.scrollTo({ top: list.scrollHeight - list.clientHeight, behavior });
      setNewMessageAvailable(false);
    };

    window.requestAnimationFrame(scroll);
  }, []);

  const scheduleScrollToBottom = useCallback((
    behavior: ScrollBehavior = 'auto',
    options: { force?: boolean; retry?: boolean } = {}
  ) => {
    if (options.force) shouldStickToBottomRef.current = true;

    const shouldScroll = () => options.force || shouldStickToBottomRef.current || isMessageListNearBottom();
    const run = () => {
      if (!shouldScroll()) return;
      scrollMessagesToBottom(behavior);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });

    if (options.retry) {
      clearScheduledScrolls();
      scrollRetryTimeoutsRef.current = SCROLL_RETRY_DELAYS.map(delay =>
        window.setTimeout(run, delay)
      );
    }
  }, [clearScheduledScrolls, isMessageListNearBottom, scrollMessagesToBottom]);

  const loadConversations = useCallback(async (preferredConversationId?: string | null) => {
    if (!user) return;
    const { data, error: conversationError } = await getJobConversations(user.id);
    if (conversationError) throw conversationError;
    setConversations(data);

    const requestedId = preferredConversationId || searchParams.get('conversation');
    const nextId = requestedId && data.some(item => item.id === requestedId)
      ? requestedId
      : data[0]?.id || null;
    shouldStickToBottomRef.current = true;
    setActiveConversationId(nextId);
    setMobileThreadOpen(Boolean(nextId && requestedId));
  }, [searchParams, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const initialise = async () => {
      if (conversations.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        let preferredId = searchParams.get('conversation');
        const jobId = searchParams.get('job');
        if (jobId) {
          const { data, error: openError } = await openJobConversation(jobId);
          if (openError) throw openError;
          preferredId = data;
          if (data && !cancelled) setSearchParams({ conversation: data }, { replace: true });
        }
        if (!cancelled) await loadConversations(preferredId);
      } catch (initialiseError: any) {
        if (!cancelled) setError(initialiseError.message || 'Messages could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initialise();
    return () => { cancelled = true; };
  }, [authLoading, loadConversations, searchParams, setSearchParams, user]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!user) return;

    const cached = messagesCacheRef.current[conversationId];
    if (cached) {
      setMessages(cached);
      setHasOlderMessages(hasMoreCacheRef.current[conversationId] ?? false);
      setMessagesLoading(false);
    } else {
      setMessages([]);
      setHasOlderMessages(false);
      setMessagesLoading(true);
    }

    setSyncing(true);
    setNewMessageAvailable(false);
    setError(null);
    try {
      const { data, error: messagesError } = await getConversationMessages(conversationId, { limit: MESSAGE_PAGE_SIZE });
      if (messagesError) throw messagesError;

      const loadedMessages = sortMessages(data.messages);

      // Update cache
      messagesCacheRef.current[conversationId] = loadedMessages;
      hasMoreCacheRef.current[conversationId] = data.hasMore;

      // Keep any optimistic messages in flight
      setMessages(current => {
        const inFlight = current.filter(m => m.id.startsWith('temp-'));
        const nonDuplicateLoaded = loadedMessages.filter(lm =>
          !inFlight.some(ifm => ifm.text === lm.text && ifm.sender_id === lm.sender_id)
        );
        return sortMessages([...inFlight, ...nonDuplicateLoaded]);
      });
      setHasOlderMessages(data.hasMore);

      if (hasUnreadIncomingUserMessages(data.messages, user.id)) {
        const { error: readError } = await markIncomingMessagesRead(conversationId, user.id);
        if (readError) {
          setError('Messages loaded, but read status could not be updated.');
        } else {
          setConversations(current => current.map(conversation =>
            conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation
          ));
        }
      }
      scheduleScrollToBottom('auto', { force: true, retry: true });
    } catch (messagesError: any) {
      if (!messagesCacheRef.current[conversationId]) {
        setMessages([]);
      }
      setError(friendlyMessageError(messagesError.message, 'This conversation could not be loaded.'));
    } finally {
      setMessagesLoading(false);
      setSyncing(false);
    }
  }, [scheduleScrollToBottom, user]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !user || olderMessagesLoading || messages.length === 0 || !hasOlderMessages) return;
    const oldestMessage = messages[0];
    const list = messageListRef.current;
    const previousScrollHeight = list?.scrollHeight || 0;
    const previousScrollTop = list?.scrollTop || 0;

    setOlderMessagesLoading(true);
    shouldStickToBottomRef.current = false;
    setError(null);
    try {
      const { data, error: messagesError } = await getConversationMessages(activeConversationId, {
        limit: MESSAGE_PAGE_SIZE,
        before: {
          created_at: oldestMessage.created_at,
          id: oldestMessage.id,
        },
      });
      if (messagesError) throw messagesError;

      // Preserve the reader's viewport when older rows are prepended.
      setMessages(current => sortMessages([
        ...data.messages,
        ...current.filter(message => !data.messages.some(older => older.id === message.id)),
      ]));
      setHasOlderMessages(data.hasMore);

      if (hasUnreadIncomingUserMessages(data.messages, user.id)) {
        const { error: readError } = await markIncomingMessagesRead(activeConversationId, user.id);
        if (readError) {
          setError('Messages loaded, but read status could not be updated.');
        }
      }

      window.requestAnimationFrame(() => {
        const currentList = messageListRef.current;
        if (!currentList) return;
        currentList.scrollTop = currentList.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (messagesError: any) {
      setError(friendlyMessageError(messagesError.message, 'Older messages could not be loaded.'));
    } finally {
      setOlderMessagesLoading(false);
    }
  }, [activeConversationId, hasOlderMessages, messages, olderMessagesLoading, user]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    setJobDetailsOpen(false);
    setJobDetails(null);
    setJobDetailsError(null);
    if (activeConversationId) loadMessages(activeConversationId);
    else setMessages([]);
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (jobDetailsOpen && activeConversation?.job_id) {
      loadJobDetails(activeConversation.job_id);
    }
  }, [activeConversation?.job_id, jobDetailsOpen, loadJobDetails]);

  useLayoutEffect(() => {
    if (!activeConversationId || messagesLoading || messages.length === 0) return;
    if (shouldStickToBottomRef.current) {
      scheduleScrollToBottom('auto', { force: true, retry: true });
    }
  }, [activeConversationId, messages.length, messagesLoading, scheduleScrollToBottom]);

  useEffect(() => {
    if (!activeConversationId || !user) return;

    const mergeMessage = (incoming: MessageRecord, shouldScrollToBottom: boolean) => {
      if (incoming.metadata && (incoming.metadata as any).blocked === true) {
        return;
      }
      if (shouldScrollToBottom) shouldStickToBottomRef.current = true;
      setMessages(current => {
        const matchIndex = current.findIndex(m =>
          m.id.startsWith('temp-') &&
          m.sender_id === incoming.sender_id &&
          m.text === incoming.text
        );

        if (matchIndex !== -1) {
          const next = [...current];
          next[matchIndex] = {
            ...incoming,
            attachments: current[matchIndex].attachments?.length ? current[matchIndex].attachments : incoming.attachments
          };
          return sortMessages(next);
        }

        if (current.some(m => m.id === incoming.id)) {
          return current;
        }

        return sortMessages([...current, incoming]);
      });

      if (shouldScrollToBottom) {
        scheduleScrollToBottom('smooth', { force: true, retry: true });
      } else {
        shouldStickToBottomRef.current = false;
        setNewMessageAvailable(true);
      }

      setConversations(current => current.map(conversation =>
        conversation.id === incoming.conversation_id
          ? {
              ...conversation,
              last_message_text: incoming.text,
              last_message_at: incoming.created_at,
              last_message_from: incoming.sender_id,
              unread_count: incoming.sender_id === user.id
                ? conversation.unread_count
                : Math.max(Number(conversation.unread_count || 0), 1),
            }
          : conversation
      ));
    };

    const channel = supabase
      .channel(`job-messages:${activeConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        async payload => {
          const incoming = payload.new as MessageRecord;
          const shouldScrollToBottom = incoming.sender_id === user.id || isMessageListNearBottom();
          const { data: incomingAttachments, error: incomingAttachmentsError } = await getMessageAttachmentsForMessages([incoming.id]);
          mergeMessage({
            ...incoming,
            attachments: incomingAttachmentsError ? [] : incomingAttachments,
          }, shouldScrollToBottom);

          // Play message sound if enabled and not sent by current user
          if (incoming.sender_id !== user.id) {
            const enabled = getSoundEnabledPreference(KEYS.MESSAGES_ENABLED, true);
            if (enabled) {
              const path = getSoundPreference(KEYS.MESSAGE_SOUND, '/audio/message-confirm-tap.mp3');
              void playSoundSafe(path);
            }
          }

          if (incoming.message_type !== 'system' && incoming.sender_id !== user.id) {
            void markIncomingMessagesRead(activeConversationId, user.id)
              .then(({ error: readError }) => {
                if (readError) throw readError;
                setConversations(current => current.map(conversation =>
                  conversation.id === activeConversationId ? { ...conversation, unread_count: 0 } : conversation
                ));
              })
              .catch((readError: any) => setError(readError.message || 'Messages were received, but read status could not be updated.'));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        payload => {
          const incoming = payload.new as MessageRecord;
          setMessages(current => sortMessages(current.map(message =>
            message.id === incoming.id ? { ...incoming, attachments: message.attachments || [] } : message
          )));
        }
      )
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR') {
          setError('Live message updates are temporarily unavailable. You can still refresh messages manually.');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeConversationId, isMessageListNearBottom, scheduleScrollToBottom, user]);

  useEffect(() => {
    if (!emojiPickerOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (emojiPickerRef.current?.contains(target)) return;
      setEmojiPickerOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [emojiPickerOpen]);

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  useEffect(() => {
    return () => {
      clearScheduledScrolls();
      selectedAttachmentsRef.current.forEach(attachment => URL.revokeObjectURL(attachment.previewUrl));
    };
  }, [clearScheduledScrolls]);

  const selectConversation = (conversationId: string) => {
    shouldStickToBottomRef.current = true;
    setActiveConversationId(conversationId);
    setMobileThreadOpen(true);
    setSearchParams({ conversation: conversationId }, { replace: true });
  };

  const handleMessagesScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    const nearBottom = isMessageListNearBottom();
    shouldStickToBottomRef.current = nearBottom;
    if (nearBottom) setNewMessageAvailable(false);
    if (list.scrollTop < SCROLL_EDGE_THRESHOLD) {
      void loadOlderMessages();
    }
  };

  const handleMessageImageLoad = () => {
    if (!shouldStickToBottomRef.current && !isMessageListNearBottom()) return;
    scheduleScrollToBottom('auto', { retry: true });
  };

  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    if (selectedAttachments.length + files.length > MAX_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images per message.`);
      return;
    }

    const nextAttachments: SelectedAttachment[] = [];
    for (const file of files) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as typeof ALLOWED_ATTACHMENT_TYPES[number])) {
        setAttachmentError('Only jpg, jpeg, png, and webp images can be attached.');
        nextAttachments.forEach(attachment => URL.revokeObjectURL(attachment.previewUrl));
        return;
      }

      if (file.size > MAX_ATTACHMENT_SIZE) {
        setAttachmentError('Each image must be 5MB or smaller.');
        nextAttachments.forEach(attachment => URL.revokeObjectURL(attachment.previewUrl));
        return;
      }

      const dimensions = await getImageDimensions(file);
      nextAttachments.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        width: dimensions.width,
        height: dimensions.height,
      });
    }

    setSelectedAttachments(current => [...current, ...nextAttachments]);
  };
  const removeSelectedAttachment = (attachmentId: string) => {
    setSelectedAttachments(current => {
      const removed = current.find(attachment => attachment.id === attachmentId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter(attachment => attachment.id !== attachmentId);
    });
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !activeConversationId || (!reply.trim() && selectedAttachments.length === 0) || sending) return;

    setSending(true);
    setError(null);
    setAttachmentError(null);
    const text = reply.trim();
    const uploadedPaths: string[] = [];

    // Client-side moderation check
    const paymentStatus = activeConversation?.payment_status || 'pending';
    const modResult = moderateClientMessage(text, paymentStatus);

    if (modResult.isBlocked) {
      let specificReason = "Contact details or off-platform payment attempts were detected.";
      if (modResult.reasons.includes('off_platform_payment')) {
        specificReason = "Off-platform payment attempts are not allowed. Please keep all payment activities within TradieHubAU.";
      } else if (modResult.reasons.includes('email_bypass') || modResult.reasons.includes('phone_bypass') || modResult.reasons.includes('social_bypass')) {
        specificReason = "Sharing contact details (email, phone, or socials) before payment is protected is not allowed.";
      }
      setError(`Blocked: ${specificReason} Please keep all communications and payments secure on TradieHubAU.`);
      setReply('');
      setSelectedAttachments([]);
      setSending(false);
      // Silently insert into the DB to preserve evidence for the admin
      void sendJobMessage(activeConversationId, text).catch(() => {});
      return;
    }

    const textToSend = modResult.censoredText;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticMessage: MessageRecord = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      text: textToSend,
      read: false,
      read_at: null,
      created_at: new Date().toISOString(),
      message_type: 'user',
      system_event_type: null,
      metadata: {},
      attachments: selectedAttachments.map(att => ({
        id: att.id,
        message_id: tempId,
        conversation_id: activeConversationId,
        job_id: activeConversation?.job_id || '',
        uploader_id: user.id,
        bucket_id: 'message_attachments',
        storage_path: '',
        file_name: att.file.name,
        mime_type: att.file.type as any,
        file_size: att.file.size,
        width: att.width,
        height: att.height,
        created_at: new Date().toISOString(),
        signed_url: att.previewUrl,
      })),
    };

    // Optimistically add message and clear state
    setMessages(current => sortMessages([...current, optimisticMessage]));
    scheduleScrollToBottom('smooth', { force: true, retry: true });

    // Update conversation sidebar preview
    setConversations(current => current.map(conversation =>
      conversation.id === activeConversationId
        ? {
            ...conversation,
            last_message_text: textToSend || (selectedAttachments.length > 0 ? 'Sent an image' : ''),
            last_message_at: optimisticMessage.created_at,
            last_message_from: user.id,
          }
        : conversation
    ));

    setReply('');
    setSelectedAttachments([]);

    try {
      if (selectedAttachments.length === 0) {
        const { data: newMessageId, error: sendError } = await sendJobMessage(activeConversationId, textToSend);
        if (sendError) throw sendError;

        if (newMessageId) {
          setMessages(current => current.map(m => m.id === tempId ? { ...m, id: newMessageId } : m));
        }
      } else {
        if (!user || !activeConversation) throw new Error('A valid job conversation is required to send attachments.');
        const messageId = crypto.randomUUID();
        const attachmentMetadata: MessageAttachmentInput[] = [];

        for (const attachment of selectedAttachments) {
          const fileName = `${Date.now()}_${attachment.id}_${sanitizeFileName(attachment.file.name)}`;
          const storagePath = `jobs/${activeConversation.job_id}/conversations/${activeConversation.id}/messages/${messageId}/${user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('message_attachments')
            .upload(storagePath, attachment.file, {
              contentType: attachment.file.type,
              upsert: false,
            });

          if (uploadError) throw new Error(`Failed to upload ${attachment.file.name}: ${uploadError.message}`);
          uploadedPaths.push(storagePath);
          attachmentMetadata.push({
            storage_path: storagePath,
            file_name: attachment.file.name,
            mime_type: attachment.file.type as MessageAttachmentInput['mime_type'],
            file_size: attachment.file.size,
            width: attachment.width,
            height: attachment.height,
          });
        }

        const { data: newMsg, error: sendError } = await sendJobMessageWithAttachments(
          messageId,
          activeConversationId,
          textToSend,
          attachmentMetadata
        );
        if (sendError) throw sendError;

        if (newMsg) {
          setMessages(current => current.map(m => m.id === tempId ? { ...m, ...newMsg } : m));
        }
      }

      optimisticMessage.attachments?.forEach(att => {
        if (att.signed_url) URL.revokeObjectURL(att.signed_url);
      });

      // Background sync sidebar
      void loadConversations(activeConversationId);
    } catch (sendError: any) {
      // Revert optimistic additions on error
      setMessages(current => current.filter(m => m.id !== tempId));
      setReply(text);
      setSelectedAttachments(selectedAttachments);

      const cleanupPaths = uploadedPaths.filter(path => path.trim().length > 0);
      if (cleanupPaths.length > 0) {
        void supabase.storage.from('message_attachments').remove(cleanupPaths);
      }
      setError(friendlyMessageError(sendError.message, 'Your message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    event.preventDefault();
    if ((!reply.trim() && selectedAttachments.length === 0) || sending) return;

    event.currentTarget.form?.requestSubmit();
  };

  const insertEmoji = (emoji: string) => {
    const composer = composerRef.current;
    const start = composer?.selectionStart ?? reply.length;
    const end = composer?.selectionEnd ?? reply.length;
    const nextReply = `${reply.slice(0, start)}${emoji}${reply.slice(end)}`.slice(0, 4000);
    const nextCursor = Math.min(start + emoji.length, nextReply.length);

    setReply(nextReply);
    setEmojiPickerOpen(false);

    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  if (authLoading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-10 text-center space-y-4">
        <Lock className="mx-auto h-10 w-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Sign in to view messages</h1>
        <p className="text-sm font-medium leading-6 text-muted-foreground">
          Job messaging is available only between participants on active jobs and contracts.
        </p>
        <Link to="/login" className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
          Sign In
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="shrink-0">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><MessageSquare className="h-6 w-6 text-primary" /> Job Messages</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">Conversations are available only for accepted job relationships.</p>
      </div>

      {(error || attachmentError) && (
        <div className="shrink-0 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || attachmentError}</span>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center items-center rounded-2xl border bg-card p-12 text-center space-y-4">
          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h2 className="text-xl font-extrabold">No job conversations yet</h2>
          <p className="mx-auto max-w-md text-sm font-medium leading-6 text-muted-foreground">
            Messaging unlocks through active jobs and contracts. A job conversation becomes available after a quote is accepted.
          </p>
          <Link to="/jobs" className="inline-flex rounded-xl bg-secondary px-5 py-2.5 text-sm font-bold text-secondary-foreground">View My Jobs</Link>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
          <aside className={`${mobileThreadOpen ? 'hidden lg:flex' : 'flex'} flex-col h-full min-h-0 rounded-2xl border bg-card p-4`}>
            <div className="mb-3 flex items-center justify-between px-2 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold">Conversations</h2>
                {syncing && <span className="text-[10px] font-semibold text-primary animate-pulse">Syncing...</span>}
              </div>
              <button
                type="button"
                onClick={() => loadConversations(activeConversationId).catch((refreshError: any) => setError(refreshError.message))}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Refresh conversations"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {[...conversations]
                .sort((a, b) => {
                  const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                  const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                  return bTime - aTime;
                })
                .map(conversation => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    conversation.id === activeConversationId
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-foreground">{conversation.counterpart?.display_name || 'Job participant'}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-primary">{conversation.job_title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-medium text-muted-foreground">{formatTimestamp(conversation.last_message_at)}</span>
                      {conversation.unread_count > 0 && (
                        <span className="ml-auto mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground">
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`mt-2 truncate text-xs ${conversation.unread_count ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'}`}>
                    {conversation.last_message_text || 'No messages yet'}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Job {conversation.job_id.slice(0, 8)} · {statusLabel(conversation.job_status)}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className={`${mobileThreadOpen ? 'flex' : 'hidden lg:flex'} h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-2`}>
            {activeConversation ? (
              <>
                <header className="border-b bg-muted/20 p-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileThreadOpen(false)}
                    className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-extrabold text-foreground shadow-sm transition-colors hover:bg-muted lg:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to conversations
                  </button>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate font-extrabold">{activeConversation.counterpart?.display_name || 'Job participant'}</h2>
                        <p className="truncate text-xs font-semibold text-primary"><Briefcase className="mr-1 inline h-3 w-3" />{activeConversation.job_title}</p>
                        <p className="text-xs font-medium text-muted-foreground">{statusLabel(activeConversation.job_status)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setJobDetailsOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
                      >
                        <Briefcase className="h-4 w-4" />
                        Job Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          loadMessages(activeConversation.id);
                          loadConversations(activeConversation.id).catch((refreshError: any) => setError(refreshError.message));
                          if (jobDetailsOpen) loadJobDetails(activeConversation.job_id);
                        }}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Refresh message history"
                        disabled={messagesLoading}
                      >
                        {messagesLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  {activeConversation.payment_status === 'pending' && (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-5 text-amber-900">
                      Quote accepted, but payment is not funded. Direct phone/email details remain locked and work should not start yet.
                    </div>
                  )}
                </header>

                <div
                  ref={messageListRef}
                  onScroll={handleMessagesScroll}
                  className="relative min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/5 p-5"
                >
                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <MessageSquare className="h-9 w-9 text-muted-foreground/40" />
                      <p className="mt-3 font-extrabold">Start the job conversation</p>
                      <p className="mt-1 max-w-sm text-sm font-medium text-muted-foreground">Keep messages focused on the accepted job, scope, timing, and work coordination.</p>
                    </div>
                  ) : (
                    <>
                      {olderMessagesLoading && (
                        <div className="flex justify-center">
                          <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading older messages
                          </span>
                        </div>
                      )}
                      {!hasOlderMessages && messages.length >= MESSAGE_PAGE_SIZE && (
                        <p className="text-center text-xs font-semibold text-muted-foreground">Start of this conversation</p>
                      )}
                      {messages.map(message => {
                    if (message.message_type === 'system') {
                      return (
                        <div key={message.id} className="flex justify-center">
                          <div className="max-w-[85%] rounded-full border bg-background px-4 py-2 text-center shadow-sm">
                            <p className="text-xs font-bold text-foreground">{message.text}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                              {new Date(message.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    const outgoing = message.sender_id === user.id;
                    return (
                      <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          outgoing
                            ? 'rounded-br-none bg-primary text-primary-foreground'
                            : 'rounded-bl-none border bg-card text-foreground'
                        }`}>
                          {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
                          {message.attachments && message.attachments.length > 0 && (() => {
                            const attachments = message.attachments;
                            const isSingle = attachments.length === 1;
                            return (
                              <div className={`mt-2 grid gap-2 ${
                                isSingle
                                  ? 'grid-cols-1 max-w-[280px] sm:max-w-[360px] md:max-w-[420px]'
                                  : 'grid-cols-2 max-w-[320px] sm:max-w-[440px] md:max-w-[500px]'
                              }`}>
                                {attachments.map((attachment, index) => {
                                  const isImage = attachment.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.file_name);
                                  return isImage ? (
                                    <button
                                      key={attachment.id}
                                      type="button"
                                      onClick={() => setLightbox({ attachments, index })}
                                      className={`group overflow-hidden rounded-xl border bg-background/80 text-left ${
                                        isSingle
                                          ? 'w-full aspect-[4/3] sm:aspect-video'
                                          : 'w-full aspect-square'
                                      }`}
                                      aria-label={`Open ${attachment.file_name}`}
                                    >
                                      {attachment.signed_url ? (
                                        <img
                                          src={attachment.signed_url}
                                          alt={attachment.file_name}
                                          onLoad={handleMessageImageLoad}
                                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                                        />
                                      ) : (
                                        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                          <ImageIcon className="h-6 w-6" />
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <a
                                      key={attachment.id}
                                      href={attachment.signed_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 p-3 bg-background border rounded-xl hover:bg-background/90 transition-colors w-full text-left"
                                      aria-label={`Open document ${attachment.file_name}`}
                                    >
                                      <FileText className="h-5 w-5 text-primary shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold truncate text-foreground">{attachment.file_name}</p>
                                        <p className="text-[10px] text-muted-foreground font-semibold">
                                          {attachment.file_size ? `${(attachment.file_size / 1024).toFixed(1)} KB` : 'Document'}
                                        </p>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          <p className={`mt-1 text-[10px] font-semibold ${outgoing ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                            {new Date(message.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                            {outgoing && message.read ? ' · Read' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                    </>
                  )}
                  {newMessageAvailable && (
                    <button
                      type="button"
                      onClick={() => scheduleScrollToBottom('smooth', { force: true, retry: true })}
                      className="sticky bottom-2 left-1/2 z-10 mx-auto flex -translate-x-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg"
                    >
                      New message
                    </button>
                  )}
                </div>

                <form onSubmit={handleSend} className="border-t bg-muted/20 p-4 shrink-0">
                  {selectedAttachments.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedAttachments.map(attachment => (
                        <div key={attachment.id} className="relative h-20 w-20 overflow-hidden rounded-xl border bg-background">
                          <img src={attachment.previewUrl} alt={attachment.file.name} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeSelectedAttachment(attachment.id)}
                            className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                            aria-label={`Remove ${attachment.file.name}`}
                            disabled={sending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-3">
                    <div ref={emojiPickerRef} className="relative shrink-0">
                      {emojiPickerOpen && (
                        <div className="absolute bottom-14 left-0 z-20 grid w-56 grid-cols-8 gap-1 rounded-xl border bg-popover p-2 shadow-lg">
                          {COMMON_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => insertEmoji(emoji)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-muted focus:bg-muted focus:outline-none"
                              aria-label={`Insert ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setEmojiPickerOpen(open => !open)}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Add emoji"
                        aria-expanded={emojiPickerOpen}
                      >
                        <Smile className="h-5 w-5" />
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={handleAttachmentSelect}
                      aria-label="Upload message attachments"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending || selectedAttachments.length >= MAX_ATTACHMENTS}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Attach images"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <textarea
                      ref={composerRef}
                      value={reply}
                      onChange={event => setReply(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Write a job message…"
                      rows={2}
                      maxLength={4000}
                      className="min-h-[48px] flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary/50"
                      aria-label="Message text"
                    />
                    <button
                      type="submit"
                      disabled={(!reply.trim() && selectedAttachments.length === 0) || sending}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">Press Enter to send. Use Shift+Enter for a new line. Messages cannot be edited after sending.</p>
                </form>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="h-9 w-9 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-extrabold text-foreground">Select a job conversation</p>
                <p className="mt-1 max-w-sm text-sm font-medium leading-6 text-muted-foreground">
                  Messages are only available between participants on accepted jobs and active contracts.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {jobDetailsOpen && activeConversation && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setJobDetailsOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl border bg-card shadow-2xl sm:max-w-2xl sm:rounded-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Job Details</p>
                <h3 className="truncate text-lg font-extrabold text-foreground">{activeConversation.job_title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setJobDetailsOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close job details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-4">
              {jobDetailsLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading job details...
                </div>
              ) : jobDetailsError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-600">
                  Job details could not be loaded.
                </div>
              ) : jobDetails ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{statusLabel(jobDetails.job.status)}</span>
                    {jobDetails.payment && (
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                        {paymentStatusLabel(jobDetails.payment.status)}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xl font-extrabold leading-tight text-foreground">{jobDetails.job.title}</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-foreground/80">{jobDetails.job.description || 'Not provided'}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-background p-3">
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><DollarSign className="h-4 w-4" /> Budget</p>
                      <p className="mt-1 text-sm font-extrabold text-foreground">{formatBudget(jobDetails.job.budget_min, jobDetails.job.budget_max)}</p>
                    </div>
                    {jobDetails.payment && (
                      <div className="rounded-xl border bg-background p-3">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><DollarSign className="h-4 w-4" /> Accepted amount</p>
                        <p className="mt-1 text-sm font-extrabold text-foreground">{formatCentsToAUD(jobDetails.payment.amount)}</p>
                      </div>
                    )}
                    <div className="rounded-xl border bg-background p-3">
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><MapPin className="h-4 w-4" /> Location</p>
                      <p className="mt-1 text-sm font-extrabold text-foreground">{formatJobLocation(jobDetails.job.suburb, jobDetails.job.state) || jobDetails.job.location}</p>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Calendar className="h-4 w-4" /> Created</p>
                      <p className="mt-1 text-sm font-extrabold text-foreground">{new Date(jobDetails.job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    {(jobDetails.job.timeline || jobDetails.job.type || jobDetails.job.urgency) && (
                      <div className="rounded-xl border bg-background p-3 sm:col-span-2">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><FileText className="h-4 w-4" /> Scope notes</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {[jobDetails.job.type, jobDetails.job.timeline, jobDetails.job.urgency].filter(Boolean).join(' - ')}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-background p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Customer</p>
                      <p className="mt-1 text-sm font-extrabold text-foreground">{jobDetails.customer?.display_name || 'Not provided'}</p>
                      {(jobDetails.customer?.suburb || jobDetails.customer?.state) && (
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                          {[jobDetails.customer.suburb, jobDetails.customer.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tradie</p>
                      <p className="mt-1 text-sm font-extrabold text-foreground">{jobDetails.tradie?.display_name || activeConversation.counterpart?.display_name || 'Not provided'}</p>
                      {(jobDetails.tradie?.suburb || jobDetails.tradie?.state) && (
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                          {[jobDetails.tradie.suburb, jobDetails.tradie.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {['completed_pending_review', 'disputed', 'completed'].includes(jobDetails.job.status) && (
                    <div className="rounded-xl border bg-muted/40 p-3 text-sm font-semibold text-foreground">
                      {jobDetails.job.status === 'completed_pending_review' && 'Completion proof has been submitted and is under customer review.'}
                      {jobDetails.job.status === 'disputed' && 'This job is currently disputed and awaiting admin review.'}
                      {jobDetails.job.status === 'completed' && 'This job is completed and payment has been released or resolved.'}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Job ref {jobDetails.job.id.slice(0, 8)}</p>
                    <Link
                      to={`/jobs/${jobDetails.job.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                    >
                      Open Full Job
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative flex max-h-full max-w-5xl items-center justify-center" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
              aria-label="Close image preview"
            >
              <X className="h-5 w-5" />
            </button>
            {lightbox.attachments.length > 1 && (
              <button
                type="button"
                onClick={() => setLightbox(current => current ? {
                  ...current,
                  index: (current.index - 1 + current.attachments.length) % current.attachments.length,
                } : current)}
                className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {lightbox.attachments[lightbox.index]?.signed_url ? (
              <img
                src={lightbox.attachments[lightbox.index].signed_url}
                alt={lightbox.attachments[lightbox.index].file_name}
                className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-background text-muted-foreground">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
            {lightbox.attachments.length > 1 && (
              <button
                type="button"
                onClick={() => setLightbox(current => current ? {
                  ...current,
                  index: (current.index + 1) % current.attachments.length,
                } : current)}
                className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
