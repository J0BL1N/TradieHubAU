import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import {
  getUserProfile,
  getPublicUserProfile,
  updateUserProfile,
  submitVerification
} from '../lib/users';
import type { UserProfile } from '../lib/users';
import { formatJobLocation } from '../lib/auLocations';
import { toggleSavedItem, isItemSaved } from '../lib/saved';
import {
  fetchEligibleCompletionProofPortfolioItems,
  updateCompletionProofPortfolioItem,
  uploadAvatar,
  validateTrustImage,
} from '../lib/profileTrust';
import type { CompletionProofPortfolioItem } from '../lib/profileTrust';
import { fetchPublicTradieReviews } from '../lib/reviews';
import {
  ShieldCheck, Mail, Phone, MapPin, Lock, Save,
  Upload, Loader2, Award, Star, Briefcase, Clock,
  Bookmark, BookmarkCheck, AlertCircle, CheckCircle, Send,
  ImagePlus, Eye, Globe, Calendar, Camera
} from 'lucide-react';

interface DisplayJob {
  id: string;
  title: string;
  location: string;
  suburb: string | null;
  state: string | null;
  region: string | null;
  status: string;
  categories: string[];
}

interface UserReview {
  id: string;
  rating: number;
  text: string;
  submitted_at: string;
  reviewer: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

type VerificationStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked' | 'recheck' | 'expired' | 'requested_more_info';
type ProfileTab = 'account' | 'verification' | 'tradie-profile' | 'completed-work';
type CompletedWorkFilter = 'all' | 'published' | 'hidden';

interface VerificationSummary {
  document_type: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'requested_more_info';
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  expires_at?: string | null;
  recheck_requested_at?: string | null;
  recheck_reason?: string | null;
  recheck_requested_by?: string | null;
}

const deriveDocumentStatus = (summary: any): VerificationStatus => {
  if (!summary) return 'none';
  if (summary.status === 'revoked') return 'revoked';
  if (summary.status === 'requested_more_info') return 'requested_more_info';
  if (summary.status === 'rejected') return 'rejected';
  if (summary.recheck_requested_at) return 'recheck';
  if (summary.expires_at && new Date(summary.expires_at) < new Date()) return 'expired';
  if (summary.status === 'pending') return 'pending';
  if (summary.status === 'approved') return 'approved';
  return 'none';
};

const getVerificationEventTime = (summary: VerificationSummary) => {
  const timestamps = [
    summary.recheck_requested_at,
    summary.reviewed_at,
    summary.expires_at && new Date(summary.expires_at) < new Date() ? summary.expires_at : null,
    summary.submitted_at,
  ].filter(Boolean) as string[];

  return Math.max(...timestamps.map(value => new Date(value).getTime()).filter(value => !Number.isNaN(value)));
};

const getCurrentVerificationSummary = (summaries: VerificationSummary[]) => {
  if (summaries.length === 0) return null;
  return [...summaries].sort((a, b) => getVerificationEventTime(b) - getVerificationEventTime(a))[0];
};

const IDENTITY_DOCUMENT_CARD = {
  type: 'drivers_license',
  title: 'Identity document',
  helper: 'Passport, driver licence, proof of age card, or other clear photo ID.',
};

const TRADIE_DOCUMENT_CARDS = [
  {
    type: 'contractor_license',
    title: 'Contractor Licence',
    helper: 'Upload the licence or registration document for your trade.',
    required: true,
  },
  {
    type: 'insurance',
    title: 'Insurance',
    helper: 'Upload your current public liability or business insurance certificate.',
    required: true,
  },
  {
    type: 'trade_certificate',
    title: 'Trade Certificate / Other Trade Credential',
    helper: 'Optional supporting certificate, qualification, or other credential.',
    required: false,
  },
];

export default function Profile() {
  const { id } = useParams<{ id?: string }>();
  const { user, loading: authLoading, refreshProfile, updateProfileState } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isSelf = !id || id === user?.id;
  const targetId = isSelf ? user?.id : id;

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('account');
  const [profileLoading, setProfileLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit fields state
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [suburb, setSuburb] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [postcode, setPostcode] = useState('');
  const [showLocation, setShowLocation] = useState(true);
  const [addressRule, setAddressRule] = useState<'never' | 'afterAccepted' | 'afterJobStarts'>('afterAccepted');
  
  // Tradie specific edit state
  const [trades, setTrades] = useState<string[]>([]);
  const [abn, setAbn] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [serviceAreas, setServiceAreas] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Completed work portfolio state
  const [completionProofItems, setCompletionProofItems] = useState<CompletionProofPortfolioItem[]>([]);
  const [completionProofDrafts, setCompletionProofDrafts] = useState<Record<string, {
    isPublic: boolean;
    title: string;
    caption: string;
    trade: string;
  }>>({});
  const [completionProofLoading, setCompletionProofLoading] = useState(false);
  const [completionProofSavingId, setCompletionProofSavingId] = useState<string | null>(null);
  const [completionProofError, setCompletionProofError] = useState<string | null>(null);
  const [completedWorkFilter, setCompletedWorkFilter] = useState<CompletedWorkFilter>('all');
  const [expandedCompletionProofId, setExpandedCompletionProofId] = useState<string | null>(null);

  // Public view details state
  const [activeJobs, setActiveJobs] = useState<DisplayJob[]>([]);
  const [pastJobs, setPastJobs] = useState<DisplayJob[]>([]);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveActionLoading, setSaveActionLoading] = useState(false);

  // Verification document submit state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Identity check state
  const [idDocType, setIdDocType] = useState('drivers_license');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idUploadSuccess, setIdUploadSuccess] = useState(false);
  const [idUploadError, setIdUploadError] = useState<string | null>(null);
  const [idVerificationStatus, setIdVerificationStatus] = useState<VerificationStatus>('none');
  const [idVerificationNotes, setIdVerificationNotes] = useState<string | null>(null);
  const [idVerificationRecheckReason, setIdVerificationRecheckReason] = useState<string | null>(null);

  // Liveness selfie check state
  const [livenessFile, setLivenessFile] = useState<File | null>(null);
  const [livenessUploadSuccess, setLivenessUploadSuccess] = useState(false);
  const [livenessUploadError, setLivenessUploadError] = useState<string | null>(null);
  const [livenessUploading, setLivenessUploading] = useState(false);
  const [livenessVerificationStatus, setLivenessVerificationStatus] = useState<VerificationStatus>('none');
  const [livenessVerificationNotes, setLivenessVerificationNotes] = useState<string | null>(null);
  const [livenessVerificationRecheckReason, setLivenessVerificationRecheckReason] = useState<string | null>(null);

  // Tradie check state
  const [tradieDocType, setTradieDocType] = useState('contractor_license');
  const [tradieFile, setTradieFile] = useState<File | null>(null);
  const [tradieFiles, setTradieFiles] = useState<Record<string, File | null>>({});
  const [verificationSummaries, setVerificationSummaries] = useState<Record<string, VerificationSummary>>({});
  const [tradieVerificationStatus, setTradieVerificationStatus] = useState<VerificationStatus>('none');
  const [tradieVerificationNotes, setTradieVerificationNotes] = useState<string | null>(null);

  const categoryOptions = [
    { id: 'electrical', label: 'Electrical' },
    { id: 'plumbing', label: 'Plumbing' },
    { id: 'carpentry', label: 'Carpentry' },
    { id: 'painting', label: 'Painting' },
    { id: 'tiling', label: 'Tiling' },
    { id: 'building', label: 'Building' },
    { id: 'gardening', label: 'Gardening' },
    { id: 'cleaning', label: 'Cleaning' },
    { id: 'handyman', label: 'Handyman' },
    { id: 'other', label: 'Other' },
  ];

  // Load target profile
  const loadProfile = useCallback(async () => {
    if (!targetId) return;
    setProfileLoading(true);
    setError(null);
    const { data, error: profileErr } = isSelf
      ? await getUserProfile(targetId)
      : await getPublicUserProfile(targetId);
    if (profileErr) {
      setError(profileErr.message || 'Failed to load profile.');
    } else if (data) {
      setTargetProfile(data);
      // Hydrate forms
      setDisplayName(data.display_name || '');
      setPhone(data.phone || '');
      setSuburb(data.suburb || '');
      setStateVal(data.state || '');
      setPostcode(data.postcode || '');
      setShowLocation(data.show_location ?? true);
      setAddressRule(data.address_rule || 'afterAccepted');
      setTrades(data.trades || []);
      setAbn(data.abn || '');
      setLicenseNumber(data.license_number || '');
      setBusinessName(data.business_name || '');
      setBio(data.bio || '');
      setYearsExperience(data.years_experience !== null && data.years_experience !== undefined ? String(data.years_experience) : '');
      setServiceAreas((data.service_areas || []).join(', '));
      setWebsiteUrl(data.website_url || '');
    }
    setProfileLoading(false);
  }, [targetId, isSelf]);

  const loadCompletionProofPortfolioItems = useCallback(async () => {
    if (!isSelf || !targetProfile || targetProfile.role === 'customer') return;
    setCompletionProofLoading(true);
    setCompletionProofError(null);
    const { data, error: completionProofErr } = await fetchEligibleCompletionProofPortfolioItems();
    if (completionProofErr) {
      setCompletionProofError(completionProofErr.message || 'Failed to load completed work proof images.');
    } else {
      setCompletionProofItems(data);
      setCompletionProofDrafts(Object.fromEntries(data.map(item => [
        item.id,
        {
          isPublic: item.is_public_portfolio,
          title: item.portfolio_title || '',
          caption: item.portfolio_caption || '',
          trade: item.portfolio_trade_category || '',
        },
      ])));
    }
    setCompletionProofLoading(false);
  }, [isSelf, targetProfile]);

