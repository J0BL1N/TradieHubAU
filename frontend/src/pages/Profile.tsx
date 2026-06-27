import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import {
  getUserProfile,
  getPublicUserProfile,
  getPublicProfilesByIds,
  updateUserProfile,
  submitVerification
} from '../lib/users';
import type { UserProfile } from '../lib/users';
import { toggleSavedItem, isItemSaved } from '../lib/saved';
import {
  createPortfolioItem,
  deletePortfolioItem,
  fetchEligibleCompletionProofPortfolioItems,
  fetchPortfolioItems,
  updateCompletionProofPortfolioItem,
  updatePortfolioItem,
  uploadAvatar,
  uploadPortfolioImages,
  validateTrustImage,
} from '../lib/profileTrust';
import type { CompletionProofPortfolioItem, PortfolioItem } from '../lib/profileTrust';
import {
  ShieldCheck, Mail, Phone, MapPin, Lock, Save,
  Upload, Loader2, Award, Star, Briefcase, Clock,
  Bookmark, BookmarkCheck, AlertCircle, CheckCircle, Send,
  ImagePlus, Trash2, Pencil, Eye, Globe
} from 'lucide-react';

interface DisplayJob {
  id: string;
  title: string;
  location: string;
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

export default function Profile() {
  const { id } = useParams<{ id?: string }>();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isSelf = !id || id === user?.id;
  const targetId = isSelf ? user?.id : id;

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
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

  // Portfolio edit state
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioSaving, setPortfolioSaving] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [portfolioTitle, setPortfolioTitle] = useState('');
  const [portfolioTrade, setPortfolioTrade] = useState('');
  const [portfolioSuburb, setPortfolioSuburb] = useState('');
  const [portfolioDescription, setPortfolioDescription] = useState('');
  const [portfolioMonth, setPortfolioMonth] = useState('');
  const [portfolioPublic, setPortfolioPublic] = useState(true);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
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
  const [idVerificationStatus, setIdVerificationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [idVerificationNotes, setIdVerificationNotes] = useState<string | null>(null);

  // Tradie check state
  const [tradieDocType, setTradieDocType] = useState('contractor_license');
  const [tradieFile, setTradieFile] = useState<File | null>(null);
  const [tradieVerificationStatus, setTradieVerificationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
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

  const loadPortfolioItems = useCallback(async () => {
    if (!targetId || !isSelf || !targetProfile || targetProfile.role === 'customer') return;
    setPortfolioLoading(true);
    const { data, error: portfolioErr } = await fetchPortfolioItems(targetId, true);
    if (portfolioErr) {
      setPortfolioError(portfolioErr.message || 'Failed to load previous work.');
    } else {
      setPortfolioItems(data);
    }
    setPortfolioLoading(false);
  }, [targetId, isSelf, targetProfile]);

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

      // 1. Fetch Reviews
      const { data: reviewsData, error: reviewsErr } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          text,
          submitted_at,
          reviewer_id
        `)
        .eq('reviewee_id', targetId)
        .eq('unlocked', true)
        .order('submitted_at', { ascending: false });

      if (!reviewsErr && reviewsData) {
        const { data: reviewerProfiles, error: reviewerProfilesErr } = await getPublicProfilesByIds(
          reviewsData.map(review => review.reviewer_id)
        );
        const reviewersById = new Map(reviewerProfiles.map(profile => [profile.id, profile]));

        if (reviewerProfilesErr) {
          console.error('Error fetching reviewer public profiles:', reviewerProfilesErr);
        }

        setReviews(reviewsData.map(({ reviewer_id, ...review }) => {
          const reviewer = reviewersById.get(reviewer_id);
          return {
            ...review,
            reviewer: reviewer ? {
              display_name: reviewer.display_name,
              avatar_url: reviewer.avatar_url,
            } : null,
          };
        }));
      }

      // 2. Fetch Jobs
      if (isCustomer) {
        // Customer active and past posted jobs
        const { data: customerJobs, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, title, location, status, categories')
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
            job:jobs(id, title, location, status, categories)
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
      // Query latest identity verification status
      const { data: idData, error: idErr } = await supabase
        .from('verifications')
        .select('status, admin_notes')
        .eq('user_id', targetId)
        .in('document_type', ['drivers_license', 'passport', 'proof_of_age', 'other_identity'])
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (!idErr && idData && idData.length > 0) {
        setIdVerificationStatus(idData[0].status as any);
        setIdVerificationNotes(idData[0].admin_notes);
      } else {
        setIdVerificationStatus('none');
        setIdVerificationNotes(null);
      }

      // Query latest tradie credential verification status
      const { data: trData, error: trErr } = await supabase
        .from('verifications')
        .select('status, admin_notes')
        .eq('user_id', targetId)
        .in('document_type', ['contractor_license', 'insurance', 'trade_certificate', 'other_trade_credential'])
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (!trErr && trData && trData.length > 0) {
        setTradieVerificationStatus(trData[0].status as any);
        setTradieVerificationNotes(trData[0].admin_notes);
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
      loadPortfolioItems();
      loadCompletionProofPortfolioItems();
    }
  }, [targetProfile, loadJobsAndReviews, loadPortfolioItems, loadCompletionProofPortfolioItems]);

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

      await refreshProfile();
      await loadProfile();
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setAvatarError(err.message || 'Failed to upload profile image.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const resetPortfolioForm = () => {
    setEditingPortfolioId(null);
    setPortfolioTitle('');
    setPortfolioTrade('');
    setPortfolioSuburb('');
    setPortfolioDescription('');
    setPortfolioMonth('');
    setPortfolioPublic(true);
    setPortfolioFiles([]);
  };

  const startEditPortfolio = (item: PortfolioItem) => {
    setEditingPortfolioId(item.id);
    setPortfolioTitle(item.title);
    setPortfolioTrade(item.trade_category || '');
    setPortfolioSuburb(item.suburb || '');
    setPortfolioDescription(item.description || '');
    setPortfolioMonth(item.completion_month ? item.completion_month.slice(0, 7) : '');
    setPortfolioPublic(item.is_public);
    setPortfolioFiles([]);
  };

  const handleSavePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !targetProfile || targetProfile.role === 'customer') return;
    if (!portfolioTitle.trim()) {
      setPortfolioError('Previous work title is required.');
      return;
    }

    setPortfolioSaving(true);
    setPortfolioError(null);

    try {
      const existingItem = editingPortfolioId
        ? portfolioItems.find(item => item.id === editingPortfolioId)
        : null;
      let imagePaths = existingItem?.image_paths || [];

      if (portfolioFiles.length > 0) {
        const { data: uploadedPaths, error: uploadErr } = await uploadPortfolioImages(user.id, portfolioFiles.slice(0, 6));
        if (uploadErr) throw uploadErr;
        imagePaths = [...imagePaths, ...uploadedPaths].slice(0, 8);
      }

      const payload = {
        title: portfolioTitle.trim(),
        trade_category: portfolioTrade || null,
        suburb: portfolioSuburb.trim() || null,
        description: portfolioDescription.trim() || null,
        completion_month: portfolioMonth ? `${portfolioMonth}-01` : null,
        image_paths: imagePaths,
        is_public: portfolioPublic,
      };

      const { error: saveErr } = editingPortfolioId
        ? await updatePortfolioItem(editingPortfolioId, payload)
        : await createPortfolioItem(user.id, payload);

      if (saveErr) throw saveErr;

      resetPortfolioForm();
      await loadPortfolioItems();
    } catch (err: any) {
      console.error('Portfolio save error:', err);
      setPortfolioError(err.message || 'Failed to save previous work.');
    } finally {
      setPortfolioSaving(false);
    }
  };

  const handleDeletePortfolio = async (itemId: string) => {
    if (!window.confirm('Delete this previous work entry?')) return;
    setPortfolioError(null);
    const { error: deleteErr } = await deletePortfolioItem(itemId);
    if (deleteErr) {
      setPortfolioError(deleteErr.message || 'Failed to delete previous work.');
      return;
    }
    await loadPortfolioItems();
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

  const handleSaveCompletionProofPublication = async (proofId: string) => {
    const draft = completionProofDrafts[proofId];
    if (!draft) return;
    setCompletionProofSavingId(proofId);
    setCompletionProofError(null);

    try {
      const { error: saveErr } = await updateCompletionProofPortfolioItem(proofId, {
        is_public_portfolio: draft.isPublic,
        portfolio_title: draft.title.trim() || null,
        portfolio_caption: draft.caption.trim() || null,
        portfolio_trade_category: draft.trade || null,
      });
      if (saveErr) throw saveErr;
      await loadCompletionProofPortfolioItems();
    } catch (err: any) {
      console.error('Completion proof publication save error:', err);
      setCompletionProofError(err.message || 'Failed to update completed work gallery settings.');
    } finally {
      setCompletionProofSavingId(null);
    }
  };

  const handleIdentityUpload = async (e: React.FormEvent) => {
    e.preventDefault();
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
        document_type: idDocType,
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

  const handleApplyAsTradie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!tradieFile) {
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
      const fileExt = tradieFile.name.split('.').pop();
      const filePath = `users/${user.id}/${Date.now()}_tradie.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('verifications')
        .upload(filePath, tradieFile);
      if (uploadErr) throw uploadErr;

      // 3. Submit verification request record
      const { error: dbErr } = await submitVerification({
        user_id: user.id,
        document_type: tradieDocType,
        document_url: filePath
      });
      if (dbErr) throw dbErr;

      setUploadSuccess(true);
      setTradieFile(null);
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
  const isVerified = targetProfile.role === 'customer' 
    ? targetProfile.identity_verified 
    : targetProfile.tradie_verified;

  // Average review calculation
  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1) : null;

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
              <form onSubmit={handleSaveProfile} className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-xl font-bold text-foreground">Personal Profile Settings</h3>
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

              {/* Tradie specific section */}
              {targetProfile.role !== 'customer' && (
                <div className="space-y-6 border-t pt-5">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Tradie Settings</h4>
                  
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
                  {targetProfile.tradie_verified ? (
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

                      <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 border p-4 rounded-2xl">
                        <div className="w-full sm:w-auto">
                          <select
                            value={tradieDocType}
                            onChange={(e) => setTradieDocType(e.target.value)}
                            className="bg-background border rounded-xl px-3 py-2 outline-none focus:border-primary/50 text-xs font-bold cursor-pointer text-muted-foreground"
                          >
                            <option value="contractor_license">Contractor License</option>
                            <option value="insurance">Insurance Certificate</option>
                            <option value="trade_certificate">Trade Certificate</option>
                            <option value="other_trade_credential">Other Trade Credential</option>
                          </select>
                        </div>

                        <label className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs cursor-pointer select-none">
                          {uploadingDoc ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                          ) : (
                            <><Upload className="h-4 w-4" /> Choose Credential Document</>
                          )}
                          <input
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file && user) {
                                setUploadingDoc(true);
                                const fileExt = file.name.split('.').pop();
                                const filePath = `users/${user.id}/${Date.now()}_tradie.${fileExt}`;
                                supabase.storage.from('verifications').upload(filePath, file).then(({ error: upErr }) => {
                                  if (upErr) throw upErr;
                                  return submitVerification({
                                    user_id: user.id,
                                    document_type: tradieDocType,
                                    document_url: filePath
                                  });
                                }).then(({ error: dbErr }) => {
                                  if (dbErr) throw dbErr;
                                  setUploadSuccess(true);
                                  loadVerificationStatus();
                                }).catch(err => {
                                  setUploadError(err.message || 'Failed to upload document.');
                                }).finally(() => {
                                  setUploadingDoc(false);
                                });
                              }
                            }}
                            disabled={uploadingDoc}
                            className="hidden"
                            accept="image/*,application/pdf"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Identity Verification Section (Shown to all users) */}
            <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
              <div className="border-b pb-4">
                <h3 className="text-xl font-bold text-foreground">Identity Verification</h3>
                <p className="text-xs text-muted-foreground mt-1">Verify your basic photo ID to build trust across TradieHubAU.</p>
              </div>

