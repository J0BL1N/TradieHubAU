import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, Briefcase, Calendar, ExternalLink, Loader2, MapPin, ShieldCheck, Star } from 'lucide-react';
import { getPublicUserProfile } from '../lib/users';
import type { UserProfile } from '../lib/users';
import { fetchPublicProofGallery } from '../lib/profileTrust';
import type { PublicProofImage } from '../lib/profileTrust';
import { fetchPublicTradieReviews } from '../lib/reviews';
import type { PublicTradieReview } from '../lib/reviews';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import { maskName } from '../lib/masking';

const tradeLabels: Record<string, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  carpentry: 'Carpentry',
  painting: 'Painting',
  tiling: 'Tiling',
  building: 'Building',
  gardening: 'Gardening',
  cleaning: 'Cleaning',
  handyman: 'Handyman',
  other: 'Other',
};

function formatMonth(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function PublicTradieProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, profile: viewerProfile } = useAuth();
  const [hasFundedContract, setHasFundedContract] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [proofGallery, setProofGallery] = useState<PublicProofImage[]>([]);
  const [reviews, setReviews] = useState<PublicTradieReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: profileData, error: profileError } = await getPublicUserProfile(userId);
      if (profileError) throw profileError;
      if (!profileData || !['tradie', 'dual'].includes(profileData.role)) {
        setProfile(null);
        return;
      }

      setProfile(profileData);

      let relationshipActive = false;
      if (user && user.id !== userId) {
        const { data: relJobs, error: relErr } = await supabase
          .from('jobs')
          .select('id, status')
          .eq('customer_id', user.id)
          .in('status', ['payment_held', 'completed_pending_review', 'disputed', 'completed']);

        if (!relErr && relJobs && relJobs.length > 0) {
          const jobIds = relJobs.map(j => j.id);
          const { data: relApps, error: appErr } = await supabase
            .from('applications')
            .select('id')
            .eq('tradie_id', userId)
            .eq('status', 'accepted')
            .in('job_id', jobIds);

          if (!appErr && relApps && relApps.length > 0) {
            relationshipActive = true;
          }
        }
      }
      setHasFundedContract(relationshipActive);

      const [
        proofResult,
        reviewsResult,
      ] = await Promise.all([
        fetchPublicProofGallery(userId),
        fetchPublicTradieReviews(userId),
      ]);

      if (proofResult.error) throw proofResult.error;
      if (reviewsResult.error) throw reviewsResult.error;

      setProofGallery(proofResult.data);
      setReviews(reviewsResult.data);
    } catch (err: any) {
      console.error('Public tradie profile load error:', err.message);
      setError(err.message || 'Public tradie profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [userId, user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl max-w-md mx-auto my-12 gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-semibold text-muted-foreground">Loading public profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-card border rounded-3xl text-center space-y-4">
        <h1 className="text-2xl font-black">Profile unavailable</h1>
        <p className="text-sm font-semibold text-muted-foreground">
          {error || 'This tradie profile is not available publicly.'}
        </p>
        <Link to="/browse-tradies" className="inline-flex bg-primary text-primary-foreground px-5 py-3 rounded-xl text-sm font-bold">
          Browse tradies
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === userId;
  const isAdmin = viewerProfile?.is_admin === true;
  const showFullIdentity = isOwner || isAdmin || hasFundedContract;

  const rawDisplayName = profile.business_name || profile.display_name || 'TradieHubAU tradie';
  const displayName = showFullIdentity ? rawDisplayName : maskName(rawDisplayName);
  const location = [profile.suburb, profile.state].filter(Boolean).join(', ');
  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <section className="bg-card border rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-4xl font-black shrink-0 overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight flex flex-wrap items-center gap-2">
                {displayName}
                {profile.tradie_verified && <ShieldCheck className="h-7 w-7 text-primary fill-primary/10" />}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-muted-foreground">
                {location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {location}</span>}
                {profile.years_experience !== null && profile.years_experience !== undefined && (
                  <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {profile.years_experience} years experience</span>
                )}
                {averageRating && (
                  <span className="inline-flex items-center gap-1.5 text-amber-500"><Star className="h-4 w-4 fill-amber-500" /> {averageRating} ({reviews.length} reviews)</span>
                )}
              </div>
            </div>
            {profile.bio && <p className="text-sm leading-6 text-muted-foreground font-medium max-w-3xl">{profile.bio}</p>}
            {showFullIdentity && profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80">
                Visit website <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border rounded-3xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Trades</h2>
          <div className="flex flex-wrap gap-2">
            {profile.trades && profile.trades.length > 0 ? profile.trades.map(trade => (
              <span key={trade} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold">
                {tradeLabels[trade] || trade}
              </span>
            )) : (
              <p className="text-sm text-muted-foreground font-medium">No trades listed yet.</p>
            )}
          </div>
        </div>
        <div className="bg-card border rounded-3xl p-6 space-y-4 lg:col-span-2">
          <h2 className="text-lg font-bold">Service Areas</h2>
          {profile.service_areas && profile.service_areas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.service_areas.map(area => (
                <span key={area} className="rounded-full bg-muted text-muted-foreground px-3 py-1 text-xs font-bold">{area}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-medium">Service areas not provided yet.</p>
          )}
        </div>
      </section>

      <section className="bg-card border rounded-3xl p-6 space-y-5">
        <h2 className="text-xl font-black flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Completed Work</h2>
        {proofGallery.length === 0 ? (
          <p className="text-sm text-muted-foreground font-medium">No public completed work yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {proofGallery.map(proof => (
              <article key={proof.id} className="border rounded-2xl overflow-hidden bg-background">
                {proof.image_urls && proof.image_urls.length > 0 && (
                  <img
                    src={proof.image_urls[0]}
                    alt={proof.portfolio_title || 'Completed work'}
                    className="h-48 w-full object-cover"
                  />
                )}
                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-foreground">{proof.portfolio_title || proof.job_title || 'Completed TradieHubAU job'}</h3>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground font-semibold">
                      {(proof.portfolio_trade_category || proof.job_categories?.[0]) && (() => {
                        const trade = proof.portfolio_trade_category || proof.job_categories?.[0] || '';
                        return <span>{tradeLabels[trade] || trade}</span>;
                      })()}
                      {[proof.job_suburb, proof.job_state].filter(Boolean).length > 0 && (
                        <span>{[proof.job_suburb, proof.job_state].filter(Boolean).join(', ')}</span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatMonth(proof.completed_at || proof.created_at)}
                      </span>
                    </div>
                  </div>
                  {proof.portfolio_caption && (
                    <p className="text-sm text-muted-foreground leading-6 font-medium">{proof.portfolio_caption}</p>
                  )}
                  {proof.image_urls && proof.image_urls.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {proof.image_urls.slice(1, 5).map(url => (
                        <img key={url} src={url} alt="" className="aspect-square rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card border rounded-3xl p-6 space-y-5">
        <h2 className="text-xl font-black flex items-center gap-2"><Star className="h-5 w-5 text-primary" /> Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground font-medium">Reviews from completed TradieHubAU jobs will appear here.</p>
        ) : (
          <div className="divide-y">
            {reviews.map(review => (
              <article key={review.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black overflow-hidden">
                      {review.reviewer_avatar_url ? <img src={review.reviewer_avatar_url} alt="" className="h-full w-full object-cover" /> : (review.reviewer_display_name || 'V').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{review.reviewer_display_name || 'Verified customer'}</p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {new Date(review.submitted_at).toLocaleDateString()}
                        {(review.job_categories?.[0] || review.job_suburb || review.job_state) && (
                          <>
                            {' | '}
                            {[
                              review.job_categories?.[0] ? (tradeLabels[review.job_categories[0]] || review.job_categories[0]) : null,
                              [review.job_suburb, review.job_state].filter(Boolean).join(', ') || null,
                            ].filter(Boolean).join(' | ')}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 px-2.5 py-1 text-xs font-bold">
                    <Star className="h-3.5 w-3.5 fill-amber-500" /> {review.rating}
                  </span>
                </div>
                {review.text && <p className="text-sm text-muted-foreground leading-6 font-medium">{review.text}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