  // Load bookmark state for this profile
  const checkSavedState = useCallback(async () => {
    if (!user || !targetId || isSelf) return;
    const saved = await isItemSaved('tradie', targetId);
    setIsSaved(saved);
  }, [user, targetId, isSelf]);

  // Load jobs and reviews for public views
  const loadJobsAndReviews = useCallback(async () => {
    if (!targetId || !targetProfile) return;
    setJobsLoading(true);
    setReviewsLoading(true);

    try {
      const isTradie = targetProfile.role === 'tradie' || targetProfile.role === 'dual';
      const isCustomer = targetProfile.role === 'customer' || targetProfile.role === 'dual';

      // 1. Fetch real public reviews from completed/released TradieHubAU jobs.
      const { data: reviewsData, error: reviewsErr } = await fetchPublicTradieReviews(targetId);

      if (!reviewsErr && reviewsData) {
        setReviews(reviewsData.map(review => ({
          id: review.id,
          rating: review.rating,
          text: review.text || '',
          submitted_at: review.submitted_at,
          reviewer: {
            display_name: review.reviewer_display_name || 'Verified customer',
            avatar_url: review.reviewer_avatar_url,
          },
        })));
      } else if (reviewsErr) {
        console.error('Error fetching public tradie reviews:', reviewsErr);
      }

      // 2. Fetch Jobs
      if (isCustomer) {
        // Customer active and past posted jobs
        const { data: customerJobs, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, title, location, suburb, state, region, status, categories')
          .eq('customer_id', targetId);

        if (!jobsErr && customerJobs) {
          const active = customerJobs.filter(j => j.status === 'open' || j.status === 'in_progress');
          const past = customerJobs.filter(j => j.status === 'completed' || j.status === 'cancelled');
          setActiveJobs(active as DisplayJob[]);
          setPastJobs(past as DisplayJob[]);
        }
      } else if (isTradie) {
        // Tradie active and past assigned jobs
        // Query applications accepted for this tradie
        const { data: tradieApps, error: appsErr } = await supabase
          .from('applications')
          .select(`
            status,
            job:jobs(id, title, location, suburb, state, region, status, categories)
          `)
          .eq('tradie_id', targetId)
          .eq('status', 'accepted');

        if (!appsErr && tradieApps) {
          const matchedJobs = tradieApps.map(app => app.job).filter(Boolean) as unknown as DisplayJob[];
          const active = matchedJobs.filter(j => j.status === 'in_progress');
          const past = matchedJobs.filter(j => j.status === 'completed');
          setActiveJobs(active);
          setPastJobs(past);
        }
      }
    } catch (err) {
      console.error('Error fetching job details / reviews:', err);
    } finally {
      setJobsLoading(false);
      setReviewsLoading(false);
    }
  }, [targetId, targetProfile]);

  const loadVerificationStatus = useCallback(async () => {
    if (!targetId || !isSelf) return;
    try {
      const { data: allVerificationData, error: allVerificationErr } = await supabase
        .from('verifications')
        .select('document_type, status, admin_notes, submitted_at, reviewed_at, expires_at, recheck_requested_at, recheck_reason')
        .eq('user_id', targetId)
        .in('document_type', [
          'drivers_license',
          'passport',
          'proof_of_age',
          'other_identity',
          'contractor_license',
          'insurance',
          'trade_certificate',
          'other_trade_credential',
          'liveness_selfie',
        ])
        .order('submitted_at', { ascending: false });

      if (!allVerificationErr && allVerificationData) {
        const latestByType = (allVerificationData as any[]).reduce<Record<string, VerificationSummary>>((acc, item) => {
          if (!acc[item.document_type]) acc[item.document_type] = item;
          return acc;
        }, {});
        setVerificationSummaries(latestByType);
      }

      // Query latest identity verification status
      const { data: idData, error: idErr } = await supabase
        .from('verifications')
        .select('document_type, status, admin_notes, submitted_at, reviewed_at, expires_at, recheck_requested_at, recheck_reason')
        .eq('user_id', targetId)
        .in('document_type', ['drivers_license', 'passport', 'proof_of_age', 'other_identity'])
        .order('submitted_at', { ascending: false });

      if (!idErr && idData && idData.length > 0) {
        const currentId = getCurrentVerificationSummary(idData as VerificationSummary[]);
        setIdVerificationStatus(deriveDocumentStatus(currentId));
        setIdVerificationNotes(currentId?.admin_notes || null);
        setIdVerificationRecheckReason(currentId?.recheck_reason || null);
      } else {
        setIdVerificationStatus('none');
        setIdVerificationNotes(null);
        setIdVerificationRecheckReason(null);
      }

      // Query latest liveness selfie verification status
      const { data: livenessData, error: livenessErr } = await supabase
        .from('verifications')
        .select('document_type, status, admin_notes, submitted_at, reviewed_at, expires_at, recheck_requested_at, recheck_reason')
        .eq('user_id', targetId)
        .eq('document_type', 'liveness_selfie')
        .order('submitted_at', { ascending: false });

      if (!livenessErr && livenessData && livenessData.length > 0) {
        const currentLiveness = getCurrentVerificationSummary(livenessData as VerificationSummary[]);
        setLivenessVerificationStatus(deriveDocumentStatus(currentLiveness));
        setLivenessVerificationNotes(currentLiveness?.admin_notes || null);
        setLivenessVerificationRecheckReason(currentLiveness?.recheck_reason || null);
      } else {
        setLivenessVerificationStatus('none');
        setLivenessVerificationNotes(null);
        setLivenessVerificationRecheckReason(null);
      }

      // Query latest tradie credential verification status
      const { data: trData, error: trErr } = await supabase
        .from('verifications')
        .select('document_type, status, admin_notes, submitted_at, reviewed_at, expires_at, recheck_requested_at, recheck_reason')
        .eq('user_id', targetId)
        .in('document_type', ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'])
        .order('submitted_at', { ascending: false });

      if (!trErr && trData && trData.length > 0) {
        const currentTradieCredential = getCurrentVerificationSummary(trData as VerificationSummary[]);
        setTradieVerificationStatus(deriveDocumentStatus(currentTradieCredential));
        setTradieVerificationNotes(currentTradieCredential?.admin_notes || null);
      } else {
        setTradieVerificationStatus('none');
        setTradieVerificationNotes(null);
      }
    } catch (err) {
      console.error('Error loading verification statuses:', err);
    }
  }, [targetId, isSelf]);

  useEffect(() => {
    loadProfile();
    checkSavedState();
    loadVerificationStatus();
  }, [loadProfile, checkSavedState, loadVerificationStatus]);

  useEffect(() => {
    if (targetProfile) {
      loadJobsAndReviews();
      loadCompletionProofPortfolioItems();
    }
  }, [targetProfile, loadJobsAndReviews, loadCompletionProofPortfolioItems]);

  // Handle profile edit submission
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaveLoading(true);
    setSaveSuccess(false);
    setError(null);

    const serviceAreaList = serviceAreas
      .split(',')
      .map(area => area.trim())
      .filter(Boolean)
      .slice(0, 20);
    const parsedYears = yearsExperience.trim() === '' ? null : Number(yearsExperience);

    const { error: updateErr } = await updateUserProfile(user.id, {
      display_name: displayName.trim(),
      phone: phone.trim() || null,
      suburb: suburb.trim() || null,
      state: stateVal || null,
      postcode: postcode.trim() || null,
      show_location: showLocation,
      address_rule: addressRule,
      trades: targetProfile?.role !== 'customer' ? trades : null,
      abn: targetProfile?.role !== 'customer' ? abn.trim() || null : null,
      license_number: targetProfile?.role !== 'customer' ? licenseNumber.trim() || null : null,
      business_name: targetProfile?.role !== 'customer' ? businessName.trim() || null : null,
      bio: targetProfile?.role !== 'customer' ? bio.trim() || null : null,
      years_experience: targetProfile?.role !== 'customer' ? parsedYears : null,
      service_areas: targetProfile?.role !== 'customer' ? serviceAreaList : null,
      website_url: targetProfile?.role !== 'customer' ? websiteUrl.trim() || null : null
    });

    setSaveLoading(false);

    if (updateErr) {
      setError(updateErr.message || 'Failed to update profile.');
    } else {
      setSaveSuccess(true);
      refreshProfile();
      loadProfile();
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Handle bookmark toggle
  const handleToggleBookmark = async () => {
    if (!user || !targetId) return;
    setSaveActionLoading(true);
    const { saved } = await toggleSavedItem('tradie', targetId);
    setIsSaved(saved);
    setSaveActionLoading(false);
  };


  const handleRoleToggle = async () => {
    if (!user || !targetProfile) return;

    if (targetProfile.role === 'customer' && !targetProfile.tradie_verified) {
      alert('You must be an approved, whitelisted tradie to switch to Tradie mode.');
      return;
    }

    setSaveLoading(true);
    const nextRole = targetProfile.role === 'customer' ? 'tradie' : 'customer';
    
    const { error: updateErr } = await updateUserProfile(user.id, {
      role: nextRole
    });

    setSaveLoading(false);
    if (!updateErr) {
      refreshProfile();
      loadProfile();
    }
  };

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file || !user) return;
    const validationError = validateTrustImage(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const { data, error: uploadErr } = await uploadAvatar(user.id, file);
      if (uploadErr) throw uploadErr;

      const { error: updateErr } = await updateUserProfile(user.id, {
        avatar_url: data?.publicUrl || null
      });
      if (updateErr) throw updateErr;

      const nextAvatarUrl = data?.publicUrl ? `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}` : null;
      updateProfileState({ avatar_url: nextAvatarUrl });
      setTargetProfile(current => current ? { ...current, avatar_url: nextAvatarUrl } : current);
      void refreshProfile();
      await loadProfile();
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setAvatarError(err.message || 'Failed to upload profile image.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const updateCompletionProofDraft = (
    proofId: string,
    updates: Partial<{ isPublic: boolean; title: string; caption: string; trade: string }>
  ) => {
    setCompletionProofDrafts(prev => ({
      ...prev,
      [proofId]: {
        isPublic: prev[proofId]?.isPublic ?? false,
        title: prev[proofId]?.title ?? '',
        caption: prev[proofId]?.caption ?? '',
        trade: prev[proofId]?.trade ?? '',
        ...updates,
      },
    }));
  };

  const handleSaveCompletionProofPublication = async (
    proofId: string,
    directOverrides?: Partial<{ isPublic: boolean; title: string; caption: string; trade: string }>
  ) => {
    const item = completionProofItems.find(i => i.id === proofId);
    const existingDraft = completionProofDrafts[proofId] || {
      isPublic: item?.is_public_portfolio ?? false,
      title: item?.portfolio_title || '',
      caption: item?.portfolio_caption || '',
      trade: item?.portfolio_trade_category || '',
    };

    const merged = {
      ...existingDraft,
      ...directOverrides,
    };

    setCompletionProofSavingId(proofId);
    setCompletionProofError(null);

    try {
      const { error: saveErr } = await updateCompletionProofPortfolioItem(proofId, {
        is_public_portfolio: merged.isPublic,
        portfolio_title: merged.title.trim() || null,
        portfolio_caption: merged.caption.trim() || null,
        portfolio_trade_category: merged.trade || null,
      });
      if (saveErr) throw saveErr;

      // Update draft state locally so it stays in sync
      setCompletionProofDrafts(prev => ({
        ...prev,
        [proofId]: merged,
      }));

      await loadCompletionProofPortfolioItems();
    } catch (err: any) {
      console.error('Completion proof publication save error:', err);
      setCompletionProofError(err.message || 'Failed to update completed work gallery settings.');
    } finally {
      setCompletionProofSavingId(null);
    }
  };

  const handleIdentityUpload = async (e?: React.FormEvent, documentType = idDocType) => {
    e?.preventDefault();
    if (!user) return;
    if (!idFile) {
      setIdUploadError('Please select a photo ID document file.');
      return;
    }

    setUploadingDoc(true);
    setIdUploadError(null);
    setIdUploadSuccess(false);

    try {
      const fileExt = idFile.name.split('.').pop();
      const filePath = `users/${user.id}/${Date.now()}_id.${fileExt}`;

      // 1. Upload to Storage
      const { error: uploadErr } = await supabase.storage
        .from('verifications')
        .upload(filePath, idFile);

      if (uploadErr) throw uploadErr;

      // 2. Submit Verification Row
      const { error: dbErr } = await submitVerification({
        user_id: user.id,
        document_type: documentType,
        document_url: filePath
      });

      if (dbErr) throw dbErr;

      setIdUploadSuccess(true);
      setIdFile(null);
      await loadVerificationStatus();
      await loadProfile();
    } catch (err: any) {
      console.error('Identity upload error:', err);
      setIdUploadError(err.message || 'Failed to submit photo ID for review.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleLivenessUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!livenessFile) {
      setLivenessUploadError('Please select a selfie photo file.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(livenessFile.type)) {
      setLivenessUploadError('Invalid file type. Please upload a JPEG, PNG, or WEBP image.');
      return;
    }

    setLivenessUploading(true);
    setLivenessUploadError(null);
    setLivenessUploadSuccess(false);

    try {
      const fileExt = livenessFile.name.split('.').pop();
      const filePath = `users/${user.id}/${Date.now()}_liveness_selfie.${fileExt}`;

      // 1. Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from('verifications')
        .upload(filePath, livenessFile);

      if (uploadErr) throw uploadErr;

      // 2. Submit verification row
      const { error: dbErr } = await submitVerification({
        user_id: user.id,
        document_type: 'liveness_selfie',
        document_url: filePath
      });

      if (dbErr) throw dbErr;

      setLivenessUploadSuccess(true);
      setLivenessFile(null);
      await loadVerificationStatus();
      await loadProfile();
    } catch (err: any) {
      console.error('Liveness selfie upload error:', err);
      setLivenessUploadError(err.message || 'Failed to submit liveness selfie for review.');
    } finally {
      setLivenessUploading(false);
    }
  };

  const handleApplyAsTradie = async (e?: React.FormEvent, documentType = tradieDocType, selectedFile = tradieFile) => {
    e?.preventDefault();
    if (!user) return;
    if (!selectedFile) {
      setUploadError('Please select a credential document file.');
      return;
    }
    if (!abn.trim()) {
      setUploadError('Please enter your ABN.');
      return;
    }
    if (!licenseNumber.trim()) {
      setUploadError('Please enter your licence number.');
      return;
    }
    if (trades.length === 0) {
      setUploadError('Please select at least one trade.');
      return;
    }

    setUploadingDoc(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // 1. Update ABN, licence, and trades on user profile first (only if not already pending/approved to avoid trigger exceptions)
      if (tradieVerificationStatus !== 'pending' && !targetProfile?.tradie_verified) {
        const { error: profileErr } = await updateUserProfile(user.id, {
          abn: abn.trim(),
          license_number: licenseNumber.trim(),
          trades: trades
        });
        if (profileErr) throw profileErr;
      }

      // 2. Upload file to Supabase storage private 'verifications' bucket
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `users/${user.id}/${Date.now()}_tradie.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('verifications')
        .upload(filePath, selectedFile);
      if (uploadErr) throw uploadErr;

      // 3. Submit verification request record
      const { error: dbErr } = await submitVerification({
        user_id: user.id,
        document_type: documentType,
        document_url: filePath
      });
      if (dbErr) throw dbErr;

      setUploadSuccess(true);
      setTradieFile(null);
      setTradieFiles(prev => ({ ...prev, [documentType]: null }));
      await loadVerificationStatus();
      await loadProfile();
      refreshProfile();
    } catch (err: any) {
      console.error('Tradie application error:', err);
      setUploadError(err.message || 'Failed to submit application.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const getDocumentStatus = (documentType: string, fallback: VerificationStatus = 'none'): VerificationStatus => {
    const summary = verificationSummaries[documentType];
    return deriveDocumentStatus(summary) || fallback;
  };

  const getStatusLabel = (status: VerificationStatus, required = true) => {
    if (status === 'none') return required ? 'Required' : 'Optional';
    if (status === 'recheck') return 'Recheck Requested';
    if (status === 'requested_more_info') return 'More Info Requested';
    if (status === 'revoked') return 'Revoked';
    if (status === 'expired') return 'Expired';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusClass = (status: VerificationStatus) => {
    if (status === 'approved') return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (status === 'pending') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    if (status === 'recheck') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    if (status === 'requested_more_info') return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    if (status === 'rejected' || status === 'expired' || status === 'revoked') return 'bg-red-500/10 text-red-500 border-red-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  const setTradieCardFile = (documentType: string, file: File | null) => {
    setTradieFiles(prev => ({ ...prev, [documentType]: file }));
    setTradieDocType(documentType);
    setTradieFile(file);
    if (file && uploadError === 'Please select a credential document file.') {
      setUploadError(null);
    }
  };

  if (authLoading || (profileLoading && !targetProfile)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-semibold text-muted-foreground">Loading profile details...</p>
      </div>
    );
  }

  // Redirect guest or missing user if viewing self
  if (isSelf && !user) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-foreground">Sign In to View Profile</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-semibold">
            Please sign in to manage your account details, track your jobs, or update your preferences.
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/login"
            state={{ from: location }}
            className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold py-3.5 rounded-xl hover:bg-primary/95 shadow-md active:scale-95 transition-all"
          >
            Sign In / Register
          </Link>
        </div>
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border rounded-3xl shadow-xl text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h3 className="text-xl font-bold text-foreground">Profile Not Found</h3>
        <p className="text-sm text-muted-foreground font-semibold">
          The requested profile does not exist or has been removed from the platform.
        </p>
        <Link to="/" className="inline-block bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl text-sm shadow-md hover:bg-primary/95">
          Back to Home
        </Link>
      </div>
    );
  }

  const displayNameStr = targetProfile.display_name || 'User';
  const roleLabel = targetProfile.role ? (targetProfile.role.charAt(0).toUpperCase() + targetProfile.role.slice(1)) : 'Customer';
  const locationParts = [targetProfile.suburb, targetProfile.state].filter(Boolean);
  const displayLocation = locationParts.length > 0 ? locationParts.join(', ') : 'No location specified';
  const effectiveIdVerificationStatus: VerificationStatus =
    idVerificationStatus === 'approved' && !targetProfile.identity_verified ? 'recheck' : idVerificationStatus;
  const effectiveLivenessVerificationStatus: VerificationStatus =
    livenessVerificationStatus === 'approved' && !targetProfile.identity_verified ? 'recheck' : livenessVerificationStatus;
  const currentIdentityVerified =
    targetProfile.identity_verified &&
    effectiveIdVerificationStatus === 'approved' &&
    effectiveLivenessVerificationStatus === 'approved';
  const currentTradieVerified =
    targetProfile.tradie_verified &&
    currentIdentityVerified &&
    tradieVerificationStatus === 'approved';
  const isVerified = targetProfile.role === 'customer' 
    ? currentIdentityVerified
    : currentTradieVerified;

  // Average review calculation
  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1) : null;
  const publishedCompletionProofCount = completionProofItems.filter(item => item.is_public_portfolio).length;
  const hiddenCompletionProofCount = completionProofItems.length - publishedCompletionProofCount;
  const filteredCompletionProofItems = completionProofItems.filter(item => {
    if (completedWorkFilter === 'published') return item.is_public_portfolio;
    if (completedWorkFilter === 'hidden') return !item.is_public_portfolio;
    return true;
  });
  const profileTabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'account', label: 'Account' },
    { id: 'verification', label: 'Verification' },
    ...(targetProfile.role !== 'customer'
      ? [
          { id: 'tradie-profile' as ProfileTab, label: 'Tradie Profile' },
          { id: 'completed-work' as ProfileTab, label: 'Completed Work' },
        ]
      : []),
  ];

  const tradieCredentialPanel = targetProfile.role !== 'customer' ? (
    <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
      <div className="border-b pb-4">
        <h3 className="text-xl font-bold text-foreground">Tradie Credential Uploads</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Submit contractor licences, insurance, and supporting trade credentials for admin review.
        </p>
      </div>

      {currentTradieVerified && !['recheck', 'expired', 'rejected', 'revoked', 'requested_more_info'].includes(tradieVerificationStatus) ? (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
          <div>
            <p className="font-bold">Tradie Profile Approved</p>
            <p className="mt-0.5 font-medium text-green-600/90 leading-relaxed">
              Your professional credentials have been reviewed, whitelisted, and approved by TradieHubAU admins.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {['recheck', 'requested_more_info'].includes(tradieVerificationStatus) && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Credential Action Required</p>
                <p className="mt-1 font-medium text-amber-700/90 leading-relaxed">
                  An administrator has requested updated trade credential information. Please upload the current document requested below.
                </p>
              </div>
            </div>
          )}

          {['expired', 'rejected', 'revoked'].includes(tradieVerificationStatus) && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Credential Replacement Required</p>
                <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                  Your previous trade credential is not currently accepted. Please upload a current replacement document.
                </p>
              </div>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold">
              Document uploaded and submitted to review queue successfully!
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
              {uploadError}
            </div>
          )}

          <div className="grid gap-3">
            {TRADIE_DOCUMENT_CARDS.map((doc) => {
              const status = getDocumentStatus(doc.type);
              const selectedFile = tradieFiles[doc.type];
              return (
                <div key={doc.type} className="rounded-2xl border bg-muted/10 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <h6 className="text-sm font-black text-foreground">{doc.title}</h6>
                      <p className="text-xs text-muted-foreground font-semibold mt-0.5">{doc.helper}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${getStatusClass(status)}`}>
                      {getStatusLabel(status, doc.required)}
                    </span>
                  </div>

                  {selectedFile && (
                    <p className="text-xs font-bold text-muted-foreground">{selectedFile.name}</p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="inline-flex flex-1 items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                      <Upload className="h-4 w-4" /> Choose File
                      <input
                        type="file"
                        onChange={(e) => setTradieCardFile(doc.type, e.target.files?.[0] || null)}
                        disabled={uploadingDoc}
                        className="hidden"
                        accept="image/*,application/pdf"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleApplyAsTradie(undefined, doc.type, selectedFile || null)}
                      disabled={uploadingDoc || !selectedFile}
                      className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                    >
                      {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Submit Document
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ) : null;

  const actionStatuses: VerificationStatus[] = ['none', 'recheck', 'requested_more_info', 'revoked', 'expired', 'rejected'];
  const allCredentialStatuses = TRADIE_DOCUMENT_CARDS.map(doc => getDocumentStatus(doc.type));
  const credentialsNeedAction =
    targetProfile.role !== 'customer' &&
    (actionStatuses.includes(tradieVerificationStatus) || allCredentialStatuses.some(status => actionStatuses.includes(status)));
  const nextVerificationAction = (() => {
    if (actionStatuses.includes(effectiveIdVerificationStatus)) {
      return {
        title: 'Photo ID action required',
        body: effectiveIdVerificationStatus === 'none'
          ? 'Upload a clear photo ID document to start identity verification.'
          : 'Your current photo ID status needs attention. Upload a replacement document from the Photo ID card below.',
      };
    }
    if (actionStatuses.includes(effectiveLivenessVerificationStatus)) {
      return {
        title: 'Liveness selfie action required',
        body: effectiveLivenessVerificationStatus === 'none'
          ? 'Upload a liveness selfie to complete the identity check.'
          : 'Your liveness selfie status needs attention. Upload a replacement selfie from the Liveness Selfie card below.',
      };
    }
    if (credentialsNeedAction) {
      return {
        title: 'Credentials action required',
        body: 'Upload the required licence and insurance documents so admin review can continue.',
      };
    }
    if (
      effectiveIdVerificationStatus === 'pending' ||
      effectiveLivenessVerificationStatus === 'pending' ||
      tradieVerificationStatus === 'pending'
    ) {
      return {
        title: 'Review in progress',
        body: 'Your submitted verification material is waiting for admin review.',
      };
    }
    return {
      title: 'Verification complete',
      body: targetProfile.role === 'customer'
        ? 'Your current customer identity checks are complete.'
        : 'Your current identity and tradie credential checks are complete.',
    };
  })();

  const isVerificationComplete = nextVerificationAction.title === 'Verification complete';

  const compactVerificationDashboard = (
    <div className="space-y-6">
      {/* 1. Top Summary Banner */}
      <section className="w-full rounded-3xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-start gap-4 w-full">
          {isVerificationComplete ? (
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-foreground break-words">{nextVerificationAction.title}</h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground break-words">{nextVerificationAction.body}</p>
            {isVerificationComplete && (
              <p className="mt-2 text-[10px] font-black text-green-600 uppercase tracking-wider">
                {targetProfile.role === 'customer' ? "Verified to use TradieHubAU" : "You’re ready to quote on eligible jobs"}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center w-full border-t border-border/60 pt-4">
          <div className="flex items-center gap-1.5 rounded-xl border bg-muted/10 px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${effectiveIdVerificationStatus === 'approved' ? 'bg-green-500' : effectiveIdVerificationStatus === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/30'}`}></span>
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Photo ID:</span>
            <span className={`text-[10px] font-black uppercase ${effectiveIdVerificationStatus === 'approved' ? 'text-green-600' : effectiveIdVerificationStatus === 'pending' ? 'text-amber-700' : 'text-muted-foreground'}`}>{getStatusLabel(effectiveIdVerificationStatus)}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border bg-muted/10 px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${effectiveLivenessVerificationStatus === 'approved' ? 'bg-green-500' : effectiveLivenessVerificationStatus === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/30'}`}></span>
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Liveness:</span>
            <span className={`text-[10px] font-black uppercase ${effectiveLivenessVerificationStatus === 'approved' ? 'text-green-600' : effectiveLivenessVerificationStatus === 'pending' ? 'text-amber-700' : 'text-muted-foreground'}`}>{getStatusLabel(effectiveLivenessVerificationStatus)}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border bg-muted/10 px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${tradieVerificationStatus === 'approved' ? 'bg-green-500' : tradieVerificationStatus === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/30'}`}></span>
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Credentials:</span>
            <span className={`text-[10px] font-black uppercase ${tradieVerificationStatus === 'approved' ? 'text-green-600' : tradieVerificationStatus === 'pending' ? 'text-amber-700' : 'text-muted-foreground'}`}>{getStatusLabel(tradieVerificationStatus, targetProfile.role !== 'customer')}</span>
          </div>
        </div>
      </section>

      {/* 2. Identity Verification Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-base font-black text-foreground">Identity Verification</h3>
          <span className="text-[10px] font-bold text-muted-foreground">STEP 1 OF 2</span>
        </div>

        {/* Photo ID Compact Row */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {effectiveIdVerificationStatus === 'approved' ? (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : effectiveIdVerificationStatus === 'pending' ? (
                <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-black text-foreground break-words">Photo ID</h4>
                <p className="mt-1 text-xs font-semibold text-muted-foreground leading-normal break-words">
                  {IDENTITY_DOCUMENT_CARD.helper}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${getStatusClass(effectiveIdVerificationStatus)}`}>
                {getStatusLabel(effectiveIdVerificationStatus)}
              </span>
            </div>
          </div>

          {effectiveIdVerificationStatus !== 'approved' && effectiveIdVerificationStatus !== 'pending' && (
            <div className="border-t border-border/60 pt-3 space-y-3">
              {(idVerificationRecheckReason || idVerificationNotes) ? (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                  {idVerificationRecheckReason || idVerificationNotes}
                </p>
              ) : (
                effectiveIdVerificationStatus !== 'none' && (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                    Action required. Upload a clear replacement photo ID.
                  </p>
                )
              )}
              <form onSubmit={handleIdentityUpload} className="space-y-3 max-w-md">
                {idUploadSuccess && <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs font-semibold text-green-600">Your ID document has been submitted for verification.</p>}
                {idUploadError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-500">{idUploadError}</p>}
                {idFile && (
                  <div className="flex items-center gap-2 p-2 bg-muted/20 border rounded-xl">
                    <span className="truncate text-foreground font-semibold text-xs">{idFile.name}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex-1 inline-flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-3 py-2 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                    <Upload className="h-4 w-4" /> Choose File
                    <input
                      type="file"
                      onChange={(e) => {
                        setIdDocType(IDENTITY_DOCUMENT_CARD.type);
                        setIdFile(e.target.files?.[0] || null);
                      }}
                      disabled={uploadingDoc}
                      className="hidden"
                      accept="image/*,application/pdf"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={uploadingDoc || !idFile}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-2 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                  >
                    {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Submit ID
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Liveness Selfie Compact Row */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {effectiveLivenessVerificationStatus === 'approved' ? (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : effectiveLivenessVerificationStatus === 'pending' ? (
                <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-black text-foreground break-words">Liveness Selfie</h4>
                <p className="mt-1 text-xs font-semibold text-muted-foreground leading-normal break-words">
                  Upload a clear selfie holding up 4 fingers next to your face.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${getStatusClass(effectiveLivenessVerificationStatus)}`}>
                {getStatusLabel(effectiveLivenessVerificationStatus)}
              </span>
            </div>
          </div>

          {effectiveLivenessVerificationStatus !== 'approved' && effectiveLivenessVerificationStatus !== 'pending' && (
            <div className="border-t border-border/60 pt-3 space-y-3">
              {(livenessVerificationRecheckReason || livenessVerificationNotes) ? (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                  {livenessVerificationRecheckReason || livenessVerificationNotes}
                </p>
              ) : (
                effectiveLivenessVerificationStatus !== 'none' && (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                    Action required. Upload a replacement liveness selfie.
                  </p>
                )
              )}
              <form onSubmit={handleLivenessUpload} className="space-y-3 max-w-md">
                {livenessUploadSuccess && <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs font-semibold text-green-600">Your selfie has been submitted for review.</p>}
                {livenessUploadError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-500">{livenessUploadError}</p>}
                {livenessFile && (
                  <div className="flex items-center gap-2 p-2 bg-muted/20 border rounded-xl">
                    <span className="truncate text-foreground font-semibold text-xs">{livenessFile.name}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex-1 inline-flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-3 py-2 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                    <Camera className="h-4 w-4" /> Take / Choose Photo
                    <input
                      type="file"
                      onChange={(e) => setLivenessFile(e.target.files?.[0] || null)}
                      disabled={livenessUploading}
                      className="hidden"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={livenessUploading || !livenessFile}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-2 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                  >
                    {livenessUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Submit Selfie
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* 3. Tradie Credentials Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-base font-black text-foreground">
            {targetProfile.role === 'customer' ? 'Apply as a Contractor' : 'Tradie Credentials'}
          </h3>
          {targetProfile.role !== 'customer' && (
            <span className="text-[10px] font-bold text-muted-foreground">STEP 2 OF 2</span>
          )}
        </div>

        {targetProfile.role === 'customer' && (
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
              <div className="md:col-span-1 space-y-2">
                <h4 className="text-sm font-black text-foreground">Submit Application</h4>
                <p className="text-[11px] font-semibold leading-relaxed text-muted-foreground">
                  Provide your ABN and licence number to apply for contractor status.
                </p>
              </div>
              <div className="md:col-span-2 text-xs font-semibold leading-5 text-muted-foreground">
                <form onSubmit={handleApplyAsTradie} className="space-y-3 max-w-md">
                  {uploadSuccess && <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs font-semibold text-green-600">Your credentials have been submitted for review.</p>}
                  {uploadError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-500">{uploadError}</p>}
                  <div className="grid gap-3">
                    <div className="rounded-2xl border bg-muted/10 p-3 space-y-3">
                      <div>
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Credential document</label>
                        <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
                          Upload your contractor licence, insurance certificate, or trade credential document.
                        </p>
                      </div>
                      {tradieFile && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-2">
                          <span className="truncate text-xs font-bold text-foreground">{tradieFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setTradieCardFile('contractor_license', null)}
                            className="shrink-0 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <label className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-secondary-foreground transition-all hover:bg-secondary/80 cursor-pointer select-none">
                        <Upload className="h-4 w-4" /> Choose Credential File
                        <input
                          type="file"
                          onChange={(e) => setTradieCardFile('contractor_license', e.target.files?.[0] || null)}
                          disabled={uploadingDoc || tradieVerificationStatus === 'pending'}
                          className="hidden"
                          accept="image/*,application/pdf"
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={abn}
                      onChange={(e) => setAbn(e.target.value)}
                      placeholder="ABN"
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                      disabled={tradieVerificationStatus === 'pending'}
                    />
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="Trade licence number"
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                      disabled={tradieVerificationStatus === 'pending'}
                    />
                    <button
                      type="submit"
                      disabled={uploadingDoc || !abn || !licenseNumber || tradieVerificationStatus === 'pending'}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                    >
                      Apply Now
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {targetProfile.role !== 'customer' && (
          <div className="space-y-3">
            {uploadSuccess && <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs font-semibold text-green-600">Document uploaded and submitted to review queue successfully.</p>}
            {uploadError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-500">{uploadError}</p>}

            {/* Render each credential document as a compact checklist row */}
            {TRADIE_DOCUMENT_CARDS.map((doc) => {
              const status = getDocumentStatus(doc.type);
              const selectedFile = tradieFiles[doc.type];
              const docSummary = verificationSummaries[doc.type];
              const recheckReason = docSummary?.recheck_reason || null;
              const adminNotes = docSummary?.admin_notes || null;
              const reasonText = recheckReason || adminNotes;

              const isComplete = status === 'approved' || status === 'pending';

              return (
                <div key={doc.type} className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {status === 'approved' ? (
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      ) : status === 'pending' ? (
                        <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      ) : status === 'none' && !doc.required ? (
                        <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black text-foreground break-words">{doc.title}</h4>
                          {!doc.required && (
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground leading-relaxed break-words">
                          {doc.helper}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${getStatusClass(status)}`}>
                        {getStatusLabel(status, doc.required)}
                      </span>
                    </div>
                  </div>

                  {!isComplete && (
                    <div className="border-t border-border/60 pt-3 space-y-3">
                      {reasonText && (
                        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                          {reasonText}
                        </p>
                      )}
                      {status !== 'none' && !reasonText && (
                        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold leading-relaxed text-amber-700 break-words">
                          Action required. Please upload a clear replacement document.
                        </p>
                      )}
                      <div className="space-y-3 max-w-md">
                        {selectedFile && (
                          <div className="flex items-center gap-2 p-2 bg-muted/20 border rounded-xl">
                            <span className="truncate text-foreground font-semibold text-xs">{selectedFile.name}</span>
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <label className="flex-1 inline-flex items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-3 py-2 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                            <Upload className="h-4 w-4" /> Choose File
                            <input
                              type="file"
                              onChange={(e) => setTradieCardFile(doc.type, e.target.files?.[0] || null)}
                              disabled={uploadingDoc}
                              className="hidden"
                              accept="image/*,application/pdf"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleApplyAsTradie(undefined, doc.type, selectedFile || null)}
                            disabled={uploadingDoc || !selectedFile}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-2 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                          >
                            {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Submit
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header and Back Link (Public view only) */}
      {!isSelf && (
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm font-bold text-primary hover:text-primary/80 transition-colors">
            ← Back to Directory
          </button>
        </div>
      )}

      {isSelf && (
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Your Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your account information and verification details.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Avatar & Overview Box */}
        <section className="bg-card border p-6 rounded-3xl space-y-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-primary via-amber-500 to-orange-600"></div>

          {/* Initials Avatar / Profile Pic */}
          <div className="relative group">
            <div className="h-28 w-28 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-4xl font-extrabold shadow-sm select-none">
              {targetProfile.avatar_url ? (
                <img src={targetProfile.avatar_url} alt={displayNameStr} className="h-full w-full rounded-full object-cover" />
              ) : (
                displayNameStr.charAt(0).toUpperCase()
              )}
            </div>
            {isSelf && (
              <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[10px] font-black text-primary-foreground shadow-md cursor-pointer">
                {avatarUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                Photo
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  disabled={avatarUploading}
                  onChange={(event) => void handleAvatarUpload(event.target.files?.[0])}
                />
              </label>
            )}
          </div>

          {isSelf && avatarError && (
            <p className="text-xs font-semibold text-red-500">{avatarError}</p>
          )}

          <div className="space-y-2 w-full">
            <h2 className="text-2xl font-black text-foreground flex items-center justify-center gap-1.5">
              {displayNameStr}
              {isVerified && (
                <span title="Verified Badge">
                  <ShieldCheck className="h-6 w-6 text-primary fill-primary/10" />
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-secondary text-secondary-foreground">
                {roleLabel} Role
              </span>
              {isSelf && targetProfile.is_admin && (
                <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                  Staff Admin
                </span>
              )}
            </div>
            {averageRating && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-500 bg-amber-500/15 px-3 py-1 rounded-full w-fit mx-auto mt-2">
                <Star className="h-4 w-4 fill-amber-500 stroke-amber-500" />
                <span>{averageRating} / 5 ({totalReviews} reviews)</span>
              </div>
            )}
          </div>

          <div className="border-t w-full pt-4 space-y-3 text-left text-sm text-muted-foreground font-semibold">
            {isSelf && (
              <>
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4.5 w-4.5 text-muted-foreground/60 shrink-0" />
                  <span className="truncate">{targetProfile.email}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4.5 w-4.5 text-muted-foreground/60 shrink-0" />
                  <span>{targetProfile.phone || 'No phone added'}</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4.5 w-4.5 text-muted-foreground/60 shrink-0" />
              <span>{displayLocation}</span>
            </div>
          </div>

          {/* CTA Row (Guest views) */}
          {!isSelf && (
            <div className="pt-2 w-full flex flex-col gap-2.5">
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-center text-sm font-semibold leading-6 text-muted-foreground">
                Messaging is available through active jobs and contracts.
              </div>
              <button
                onClick={handleToggleBookmark}
                disabled={saveActionLoading}
                className={`w-full inline-flex items-center justify-center gap-2 border text-sm font-bold py-3 rounded-xl transition-all active:scale-95 ${
                  isSaved
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'bg-transparent border-border text-foreground hover:bg-muted'
                }`}
              >
                {saveActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSaved ? (
                  <><BookmarkCheck className="h-4 w-4" /> Saved</>
                ) : (
                  <><Bookmark className="h-4 w-4" /> Bookmark</>
                )}
              </button>
            </div>
          )}

          {isSelf && targetProfile.tradie_verified && (
            <div className="w-full pt-2 space-y-2">
              <Link
                to={`/tradies/${targetProfile.id}`}
                className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-bold py-2 rounded-xl hover:bg-primary/95 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview public profile
              </Link>
              <button
                onClick={handleRoleToggle}
                className="w-full border border-border text-xs font-bold py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                Switch to {targetProfile.role === 'customer' ? 'Tradie' : 'Customer'} Settings
              </button>
            </div>
          )}
        </section>

        {/* Right Columns: Main content panels */}
        <main className="lg:col-span-2 space-y-8">
          {isSelf ? (
            /* Settings View (Self) */
            <div className="space-y-8">
              <div className="bg-card border rounded-3xl p-2 shadow-sm overflow-x-auto">
                <div className="flex min-w-max gap-1">
                  {profileTabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveProfileTab(tab.id)}
                      className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                        activeProfileTab === tab.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {(activeProfileTab === 'account' || activeProfileTab === 'tradie-profile') && (
              <form onSubmit={handleSaveProfile} className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-xl font-bold text-foreground">
                  {activeProfileTab === 'account' ? 'Account Settings' : 'Tradie Profile Settings'}
                </h3>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Changes
                </button>
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Your profile changes have been successfully saved.</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {activeProfileTab === 'account' && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0400 000 000"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Suburb</label>
                  <input
                    type="text"
                    value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">State</label>
                  <select
                    value={stateVal}
                    onChange={(e) => setStateVal(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold cursor-pointer"
                  >
                    <option value="">Select...</option>
                    {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">Postcode</label>
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                />
              </div>

              <div className="space-y-4 border-t pt-5">
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  Privacy Controls
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showLocation}
                      onChange={(e) => setShowLocation(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/20 h-4.5 w-4.5"
                    />
                    <span className="text-sm font-semibold text-muted-foreground">Show suburb & state publicly on directories</span>
                  </label>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider block">When can accepted tradies see my full address?</label>
                    <select
                      value={addressRule}
                      onChange={(e) => setAddressRule(e.target.value as any)}
                      className="w-full md:w-fit bg-background border border-border rounded-xl px-3 py-2 outline-none focus:border-primary/50 text-xs font-bold cursor-pointer text-muted-foreground"
                    >
                      <option value="never">Never (Always handle communication on platform)</option>
                      <option value="afterAccepted">Instantly when I accept their quote</option>
                      <option value="afterJobStarts">Only when the job is formally in-progress</option>
                    </select>
                  </div>
                </div>
              </div>
              </>
              )}

              {/* Tradie specific section */}
              {targetProfile.role !== 'customer' && activeProfileTab === 'tradie-profile' && (
                <div className="space-y-6 border-t pt-5">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Tradie Profile</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">ABN</label>
                      <input
                        type="text"
                        value={abn}
                        onChange={(e) => setAbn(e.target.value)}
                        placeholder="11-digit ABN number"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                        disabled={targetProfile.tradie_verified || tradieVerificationStatus === 'pending'}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade License Number</label>
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="Licence certificate ID"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                        disabled={targetProfile.tradie_verified || tradieVerificationStatus === 'pending'}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Trades Offered</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {categoryOptions.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-xl hover:bg-muted/10 transition-colors">
                          <input
                            type="checkbox"
                            checked={trades.includes(cat.id)}
                            onChange={() => setTrades(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                            className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
                            disabled={targetProfile.tradie_verified || tradieVerificationStatus === 'pending'}
                          />
                          <span className="text-xs font-bold text-muted-foreground">{cat.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-5 border-t pt-5">
                    <div>
                      <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">Public Tradie Profile</h5>
                      <p className="mt-1 text-xs text-muted-foreground font-semibold">
                        These fields are safe public profile details. Private contact details and verification documents stay hidden.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Business Name</label>
                        <input
                          type="text"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="e.g. Bayside Electrical Co"
                          className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Years Experience</label>
                        <input
                          type="number"
                          min="0"
                          max="80"
                          value={yearsExperience}
                          onChange={(e) => setYearsExperience(e.target.value)}
                          className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">About / Bio</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        maxLength={1200}
                        placeholder="Describe your business, workmanship, and typical jobs."
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold transition-all resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Service Areas</label>
                        <input
                          type="text"
                          value={serviceAreas}
                          onChange={(e) => setServiceAreas(e.target.value)}
                          placeholder="South Melbourne, Frankston, Dandenong"
                          className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                        />
                        <p className="text-[11px] text-muted-foreground font-medium">Separate suburbs with commas.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground uppercase tracking-wider">Website / Social Link</label>
                        <div className="relative">
                          <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="url"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verification document status / uploads */}
                  {true ? null : currentTradieVerified && !['recheck', 'expired', 'rejected'].includes(tradieVerificationStatus) ? (
                    <div className="space-y-4 border-t pt-5">
                      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
                        <div>
                          <p className="font-bold">Tradie Profile Approved ✓</p>
                          <p className="mt-0.5 font-medium text-green-600/90 leading-relaxed">
                            Your professional credentials (ABN and License) have been reviewed, whitelisted, and approved by TradieHubAU admins.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 border-t pt-5">
                      <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">Submit Credential Document</h5>
                      <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
                        Upload your contractor license or insurance certificate. TradieHubAU admins will review documents atomically to check qualifications.
                      </p>

                      {tradieVerificationStatus === 'recheck' && (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold flex items-start gap-2">
                          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Credential Recheck Requested</p>
                            <p className="mt-1 font-medium text-amber-700/90 leading-relaxed">
                              An administrator has requested an updated trade credential document. Please upload the current document requested below.
                            </p>
                          </div>
                        </div>
                      )}

                      {tradieVerificationStatus === 'expired' && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Credential Expired</p>
                            <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                              One of your submitted trade credential documents has expired or needs updating. Please upload a current document.
                            </p>
                          </div>
                        </div>
                      )}

                      {uploadSuccess && (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold">
                          Document uploaded and submitted to review queue successfully!
                        </div>
                      )}

                      {uploadError && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                          {uploadError}
                        </div>
                      )}

                      <div className="grid gap-3">
                        {TRADIE_DOCUMENT_CARDS.map((doc) => {
                          const status = getDocumentStatus(doc.type);
                          const selectedFile = tradieFiles[doc.type];
                          return (
                            <div key={doc.type} className="rounded-2xl border bg-muted/10 p-4 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                <div>
                                  <h6 className="text-sm font-black text-foreground">{doc.title}</h6>
                                  <p className="text-xs text-muted-foreground font-semibold mt-0.5">{doc.helper}</p>
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${getStatusClass(status)}`}>
                                  {getStatusLabel(status, doc.required)}
                                </span>
                              </div>

                              {selectedFile && (
                                <p className="text-xs font-bold text-muted-foreground">{selectedFile.name}</p>
                              )}

                              <div className="flex flex-col sm:flex-row gap-2">
                                <label className="inline-flex flex-1 items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                                  <Upload className="h-4 w-4" /> Choose File
                                  <input
                                    type="file"
                                    onChange={(e) => setTradieCardFile(doc.type, e.target.files?.[0] || null)}
                                    disabled={uploadingDoc}
                                    className="hidden"
                                    accept="image/*,application/pdf"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => void handleApplyAsTradie(undefined, doc.type, selectedFile || null)}
                                  disabled={uploadingDoc || !selectedFile}
                                  className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                                >
                                  {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                  Submit Document
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
              )}

            {activeProfileTab === 'verification' && compactVerificationDashboard}

            {/* Verification Status Summary Card */}
            {false && activeProfileTab === 'verification' && (
            <>
            <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
              <div className="border-b pb-4">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-5.5 w-5.5 text-primary" /> Verification Status Overview
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Track your verification credentials and trust checklist progress.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Identity Document */}
                <div className="p-4 rounded-2xl border bg-muted/5 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">1. Photo ID Verification</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Drivers license or passport submission.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusClass(effectiveIdVerificationStatus)}`}>
                      {getStatusLabel(effectiveIdVerificationStatus)}
                    </span>
                    {effectiveIdVerificationStatus === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  </div>
                </div>

                {/* 2. Liveness Selfie */}
                <div className="p-4 rounded-2xl border bg-muted/5 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">2. Liveness Selfie</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Physically present verification check. Not shown publicly.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusClass(effectiveLivenessVerificationStatus)}`}>
                      {getStatusLabel(effectiveLivenessVerificationStatus)}
                    </span>
                    {effectiveLivenessVerificationStatus === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  </div>
                </div>

                {/* 3. Trade Credentials */}
                {targetProfile?.role !== 'customer' && (
                  <div className="p-4 rounded-2xl border bg-muted/5 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">3. Professional Credentials</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Contractor license &amp; public liability insurance.
                      </p>
                    </div>
                    <div className="pt-2 flex items-center justify-between">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getStatusClass(tradieVerificationStatus)}`}>
                        {getStatusLabel(tradieVerificationStatus)}
                      </span>
                      {tradieVerificationStatus === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                    </div>
                  </div>
                )}
              </div>

              {/* General Guidance message */}
              <div className="text-xs font-semibold leading-relaxed p-4 rounded-2xl bg-primary/5 text-primary border border-primary/10">
                {targetProfile?.role === 'customer' ? (
                  <p>
                    {currentIdentityVerified
                      ? "✓ Your customer identity verification is complete. You are fully verified!"
                      : "Please submit both your Photo ID and Liveness Selfie to verify your account."}
                  </p>
                ) : (
                  <p>
                    {currentTradieVerified
                      ? "✓ Your professional tradie profile is whitelisted and approved!"
                      : "Submit Photo ID, Liveness Selfie, ABN, contractor license, and insurance to get whitelisted."}
                  </p>
                )}
              </div>
            </div>

            {/* Identity Verification Section (Shown to all users) */}
            <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
              <div className="border-b pb-4">
                <h3 className="text-xl font-bold text-foreground">Identity Verification</h3>
                <p className="text-xs text-muted-foreground mt-1">Verify your basic photo ID to build trust across TradieHubAU.</p>
              </div>

              {effectiveIdVerificationStatus === 'approved' ? (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="font-bold">Identity Verified ✓</p>
                    <p className="mt-0.5 font-medium text-green-600/90 leading-relaxed">
                      Your identity documents have been checked and approved by TradieHubAU admins.
                    </p>
                  </div>
                </div>
              ) : effectiveIdVerificationStatus === 'pending' ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold flex items-start gap-2">
                  <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">ID Verification Pending Review</p>
                    <p className="mt-1 font-medium text-amber-600/90 leading-relaxed">
                      Your photo ID document is currently under manual review by our administration staff.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleIdentityUpload} className="space-y-4">
                  {effectiveIdVerificationStatus === 'recheck' && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Identity Recheck Requested</p>
                        <p className="mt-1 font-medium text-amber-700/90 leading-relaxed">
                          An administrator has requested a recheck of your photo ID. Reason: <strong className="text-foreground">{idVerificationRecheckReason}</strong>. Please upload a new ID.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveIdVerificationStatus === 'requested_more_info' && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">More Information Required</p>
                        <p className="mt-1 font-medium text-amber-700/90 leading-relaxed">
                          An administrator needs an updated or clearer photo ID. Please upload a replacement ID.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveIdVerificationStatus === 'revoked' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Identity Verification Revoked</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your previous photo ID is no longer accepted. Please upload a replacement ID.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveIdVerificationStatus === 'expired' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Identity Document Expired</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your submitted photo ID document has expired or is out of date. Please upload a current ID.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveIdVerificationStatus === 'rejected' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">ID Verification Rejected</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your previous photo ID was rejected: <strong className="text-foreground">{idVerificationNotes}</strong>.
                          Please upload a clear copy of your driver's license or passport to re-submit.
                        </p>
                      </div>
                    </div>
                  )}

                  {idUploadSuccess && (
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold">
                      Your ID document has been submitted for verification.
                    </div>
                  )}

                  {idUploadError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                      {idUploadError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Required Documents</h4>
                    <div className="rounded-2xl border bg-muted/10 p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div>
                          <h5 className="text-sm font-black text-foreground">{IDENTITY_DOCUMENT_CARD.title}</h5>
                          <p className="text-xs text-muted-foreground font-semibold mt-0.5">{IDENTITY_DOCUMENT_CARD.helper}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${getStatusClass(effectiveIdVerificationStatus)}`}>
                          {getStatusLabel(effectiveIdVerificationStatus)}
                        </span>
                      </div>

                      {idFile && (
                        <p className="text-xs font-bold text-muted-foreground">{idFile?.name}</p>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className="inline-flex flex-1 items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                          <Upload className="h-4 w-4" /> Choose File
                          <input
                            type="file"
                            onChange={(e) => {
                              setIdDocType(IDENTITY_DOCUMENT_CARD.type);
                              setIdFile(e.target.files?.[0] || null);
                            }}
                            disabled={uploadingDoc}
                            className="hidden"
                            accept="image/*,application/pdf"
                          />
                        </label>

                        <button
                          type="submit"
                          disabled={uploadingDoc || !idFile}
                          className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                        >
                          {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Submit Document
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Liveness Selfie Section (Shown to all users) */}
            <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
              <div className="border-b pb-4">
                <h3 className="text-xl font-bold text-foreground">Liveness Selfie Verification</h3>
                <p className="text-xs text-muted-foreground mt-1">Verify that you are physically present to complete your identity setup.</p>
              </div>

              {effectiveLivenessVerificationStatus === 'approved' ? (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="font-bold">Liveness Selfie Verified ✓</p>
                    <p className="mt-0.5 font-medium text-green-600/90 leading-relaxed">
                      Your liveness selfie has been successfully verified by TradieHubAU admins.
                    </p>
                  </div>
                </div>
              ) : effectiveLivenessVerificationStatus === 'pending' ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold flex items-start gap-2">
                  <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Selfie Review Pending</p>
                    <p className="mt-1 font-medium text-amber-600/90 leading-relaxed">
                      Your liveness selfie is currently under manual review by our administration staff.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLivenessUpload} className="space-y-4">
                  {effectiveLivenessVerificationStatus === 'recheck' && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Selfie Recheck Requested</p>
                        <p className="mt-1 font-medium text-amber-700/90 leading-relaxed">
                          An administrator has requested a recheck of your selfie. Reason: <strong className="text-foreground">{livenessVerificationRecheckReason}</strong>. Please upload a new selfie.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveLivenessVerificationStatus === 'expired' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Selfie Expired</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your submitted liveness selfie check has expired. Please upload a new selfie.
                        </p>
                      </div>
                    </div>
                  )}

                  {effectiveLivenessVerificationStatus === 'rejected' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Selfie Verification Rejected</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your selfie was rejected: <strong className="text-foreground">{livenessVerificationNotes}</strong>.
                          Please upload a new selfie matching the challenge description.
                        </p>
                      </div>
                    </div>
                  )}

                  {livenessUploadSuccess && (
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold">
                      Your selfie has been submitted for review.
                    </div>
                  )}

                  {livenessUploadError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                      {livenessUploadError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Required Proof</h4>
                    <div className="rounded-2xl border bg-muted/10 p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div>
                          <h5 className="text-sm font-black text-foreground">Liveness Selfie</h5>
                          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                            Upload a clear selfie holding up 4 fingers next to your face.
                          </p>
                          <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                            This helps us confirm the person submitting the ID is physically present. It is used only for verification and is not shown publicly.
                          </p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${getStatusClass(effectiveLivenessVerificationStatus)}`}>
                          {getStatusLabel(effectiveLivenessVerificationStatus)}
                        </span>
                      </div>

                      {livenessFile && (
                        <p className="text-xs font-bold text-muted-foreground">{livenessFile?.name}</p>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className="inline-flex flex-1 items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                          <Camera className="h-4 w-4" /> Take / Choose Photo
                          <input
                            type="file"
                            onChange={(e) => {
                              setLivenessFile(e.target.files?.[0] || null);
                            }}
                            disabled={livenessUploading}
                            className="hidden"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                          />
                        </label>

                        <button
                          type="submit"
                          disabled={livenessUploading || !livenessFile}
                          className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                        >
                          {livenessUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Submit Selfie
                        </button>
                      </div>

                      <p className="text-[10px] text-muted-foreground italic mt-2 leading-relaxed">
                        By uploading this selfie, you agree that TradieHubAU may use it only for identity verification, fraud prevention, dispute support, and account safety. It is not shown publicly.
                      </p>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Tradie Application Section (Only for customers) */}
            {targetProfile?.role === 'customer' && (
              <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
                <div className="border-b pb-4">
                  <h3 className="text-xl font-bold text-foreground">Apply for Tradie Approval</h3>
                  <p className="text-xs text-muted-foreground mt-1">Submit contractor licences, ABN, and insurance to get whitelisted as an approved tradie on TradieHubAU.</p>
                </div>

                {tradieVerificationStatus === 'pending' && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-semibold flex items-start gap-2">
                    <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Tradie Approval Request Pending Review</p>
                      <p className="mt-1 font-medium text-amber-600/90 leading-relaxed">
                        Your professional credentials (ABN: {abn || 'Pending'}, Licence: {licenseNumber || 'Pending'}) are under manual review.
                        An administrator will whitelist your profile once both an approved contractor license and an approved insurance certificate are submitted and validated.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleApplyAsTradie} className="space-y-5">
                  {tradieVerificationStatus === 'rejected' && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Tradie Application Rejected</p>
                        <p className="mt-1 font-medium text-red-500/90 leading-relaxed">
                          Your previous professional credentials were rejected: <strong className="text-foreground">{tradieVerificationNotes}</strong>.
                          Please check ABN, licence, and upload a valid contractor license or insurance certificate to re-apply.
                        </p>
                      </div>
                    </div>
                  )}

                  {uploadSuccess && (
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold">
                      Your credentials have been submitted for review!
                    </div>
                  )}

                  {uploadError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                      {uploadError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">ABN</label>
                      <input
                        type="text"
                        value={abn}
                        onChange={(e) => setAbn(e.target.value)}
                        placeholder="11-digit ABN number"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all disabled:opacity-60"
                        required
                        disabled={tradieVerificationStatus === 'pending'}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade License Number</label>
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="Licence certificate ID"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold transition-all disabled:opacity-60"
                        required
                        disabled={tradieVerificationStatus === 'pending'}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Trades Offered</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {categoryOptions.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-xl hover:bg-muted/10 transition-colors">
                          <input
                            type="checkbox"
                            checked={trades.includes(cat.id)}
                            onChange={() => setTrades(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                            className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
                            disabled={tradieVerificationStatus === 'pending'}
                          />
                          <span className="text-xs font-bold text-muted-foreground">{cat.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 border-t pt-5">
                    <div>
                      <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">Required Documents</h5>
                      <p className="text-xs text-muted-foreground font-semibold leading-relaxed mt-1">
                        Contractor licence and insurance must both be approved before an admin can whitelist your tradie profile.
                      </p>
                    </div>

                    <div className="grid gap-3">
                      {TRADIE_DOCUMENT_CARDS.map((doc) => {
                        const status = getDocumentStatus(doc.type);
                        const selectedFile = tradieFiles[doc.type];
                        return (
                          <div key={doc.type} className="rounded-2xl border bg-muted/10 p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                              <div>
                                <h6 className="text-sm font-black text-foreground">{doc.title}</h6>
                                <p className="text-xs text-muted-foreground font-semibold mt-0.5">{doc.helper}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${getStatusClass(status)}`}>
                                {getStatusLabel(status, doc.required)}
                              </span>
                            </div>

                            {selectedFile && (
                              <p className="text-xs font-bold text-muted-foreground">{selectedFile.name}</p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2">
                              <label className="inline-flex flex-1 items-center justify-center gap-2 bg-secondary text-secondary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-secondary/80 transition-all text-xs cursor-pointer select-none">
                                <Upload className="h-4 w-4" /> Choose File
                                <input
                                  type="file"
                                  onChange={(e) => setTradieCardFile(doc.type, e.target.files?.[0] || null)}
                                  disabled={uploadingDoc}
                                  className="hidden"
                                  accept="image/*,application/pdf"
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => void handleApplyAsTradie(undefined, doc.type, selectedFile || null)}
                                disabled={uploadingDoc || !selectedFile}
                                className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs disabled:opacity-50"
                              >
                                {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Submit Document
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </form>
              </div>
            )}

            {targetProfile?.role !== 'customer' && tradieCredentialPanel}
            </>
            )}

            {targetProfile.role !== 'customer' && activeProfileTab === 'completed-work' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>
                      <span className="text-xs font-bold text-muted-foreground uppercase">Published:</span>
                      <span className="text-lg font-black text-foreground">{publishedCompletionProofCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
                      <span className="text-xs font-bold text-muted-foreground uppercase">Hidden:</span>
                      <span className="text-lg font-black text-foreground">{hiddenCompletionProofCount}</span>
                    </div>
                  </div>
                  <Link
                    to={`/tradies/${targetProfile.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:bg-primary/95 shadow-sm transition-all"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview Public Profile
                  </Link>
                </div>

                <div className="rounded-2xl border bg-muted/10 p-4 text-xs font-semibold leading-relaxed text-muted-foreground">
                  Only completed TradieHubAU jobs with approved completion proof can appear publicly. Customer names, contact details, private addresses, payment details, and private job notes are never shown on the public profile.
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'all', label: 'All', count: completionProofItems.length },
                    { id: 'published', label: 'Published', count: publishedCompletionProofCount },
                    { id: 'hidden', label: 'Hidden', count: hiddenCompletionProofCount },
                  ] as Array<{ id: CompletedWorkFilter; label: string; count: number }>).map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setCompletedWorkFilter(filter.id)}
                      className={`rounded-xl border px-4 py-2 text-xs font-black transition-colors ${
                        completedWorkFilter === filter.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {filter.label} ({filter.count})
                    </button>
                  ))}
                </div>

                {completionProofError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                    {completionProofError}
                  </div>
                )}

                {completionProofLoading ? (
                  <div className="flex justify-center rounded-3xl border bg-card p-8">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : completionProofItems.length === 0 ? (
                  <div className="rounded-3xl border bg-card p-6 text-sm font-semibold text-muted-foreground">
                    Completed jobs will appear here after a customer accepts your completion proof and payment is released.
                  </div>
                ) : filteredCompletionProofItems.length === 0 ? (
                  <div className="rounded-3xl border bg-card p-6 text-sm font-semibold text-muted-foreground">
                    No completed work matches this filter.
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {filteredCompletionProofItems.map(item => {
                      const draft = completionProofDrafts[item.id] || {
                        isPublic: item.is_public_portfolio,
                        title: item.portfolio_title || '',
                        caption: item.portfolio_caption || '',
                        trade: item.portfolio_trade_category || '',
                      };
                      const savingThisProof = completionProofSavingId === item.id;
                      const isExpanded = expandedCompletionProofId === item.id;
                      const title = draft.title || item.portfolio_title || item.job_title || 'Completed TradieHubAU job';
                      const categoryId = draft.trade || item.portfolio_trade_category || item.job_categories?.[0] || '';
                      const categoryLabel = categoryOptions.find(cat => cat.id === categoryId)?.label || categoryId || 'Trade not set';
                      const dateLabel = item.completed_at || item.created_at
                        ? new Date(item.completed_at || item.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                        : 'Date unavailable';
                      const thumbUrl = (item.image_urls || [])[0];

                      return (
                        <div key={item.id} className="rounded-3xl border bg-card p-4 shadow-sm">
                          <div className="flex gap-4">
                            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border bg-muted">
                              {thumbUrl ? (
                                <img src={thumbUrl} alt="Eligible completed work proof" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <ImagePlus className="h-6 w-6" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="line-clamp-2 text-sm font-black text-foreground">{title}</h4>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                                  draft.isPublic
                                    ? 'border-green-500/20 bg-green-500/10 text-green-600'
                                    : 'border-border bg-muted text-muted-foreground'
                                }`}>
                                  {draft.isPublic ? 'Published' : 'Hidden'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {dateLabel}
                                </span>
                                <span>{categoryLabel}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={savingThisProof}
                                  onClick={() => void handleSaveCompletionProofPublication(item.id, { isPublic: !draft.isPublic })}
                                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
                                    draft.isPublic
                                      ? 'border-border bg-muted text-muted-foreground hover:text-foreground'
                                      : 'border-green-500/20 bg-green-500/10 text-green-600 hover:bg-green-500/15'
                                  } disabled:opacity-50`}
                                >
                                  {savingThisProof && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  )}
                                  {draft.isPublic ? 'Hide' : 'Publish'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedCompletionProofId(isExpanded ? null : item.id)}
                                  className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground hover:bg-muted/40"
                                >
                                  {isExpanded ? 'Close details' : 'Edit details'}
                                </button>
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-4 border-t pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Public Title Override</label>
                                  <input
                                    type="text"
                                    value={draft.title}
                                    onChange={(e) => updateCompletionProofDraft(item.id, { title: e.target.value })}
                                    maxLength={120}
                                    placeholder="Completed kitchen tiling"
                                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade / Category</label>
                                  <select
                                    value={draft.trade}
                                    onChange={(e) => updateCompletionProofDraft(item.id, { trade: e.target.value })}
                                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                                  >
                                    <option value="">Select...</option>
                                    {categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-bold text-foreground uppercase tracking-wider">Public Caption</label>
                                <textarea
                                  rows={3}
                                  value={draft.caption}
                                  onChange={(e) => updateCompletionProofDraft(item.id, { caption: e.target.value })}
                                  maxLength={280}
                                  placeholder="Keep this public-facing. Do not include customer names, addresses, contact details, or private job notes."
                                  className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold resize-none"
                                />
                              </div>

                              <button
                                type="button"
                                disabled={savingThisProof}
                                onClick={() => void handleSaveCompletionProofPublication(item.id)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground hover:bg-primary/95 disabled:opacity-50 sm:w-auto"
                              >
                                {savingThisProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                Save Gallery Settings
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          ) : (
            /* Public View (Others) */
            <div className="space-y-8">
              {/* Trades & ABN Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(targetProfile.role === 'tradie' || targetProfile.role === 'dual') && (
                  <div className="bg-card border p-6 rounded-3xl space-y-3 shadow-sm">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expertise / Trades</h4>
                    <div className="flex flex-wrap gap-2">
                      {targetProfile.trades && targetProfile.trades.length > 0 ? (
                        targetProfile.trades.map(tid => {
                          const label = categoryOptions.find(o => o.id === tid)?.label || tid;
                          return (
                            <span key={tid} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {label}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-sm text-muted-foreground font-medium">General Contractor</span>
                      )}
                    </div>
                  </div>
                )}
                
                {targetProfile.role !== 'customer' && (
                  <div className="bg-card border p-6 rounded-3xl space-y-3 shadow-sm text-sm">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Credentials</h4>
                    <div className="space-y-1.5 font-bold text-foreground">
                      <div className="flex justify-between border-b pb-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">ABN</span>
                        <span>{targetProfile.abn || 'Not Provided'}</span>
                      </div>
                      <div className="flex justify-between pt-0.5">
                        <span className="text-xs font-semibold text-muted-foreground">License ID</span>
                        <span>{targetProfile.license_number || 'Not Provided'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Jobs Section */}
              <div className="bg-card border p-6 rounded-3xl space-y-4 shadow-sm">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" /> Active Jobs
                </h3>
                {jobsLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : activeJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">No active jobs listed.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {activeJobs.map(job => (
                      <div key={job.id} className="border p-4 rounded-2xl flex items-center justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-sm text-foreground">{job.title}</h4>
                          <span className="text-xs text-muted-foreground font-semibold flex items-center mt-1">
                            <MapPin className="h-3.5 w-3.5 mr-1" /> {formatJobLocation(job.suburb, job.state) || job.location}
                          </span>
                        </div>
                        <span className="bg-amber-500/10 text-amber-500 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
                          In Progress
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Jobs Section */}
              <div className="bg-card border p-6 rounded-3xl space-y-4 shadow-sm">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" /> Past Jobs
                </h3>
                {jobsLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : pastJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">No past jobs listed.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {pastJobs.map(job => (
                      <div key={job.id} className="border p-4 rounded-2xl flex items-center justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-sm text-foreground">{job.title}</h4>
                          <span className="text-xs text-muted-foreground font-semibold flex items-center mt-1">
                            <MapPin className="h-3.5 w-3.5 mr-1" /> {formatJobLocation(job.suburb, job.state) || job.location}
                          </span>
                        </div>
                        <span className="bg-green-500/10 text-green-600 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
                          Completed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reviews Section */}
              <div className="bg-card border p-6 rounded-3xl space-y-4 shadow-sm">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" /> Reviews
                </h3>
                {reviewsLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">Reviews from completed TradieHubAU jobs will appear here.</p>
                ) : (
                  <div className="divide-y space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="pt-4 first:pt-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs">
                              {review.reviewer?.avatar_url ? (
                                <img src={review.reviewer.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                              ) : (
                                review.reviewer?.display_name?.charAt(0).toUpperCase() || 'U'
                              )}
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-foreground">{review.reviewer?.display_name || 'Anonymous client'}</h5>
                              <span className="text-[10px] text-muted-foreground font-semibold">{new Date(review.submitted_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-bold">
                            <Star className="h-3 w-3 fill-amber-500 stroke-amber-500" />
                            <span>{review.rating}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground font-semibold leading-relaxed whitespace-pre-line italic">
                          "{review.text}"
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