              {targetProfile.identity_verified ? (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="font-bold">Identity Verified ✓</p>
                    <p className="mt-0.5 font-medium text-green-600/90 leading-relaxed">
                      Your identity documents have been checked and approved by TradieHubAU admins.
                    </p>
                  </div>
                </div>
              ) : idVerificationStatus === 'pending' ? (
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
                  {idVerificationStatus === 'rejected' && (
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

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 border p-4 rounded-2xl">
                    <div className="w-full sm:w-auto">
                      <select
                        value={idDocType}
                        onChange={(e) => setIdDocType(e.target.value)}
                        className="bg-background border rounded-xl px-3 py-2 outline-none focus:border-primary/50 text-xs font-bold cursor-pointer text-muted-foreground"
                      >
                        <option value="drivers_license">Driver's License</option>
                        <option value="passport">Passport</option>
                        <option value="proof_of_age">Proof of Age Card</option>
                        <option value="other_identity">Other Photo ID</option>
                      </select>
                    </div>

                    <label className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs cursor-pointer select-none">
                      {uploadingDoc ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                      ) : idFile ? (
                        <><CheckCircle className="h-4 w-4 text-green-400" /> {idFile.name} selected</>
                      ) : (
                        <><Upload className="h-4 w-4" /> Choose ID Document File</>
                      )}
                      <input
                        type="file"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setIdFile(e.target.files[0]);
                          }
                        }}
                        disabled={uploadingDoc}
                        className="hidden"
                        accept="image/*,application/pdf"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={uploadingDoc || !idFile}
                      className="bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Submit ID
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Tradie Application Section (Only for customers) */}
            {targetProfile.role === 'customer' && (
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
                    <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">Supporting Credential Document</h5>
                    <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
                      Please upload a clear copy of your contractor license and public liability insurance certificate.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 border p-4 rounded-2xl">
                      <div className="w-full sm:w-auto">
                        <select
                          value={tradieDocType}
                          onChange={(e) => setTradieDocType(e.target.value)}
                          className="bg-background border rounded-xl px-3 py-2 outline-none focus:border-primary/50 text-xs font-bold cursor-pointer text-muted-foreground"
                        >
                          <option value="contractor_license">Contractor License</option>
                          <option value="insurance">Insurance Certificate</option>
                          <option value="trade_certificate">Trade Certificate</option>
                          <option value="other_trade_credential">Other Trade Credential</option>
                        </select>
                      </div>

                      <label className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-sm text-xs cursor-pointer select-none">
                        {uploadingDoc ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                        ) : tradieFile ? (
                          <><CheckCircle className="h-4 w-4 text-green-400" /> {tradieFile.name} selected</>
                        ) : (
                          <><Upload className="h-4 w-4" /> Choose Credential Document</>
                        )}
                        <input
                          type="file"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setTradieFile(e.target.files[0]);
                            }
                          }}
                          disabled={uploadingDoc}
                          className="hidden"
                          accept="image/*,application/pdf"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={uploadingDoc || !tradieFile}
                        className="bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-md text-xs disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Submit Document
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {targetProfile.role !== 'customer' && (
              <div className="bg-card border p-8 rounded-3xl space-y-6 shadow-sm">
                <div className="border-b pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Previous Work</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add real portfolio examples for your public tradie profile. Do not upload private customer documents.
                    </p>
                  </div>
                  <Link
                    to={`/tradies/${targetProfile.id}`}
                    className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview public profile
                  </Link>
                </div>

                {portfolioError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                    {portfolioError}
                  </div>
                )}

                <form onSubmit={handleSavePortfolio} className="space-y-5 rounded-2xl border bg-muted/10 p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Title</label>
                      <input
                        type="text"
                        value={portfolioTitle}
                        onChange={(e) => setPortfolioTitle(e.target.value)}
                        placeholder="Bathroom renovation"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Trade / Category</label>
                      <select
                        value={portfolioTrade}
                        onChange={(e) => setPortfolioTrade(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                      >
                        <option value="">Select...</option>
                        {categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Suburb / General Location</label>
                      <input
                        type="text"
                        value={portfolioSuburb}
                        onChange={(e) => setPortfolioSuburb(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Completion Month</label>
                      <input
                        type="month"
                        value={portfolioMonth}
                        onChange={(e) => setPortfolioMonth(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 outline-none focus:border-primary/50 text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider">Short Description</label>
                    <textarea
                      rows={3}
                      value={portfolioDescription}
                      onChange={(e) => setPortfolioDescription(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                    <label className="inline-flex items-center justify-center gap-2 bg-background border border-border text-foreground font-bold px-4 py-2.5 rounded-xl hover:bg-muted/40 text-xs cursor-pointer">
                      <ImagePlus className="h-4 w-4 text-primary" />
                      Add Images
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(e) => setPortfolioFiles(Array.from(e.target.files || []).slice(0, 6))}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={portfolioPublic}
                        onChange={(e) => setPortfolioPublic(e.target.checked)}
                        className="rounded border-border text-primary"
                      />
                      Show on public profile
                    </label>
                  </div>

                  {portfolioFiles.length > 0 && (
                    <p className="text-xs font-semibold text-muted-foreground">
                      {portfolioFiles.length} image{portfolioFiles.length === 1 ? '' : 's'} selected.
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="submit"
                      disabled={portfolioSaving}
                      className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 disabled:opacity-50"
                    >
                      {portfolioSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editingPortfolioId ? 'Update Previous Work' : 'Add Previous Work'}
                    </button>
                    {editingPortfolioId && (
                      <button
                        type="button"
                        onClick={resetPortfolioForm}
                        className="inline-flex items-center justify-center border border-border text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-muted/40"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>

                {portfolioLoading ? (
                  <div className="flex justify-center p-6">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : portfolioItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">No previous work added yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {portfolioItems.map(item => (
                      <div key={item.id} className="border rounded-2xl overflow-hidden bg-background">
                        {item.image_urls && item.image_urls.length > 0 && (
                          <img src={item.image_urls[0]} alt={item.title} className="h-36 w-full object-cover" />
                        )}
                        <div className="p-4 space-y-3">
                          <div>
                            <h4 className="font-bold text-foreground">{item.title}</h4>
                            <p className="text-xs text-muted-foreground font-semibold">
                              {[item.suburb, item.trade_category && (categoryOptions.find(cat => cat.id === item.trade_category)?.label || item.trade_category)].filter(Boolean).join(' - ')}
                            </p>
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground leading-5 font-medium">{item.description}</p>}
                          <div className="flex items-center justify-between gap-2 pt-2">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${item.is_public ? 'text-primary' : 'text-muted-foreground'}`}>
                              {item.is_public ? 'Public' : 'Private draft'}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEditPortfolio(item)}
                                className="p-2 rounded-lg border hover:bg-muted/40"
                                title="Edit previous work"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeletePortfolio(item.id)}
                                className="p-2 rounded-lg border text-red-500 hover:bg-red-500/5"
                                title="Delete previous work"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-6 space-y-4">
                  <div>
                    <h4 className="text-base font-bold text-foreground">Completed Work Proofs</h4>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      Publish approved completion proof photos only when they are safe for your public gallery.
                    </p>
                  </div>

                  {completionProofError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                      {completionProofError}
                    </div>
                  )}

                  {completionProofLoading ? (
                    <div className="flex justify-center p-6">
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    </div>
                  ) : completionProofItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-medium">
                      No eligible completed work proof images yet. Photos appear here after a job is completed and payment is released.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {completionProofItems.map(item => {
                        const draft = completionProofDrafts[item.id] || {
                          isPublic: item.is_public_portfolio,
                          title: item.portfolio_title || '',
                          caption: item.portfolio_caption || '',
                          trade: item.portfolio_trade_category || '',
                        };
                        const savingThisProof = completionProofSavingId === item.id;

                        return (
                          <div key={item.id} className="border rounded-2xl bg-background p-4 space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {(item.image_urls || []).slice(0, 4).map((url, index) => (
                                <img
                                  key={url}
                                  src={url}
                                  alt={index === 0 ? 'Eligible completed work proof' : ''}
                                  className="aspect-square rounded-xl object-cover border"
                                />
                              ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-foreground uppercase tracking-wider">Public Title</label>
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
                                rows={2}
                                value={draft.caption}
                                onChange={(e) => updateCompletionProofDraft(item.id, { caption: e.target.value })}
                                maxLength={280}
                                placeholder="Keep this public-facing. Do not include customer names, addresses, contact details, or private job notes."
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-semibold resize-none"
                              />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                              <label className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={draft.isPublic}
                                  onChange={(e) => updateCompletionProofDraft(item.id, { isPublic: e.target.checked })}
                                  className="rounded border-border text-primary"
                                />
                                Show these proof photos on my public profile
                              </label>
                              <button
                                type="button"
                                disabled={savingThisProof}
                                onClick={() => void handleSaveCompletionProofPublication(item.id)}
                                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/95 disabled:opacity-50"
                              >
                                {savingThisProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                Save Gallery Settings
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                            <MapPin className="h-3.5 w-3.5 mr-1" /> {job.location}
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
                            <MapPin className="h-3.5 w-3.5 mr-1" /> {job.location}
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
                  <p className="text-sm text-muted-foreground font-medium">No client reviews submitted yet.</p>
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
