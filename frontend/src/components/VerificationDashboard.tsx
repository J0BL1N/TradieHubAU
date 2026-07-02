import React from 'react';
import {
  CheckCircle,
  AlertCircle,
  Upload,
  Loader2,
  Send,
  Camera,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

export interface VerificationDashboardProps {
  targetProfile: any;
  effectiveIdVerificationStatus: string;
  effectiveLivenessVerificationStatus: string;
  tradieVerificationStatus: string;
  tradieVerificationNotes: string | null;
  actionStatuses: string[];
  isVerificationComplete: boolean;
  
  // ID Upload
  idVerificationRecheckReason: string | null;
  idVerificationNotes: string | null;
  idFile: File | null;
  setIdFile: (file: File | null) => void;
  setIdDocType: (type: string) => void;
  idUploadSuccess: boolean;
  idUploadError: string | null;
  handleIdentityUpload: (e: React.FormEvent) => void;
  uploadingDoc: boolean;
  IDENTITY_DOCUMENT_CARD: any;
  getStatusClass: (status: any) => string;
  getStatusLabel: (status: any, required?: boolean) => string;

  // Liveness Upload
  livenessVerificationRecheckReason: string | null;
  livenessVerificationNotes: string | null;
  livenessFile: File | null;
  setLivenessFile: (file: File | null) => void;
  livenessUploadSuccess: boolean;
  livenessUploadError: string | null;
  livenessUploading: boolean;
  handleLivenessUpload: (e: React.FormEvent) => void;

  // Contractor Apply / Documents
  abn: string;
  setAbn: (val: string) => void;
  licenseNumber: string;
  setLicenseNumber: (val: string) => void;
  trades: string[];
  setTrades: (val: string[]) => void;
  tradieFile: File | null;
  setTradieCardFile: (type: string, file: File | null) => void;
  insuranceFile: File | null;
  setInsuranceFile: (file: File | null) => void;
  handleApplyAsTradie: (e?: React.FormEvent, type?: string, file?: File | null) => void;
  uploadSuccess: boolean;
  uploadError: string | null;
  insuranceUploadError: string | null;
  setInsuranceUploadError: (val: string | null) => void;
  categoryOptions: any[];
  TRADIE_DOCUMENT_CARDS: any[];
  tradieFiles: Record<string, File | null>;
  verificationSummaries: Record<string, any>;
  getDocumentStatus: (type: string) => string;

  // Trade-specific licences
  stateVal: string;
  requirementRules: any[];
  licenceTypes: any[];
  userTradeCredentials: any[];
  selectedLicenceTypeId: string;
  setSelectedLicenceTypeId: (val: string) => void;
  licenceNumberVal: string;
  setLicenceNumberVal: (val: string) => void;
  expiryDateVal: string;
  setExpiryDateVal: (val: string) => void;
  credentialFile: File | null;
  setCredentialFile: (file: File | null) => void;
  submittingCredential: boolean;
  credentialSuccess: string | null;
  credentialError: string | null;
  handleAddTradeCredential: (e: React.FormEvent) => void;
  handleDeleteTradeCredential: (id: string) => void;

  // Experience evidence
  userExperienceEvidence: any[];
  selectedEvidenceTradeId: string;
  setSelectedEvidenceTradeId: (val: string) => void;
  evidenceTypeVal: 'certificate' | 'referee_letter' | 'completion_log';
  setEvidenceTypeVal: (val: 'certificate' | 'referee_letter' | 'completion_log') => void;
  evidenceDescription: string;
  setEvidenceDescription: (val: string) => void;
  evidenceFile: File | null;
  setEvidenceFile: (file: File | null) => void;
  submittingEvidence: boolean;
  evidenceSuccess: string | null;
  evidenceError: string | null;
  handleAddExperienceEvidence: (e: React.FormEvent) => void;
  handleDeleteExperienceEvidence: (id: string) => void;

  // Layout Toggle States
  activeSection: string | null;
  setActiveSection: (val: string | null) => void;
  showLicenceForm: boolean;
  setShowLicenceForm: (val: boolean) => void;
  showEvidenceForm: boolean;
  setShowEvidenceForm: (val: boolean) => void;
  showRequirementDetails: Record<string, boolean>;
  setShowRequirementDetails: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  dueDiligenceExpanded: boolean;
  setDueDiligenceExpanded: (val: boolean) => void;
  expandedRow: string | null;
  setExpandedRow: (val: string | null) => void;
}

export const VerificationDashboard: React.FC<VerificationDashboardProps> = ({
  targetProfile,
  effectiveIdVerificationStatus,
  effectiveLivenessVerificationStatus,
  tradieVerificationStatus,
  tradieVerificationNotes,
  actionStatuses,
  isVerificationComplete,

  idVerificationRecheckReason,
  idVerificationNotes,
  idFile,
  setIdFile,
  setIdDocType,
  idUploadSuccess,
  idUploadError,
  handleIdentityUpload,
  uploadingDoc,
  IDENTITY_DOCUMENT_CARD,
  getStatusClass,
  getStatusLabel,

  livenessVerificationRecheckReason,
  livenessVerificationNotes,
  livenessFile,
  setLivenessFile,
  livenessUploadSuccess,
  livenessUploadError,
  livenessUploading,
  handleLivenessUpload,

  abn,
  setAbn,
  licenseNumber,
  setLicenseNumber,
  trades,
  setTrades,
  tradieFile,
  setTradieCardFile,
  insuranceFile,
  setInsuranceFile,
  handleApplyAsTradie,
  uploadSuccess,
  uploadError,
  insuranceUploadError,
  setInsuranceUploadError,
  categoryOptions,
  TRADIE_DOCUMENT_CARDS,
  tradieFiles,
  verificationSummaries,
  getDocumentStatus,

  stateVal,
  requirementRules,
  licenceTypes,
  userTradeCredentials,
  selectedLicenceTypeId,
  setSelectedLicenceTypeId,
  licenceNumberVal,
  setLicenceNumberVal,
  expiryDateVal,
  setExpiryDateVal,
  credentialFile,
  setCredentialFile,
  submittingCredential,
  credentialSuccess,
  credentialError,
  handleAddTradeCredential,
  handleDeleteTradeCredential,

  userExperienceEvidence,
  selectedEvidenceTradeId,
  setSelectedEvidenceTradeId,
  evidenceTypeVal,
  setEvidenceTypeVal,
  evidenceDescription,
  setEvidenceDescription,
  evidenceFile,
  setEvidenceFile,
  submittingEvidence,
  evidenceSuccess,
  evidenceError,
  handleAddExperienceEvidence,
  handleDeleteExperienceEvidence,

  activeSection,
  setActiveSection,
  showLicenceForm,
  setShowLicenceForm,
  showEvidenceForm,
  setShowEvidenceForm,
  showRequirementDetails,
  setShowRequirementDetails,
  dueDiligenceExpanded,
  setDueDiligenceExpanded,
  expandedRow,
  setExpandedRow
}) => {
  const getActionItemsCount = () => {
    let count = 0;
    if (actionStatuses.includes(effectiveIdVerificationStatus)) count++;
    if (actionStatuses.includes(effectiveLivenessVerificationStatus)) count++;
    if (targetProfile?.role !== 'customer') {
      if (actionStatuses.includes(tradieVerificationStatus)) count++;
      TRADIE_DOCUMENT_CARDS.forEach(doc => {
        const s = getDocumentStatus(doc.type);
        if (actionStatuses.includes(s)) count++;
      });
    }
    return count;
  };

  const actionItemsCount = getActionItemsCount();

  return (
    <div className="space-y-6 text-left">
      {/* 1. Top Summary Card */}
      <section className="w-full rounded-3xl border bg-card p-5 shadow-xs space-y-3">
        <div className="flex items-start gap-4">
          {isVerificationComplete ? (
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className={`h-6 w-6 shrink-0 mt-0.5 ${actionItemsCount > 0 ? 'text-primary' : 'text-amber-500'}`} />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-foreground">
              {isVerificationComplete
                ? 'Verification complete'
                : actionItemsCount > 0
                ? 'Verification needs attention'
                : 'Verification in progress'}
            </h3>
            <p className="mt-1 text-xs font-semibold text-muted-foreground leading-relaxed">
              {isVerificationComplete
                ? targetProfile.role === 'customer'
                  ? 'Your current customer identity checks are complete.'
                  : 'Your current identity and contractor credential checks are complete.'
                : actionItemsCount > 0
                ? 'Some verification items need attention before you can quote regulated work.'
                : 'Your submitted verification material is waiting for admin review.'}
            </p>
            {actionItemsCount > 0 && (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                {actionItemsCount} action {actionItemsCount === 1 ? 'item' : 'items'} pending
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Collapsible Due Diligence Notice */}
      <div className="border rounded-2xl bg-muted/10 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setDueDiligenceExpanded(!dueDiligenceExpanded)}
          className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-muted-foreground hover:bg-muted/20 text-left transition-colors font-medium cursor-pointer"
        >
          <span className="flex items-center gap-1.5 font-black uppercase tracking-wider text-foreground">
            <Info className="h-4 w-4 text-primary shrink-0" /> Your Due Diligence Responsibility
          </span>
          {dueDiligenceExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        <div className={`px-4 pb-3.5 text-xs text-muted-foreground font-semibold leading-relaxed ${dueDiligenceExpanded ? 'block' : 'hidden'}`}>
          <p className="mb-2">
            Tradies must confirm they are licensed, insured, qualified, and competent for each job.
          </p>
          <p className="text-[11px] font-medium leading-relaxed bg-background p-2.5 rounded-xl border">
            Tradies remain responsible for checking that they hold the correct current licence, insurance, qualifications, and experience for the exact work they quote or accept. Requirements vary by state, licence class, job value, and job scope. TradieHubAU checks support platform trust but do not replace your own due diligence.
          </p>
        </div>
        {!dueDiligenceExpanded && (
          <p className="px-4 pb-3.5 text-[11px] text-muted-foreground font-semibold italic">
            Tradies must confirm they are licensed, insured, qualified, and competent for each job.
          </p>
        )}
      </div>

      {/* 3. Guided Checklist Sections */}
      <div className="space-y-4">
        
        {/* SECTION 1: IDENTITY VERIFICATION */}
        <div className="border rounded-2xl bg-card overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'id' ? null : 'id')}
            className="w-full flex items-center justify-between p-4 font-bold text-sm text-foreground hover:bg-muted/10 border-b transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 font-black uppercase text-xs tracking-wider">
              Identity Verification
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                effectiveIdVerificationStatus === 'approved' && effectiveLivenessVerificationStatus === 'approved'
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : effectiveIdVerificationStatus === 'pending' || effectiveLivenessVerificationStatus === 'pending'
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-primary/10 text-primary border-primary/20'
              }`}>
                {effectiveIdVerificationStatus === 'approved' && effectiveLivenessVerificationStatus === 'approved'
                  ? 'Approved'
                  : effectiveIdVerificationStatus === 'pending' || effectiveLivenessVerificationStatus === 'pending'
                  ? 'Pending'
                  : 'Action Required'}
              </span>
              {activeSection === 'id' ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </div>
          </button>

          {activeSection === 'id' && (
            <div className="p-4 space-y-4 divide-y divide-border/60">
              {/* Row 1: Photo ID */}
              <div className="pt-2 first:pt-0 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                      effectiveIdVerificationStatus === 'approved' ? 'bg-green-500' :
                      effectiveIdVerificationStatus === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-primary'
                    }`} />
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Photo ID</h4>
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground leading-normal">
                        Submit driver licence or passport details
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${getStatusClass(effectiveIdVerificationStatus)}`}>
                      {getStatusLabel(effectiveIdVerificationStatus)}
                    </span>
                    {effectiveIdVerificationStatus !== 'approved' && effectiveIdVerificationStatus !== 'pending' && (
                      <button
                        type="button"
                        onClick={() => setExpandedRow(expandedRow === 'photoId' ? null : 'photoId')}
                        className="bg-secondary text-secondary-foreground font-black text-[10px] uppercase px-3 py-1 rounded-lg hover:bg-secondary/80 transition-all cursor-pointer"
                      >
                        {expandedRow === 'photoId' ? 'Cancel' : 'Upload replacement'}
                      </button>
                    )}
                  </div>
                </div>

                {expandedRow === 'photoId' && (
                  <div className="p-3 bg-muted/10 border rounded-xl space-y-3">
                    {(idVerificationRecheckReason || idVerificationNotes) && (
                      <p className="text-[11px] font-semibold leading-relaxed text-amber-700 break-words">
                        Note: {idVerificationRecheckReason || idVerificationNotes}
                      </p>
                    )}
                    <form onSubmit={handleIdentityUpload} className="space-y-3 max-w-sm">
                      {idUploadSuccess && <p className="text-xs font-semibold text-green-600">Submitted successfully.</p>}
                      {idUploadError && <p className="text-xs font-semibold text-red-500">{idUploadError}</p>}
                      {idFile && (
                        <div className="p-2 bg-background border rounded-lg text-xs truncate font-semibold">
                          {idFile.name}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-secondary/80 text-xs cursor-pointer select-none">
                          <Upload className="h-3.5 w-3.5 shrink-0" /> Choose File
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
                          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-primary/95 text-xs disabled:opacity-50 cursor-pointer"
                        >
                          {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Submit ID
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {/* Row 2: Liveness Selfie */}
              <div className="pt-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                      effectiveLivenessVerificationStatus === 'approved' ? 'bg-green-500' :
                      effectiveLivenessVerificationStatus === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-primary'
                    }`} />
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Liveness Selfie</h4>
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground leading-normal">
                        Selfie holding up 4 fingers next to your face
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${getStatusClass(effectiveLivenessVerificationStatus)}`}>
                      {getStatusLabel(effectiveLivenessVerificationStatus)}
                    </span>
                    {effectiveLivenessVerificationStatus !== 'approved' && effectiveLivenessVerificationStatus !== 'pending' && (
                      <button
                        type="button"
                        onClick={() => setExpandedRow(expandedRow === 'selfie' ? null : 'selfie')}
                        className="bg-secondary text-secondary-foreground font-black text-[10px] uppercase px-3 py-1 rounded-lg hover:bg-secondary/80 transition-all cursor-pointer"
                      >
                        {expandedRow === 'selfie' ? 'Cancel' : 'Upload replacement'}
                      </button>
                    )}
                  </div>
                </div>

                {expandedRow === 'selfie' && (
                  <div className="p-3 bg-muted/10 border rounded-xl space-y-3">
                    {(livenessVerificationRecheckReason || livenessVerificationNotes) && (
                      <p className="text-[11px] font-semibold leading-relaxed text-amber-700 break-words">
                        Note: {livenessVerificationRecheckReason || livenessVerificationNotes}
                      </p>
                    )}
                    <form onSubmit={handleLivenessUpload} className="space-y-3 max-w-sm">
                      {livenessUploadSuccess && <p className="text-xs font-semibold text-green-600">Submitted successfully.</p>}
                      {livenessUploadError && <p className="text-xs font-semibold text-red-500">{livenessUploadError}</p>}
                      {livenessFile && (
                        <div className="p-2 bg-background border rounded-lg text-xs truncate font-semibold">
                          {livenessFile.name}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-secondary/80 text-xs cursor-pointer select-none">
                          <Camera className="h-3.5 w-3.5 shrink-0" /> Take photo
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
                          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-primary/95 text-xs disabled:opacity-50 cursor-pointer"
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
          )}
        </div>

        {/* SECTION 2: CONTRACTOR CREDENTIALS */}
        <div className="border rounded-2xl bg-card overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSection(activeSection === 'credentials' ? null : 'credentials')}
            className="w-full flex items-center justify-between p-4 font-bold text-sm text-foreground hover:bg-muted/10 border-b transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 font-black uppercase text-xs tracking-wider">
              {targetProfile.role === 'customer' ? 'Apply as a Contractor' : 'Contractor Credentials'}
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                targetProfile.role === 'customer'
                  ? 'bg-muted text-muted-foreground border-border'
                  : tradieVerificationStatus === 'approved'
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : tradieVerificationStatus === 'pending'
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-primary/10 text-primary border-primary/20'
              }`}>
                {targetProfile.role === 'customer'
                  ? 'Apply Now'
                  : tradieVerificationStatus === 'approved'
                  ? 'Approved'
                  : tradieVerificationStatus === 'pending'
                  ? 'Pending'
                  : 'Action Required'}
              </span>
              {activeSection === 'credentials' ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </div>
          </button>

          {activeSection === 'credentials' && (
            <div className="p-4 space-y-4">
              {targetProfile.role === 'customer' ? (
                <form onSubmit={handleApplyAsTradie} className="space-y-4 max-w-lg text-left">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Contractor Profile Details</h4>
                    <p className="text-[11px] text-muted-foreground font-semibold">
                      Submit details to upgrade your profile and bid on active listings.
                    </p>
                  </div>

                  {tradieVerificationStatus === 'pending' && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-700 font-semibold leading-relaxed">
                      Application Pending review. ABN: {abn || 'Submitted'}, Licence: {licenseNumber || 'Submitted'}
                    </div>
                  )}

                  {tradieVerificationStatus === 'rejected' && (
                    <div className="p-3 bg-red-50/5 border border-red-500/20 rounded-xl text-xs text-red-600 font-semibold leading-relaxed">
                      Previous application rejected: {tradieVerificationNotes}
                    </div>
                  )}

                  {uploadSuccess && <p className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-600 font-semibold">Submitted successfully!</p>}
                  {uploadError && <p className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 font-semibold">{uploadError}</p>}

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Licence document file</label>
                        {tradieFile && <p className="text-[10px] text-foreground font-bold truncate bg-muted/20 p-2 rounded-lg border">{tradieFile.name}</p>}
                        <label className="w-full inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-3 py-2 rounded-xl text-xs cursor-pointer select-none">
                          <Upload className="h-3.5 w-3.5 shrink-0" /> Choose Licence
                          <input
                            type="file"
                            onChange={(e) => setTradieCardFile('contractor_license', e.target.files?.[0] || null)}
                            className="hidden"
                            accept="image/*,application/pdf"
                          />
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Public liability insurance</label>
                        {insuranceFile && <p className="text-[10px] text-foreground font-bold truncate bg-muted/20 p-2 rounded-lg border">{insuranceFile.name}</p>}
                        <label className="w-full inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-3 py-2 rounded-xl text-xs cursor-pointer select-none">
                          <Upload className="h-3.5 w-3.5 shrink-0" /> Choose Insurance
                          <input
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setInsuranceFile(file);
                              if (file && insuranceUploadError === 'Please select an insurance proof file.') {
                                  setInsuranceUploadError(null);
                              }
                            }}
                            className="hidden"
                            accept="image/*,application/pdf"
                          />
                        </label>
                        {insuranceUploadError && (
                          <p className="text-[10px] font-semibold text-red-500 mt-1">{insuranceUploadError}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={abn}
                        onChange={(e) => setAbn(e.target.value)}
                        placeholder="ABN (11 digits)"
                        className="bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50"
                      />
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="Contractor licence number"
                        className="bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-foreground">Select trades you perform</label>
                      <div className="flex flex-wrap gap-1.5 font-semibold">
                        {categoryOptions.map(opt => {
                          const hasSelected = trades.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setTrades(trades.includes(opt.id) ? trades.filter(t => t !== opt.id) : [...trades, opt.id])}
                              className={`text-[10px] font-bold px-2.5 py-1.5 border rounded-lg transition-all cursor-pointer ${
                                hasSelected ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background hover:bg-muted/10'
                              }`}
                            >
                              {opt.label} {hasSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingDoc || !abn || !licenseNumber}
                      className="w-full inline-flex items-center justify-center bg-primary text-primary-foreground font-black py-2.5 rounded-xl text-xs hover:bg-primary/95 shadow cursor-pointer"
                    >
                      Apply Now
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 divide-y divide-border/60 text-left">
                  {uploadSuccess && <p className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-600 font-semibold mb-2">Uploaded successfully.</p>}
                  {uploadError && <p className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 font-semibold mb-2">{uploadError}</p>}
                  {TRADIE_DOCUMENT_CARDS.map((doc) => {
                    const status = getDocumentStatus(doc.type);
                    const selectedFile = tradieFiles[doc.type];
                    const docSummary = verificationSummaries[doc.type];
                    const reasonText = docSummary?.recheck_reason || docSummary?.admin_notes || null;
                    const isComplete = status === 'approved' || status === 'pending';

                    return (
                      <div key={doc.type} className="pt-4 first:pt-0 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                              status === 'approved' ? 'bg-green-500' :
                              status === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-primary'
                            }`} />
                            <div className="min-w-0">
                              <h4 className="text-xs font-black text-foreground uppercase tracking-wider">{doc.title}</h4>
                              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground leading-normal">
                                {doc.helper}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${getStatusClass(status)}`}>
                              {getStatusLabel(status, doc.required)}
                            </span>
                            {!isComplete && (
                              <button
                                type="button"
                                onClick={() => setExpandedRow(expandedRow === doc.type ? null : doc.type)}
                                className="bg-secondary text-secondary-foreground font-black text-[10px] uppercase px-3 py-1 rounded-lg hover:bg-secondary/80 transition-all cursor-pointer"
                              >
                                {expandedRow === doc.type ? 'Cancel' : 'Submit'}
                              </button>
                            )}
                          </div>
                        </div>

                        {expandedRow === doc.type && !isComplete && (
                          <div className="p-3 bg-muted/10 border rounded-xl space-y-3">
                            {reasonText && (
                              <p className="text-[11px] font-semibold leading-relaxed text-amber-700 break-words">
                                Note: {reasonText}
                              </p>
                            )}
                            <div className="space-y-3 max-w-sm">
                              {selectedFile && <p className="text-xs font-semibold truncate bg-background border p-2 rounded-lg">{selectedFile.name}</p>}
                              <div className="flex gap-2">
                                <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-secondary/80 text-xs cursor-pointer select-none">
                                  <Upload className="h-3.5 w-3.5 shrink-0" /> Choose File
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
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold px-3 py-1.5 rounded-lg hover:bg-primary/95 text-xs disabled:opacity-50 cursor-pointer"
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
          )}
        </div>

        {/* SECTION 3: TRADE-SPECIFIC LICENCES */}
        {targetProfile.role !== 'customer' && (
          <div className="border rounded-2xl bg-card overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setActiveSection(activeSection === 'licences' ? null : 'licences')}
              className="w-full flex items-center justify-between p-4 font-bold text-sm text-foreground hover:bg-muted/10 border-b transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 font-black uppercase text-xs tracking-wider">
                Trade-Specific Licences
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-border bg-muted/10 text-muted-foreground">
                  {userTradeCredentials.length} submitted
                </span>
                {activeSection === 'licences' ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </div>
            </button>

            {activeSection === 'licences' && (
              <div className="p-4 space-y-5 text-left">
                {/* List of select trade state summaries */}
                <div className="space-y-3">
                  {trades.map(tradeId => {
                    const tradeName = categoryOptions.find(c => c.id === tradeId)?.label || tradeId;
                    const userState = stateVal || targetProfile.state || 'VIC';
                    const rule = requirementRules.find(r => r.trade_id === tradeId && r.state_code === userState);
                    const isExpanded = !!showRequirementDetails[tradeId];

                    return (
                      <div key={tradeId} className="p-3 bg-muted/10 border rounded-xl space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-black text-foreground capitalize flex items-center gap-1 font-bold">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {tradeName} — {userState}
                            </h4>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {rule?.licence_requirement_level === 'required' ? 'Licence Required' : rule?.licence_requirement_level === 'conditional' ? 'Conditional Licence' : 'General Work'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowRequirementDetails(prev => ({ ...prev, [tradeId]: !isExpanded }))}
                            className="text-[10px] font-black uppercase text-primary hover:underline text-xs cursor-pointer font-bold"
                          >
                            {isExpanded ? 'Hide requirements' : 'View requirements'}
                          </button>
                        </div>

                        {isExpanded && rule && (
                          <div className="pt-2 border-t text-[11px] text-muted-foreground font-semibold leading-relaxed space-y-1 bg-background p-2 rounded-lg border mt-1">
                            <p>Requirement level: {rule.licence_requirement_level === 'required' ? 'A registered licence is required.' : rule.licence_requirement_level === 'conditional' ? 'Licence is required for structural or major jobs exceeding state value limits.' : 'Generally not regulated, but qualifications are useful.'}</p>
                            {rule.required_licence_type && <p>Requires: {rule.required_licence_type.name} (issued by {rule.required_licence_type.regulatory_body}).</p>}
                            {rule.min_experience_years > 0 && <p>Minimum recommended experience: {rule.min_experience_years} years.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] font-semibold text-muted-foreground italic leading-relaxed">
                    Requirements vary by state, licence class, and job scope.
                  </p>
                </div>

                {/* Submissions Section */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Submitted Licences</h4>
                    <button
                      type="button"
                      onClick={() => setShowLicenceForm(!showLicenceForm)}
                      className="bg-primary text-primary-foreground font-black text-[10px] uppercase px-3 py-1.5 rounded-lg hover:bg-primary/95 transition-all shadow cursor-pointer"
                    >
                      {showLicenceForm ? 'Cancel Add' : 'Add Licence'}
                    </button>
                  </div>

                  {/* Add Licence Form */}
                  {showLicenceForm && (
                    <form onSubmit={handleAddTradeCredential} className="p-4 bg-muted/10 border border-dashed rounded-2xl space-y-4 max-w-lg">
                      <h5 className="text-xs font-black text-foreground uppercase tracking-wider">Submit New Trade Licence</h5>
                      {credentialError && <p className="text-xs font-bold text-red-500">{credentialError}</p>}
                      {credentialSuccess && <p className="text-xs font-bold text-green-600">{credentialSuccess}</p>}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Licence Type / Class</label>
                          <select
                            value={selectedLicenceTypeId}
                            onChange={e => setSelectedLicenceTypeId(e.target.value)}
                            className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50"
                          >
                            <option value="">-- Select Licence --</option>
                            {licenceTypes.map(lt => (
                              <option key={lt.id} value={lt.id}>
                                {lt.name} ({lt.state_code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Licence Number</label>
                          <input
                            type="text"
                            value={licenceNumberVal}
                            onChange={e => setLicenceNumberVal(e.target.value)}
                            placeholder="e.g. 104938C"
                            className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Expiry Date</label>
                          <input
                            type="date"
                            value={expiryDateVal}
                            onChange={e => setExpiryDateVal(e.target.value)}
                            className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Card photo / PDF</label>
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg cursor-pointer hover:bg-secondary/80">
                              <Upload className="h-3.5 w-3.5 shrink-0" /> Choose
                              <input
                                type="file"
                                onChange={e => setCredentialFile(e.target.files?.[0] || null)}
                                className="hidden"
                                accept="image/*,application/pdf"
                              />
                            </label>
                            <span className="text-[11px] font-semibold text-muted-foreground truncate max-w-[100px]">
                              {credentialFile ? credentialFile.name : 'No file'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submittingCredential}
                        className="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-black px-4 py-2 rounded-xl text-xs hover:bg-primary/95 shadow-sm cursor-pointer"
                      >
                        {submittingCredential && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Submit Licence
                      </button>
                    </form>
                  )}

                  {/* Submitted Licences List */}
                  {userTradeCredentials.length === 0 ? (
                    <p className="text-xs font-semibold text-muted-foreground italic">No licences submitted yet.</p>
                  ) : (
                    <div className="border rounded-xl overflow-hidden divide-y">
                      {userTradeCredentials.map(cred => (
                        <div key={cred.id} className="p-3 bg-background flex items-center justify-between gap-3 text-left">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground truncate">
                              {cred.licence_type?.name} ({cred.licence_type?.state_code})
                            </p>
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              No: {cred.licence_number} | Exp: {new Date(cred.expiry_date).toLocaleDateString('en-AU')}
                            </p>
                            {cred.recheck_reason && (
                              <p className="mt-1 text-[9px] font-bold text-amber-700 bg-amber-500/10 p-1 px-2 rounded">
                                Recheck: {cred.recheck_reason}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                              cred.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                              cred.status === 'pending' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :
                              'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {cred.status}
                            </span>
                            {cred.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteTradeCredential(cred.id)}
                                className="text-red-500 hover:text-red-700 text-sm font-black p-1 shrink-0 cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: EXPERIENCE EVIDENCE */}
        {targetProfile.role !== 'customer' && (
          <div className="border rounded-2xl bg-card overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setActiveSection(activeSection === 'evidence' ? null : 'evidence')}
              className="w-full flex items-center justify-between p-4 font-bold text-sm text-foreground hover:bg-muted/10 border-b transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 font-black uppercase text-xs tracking-wider">
                Experience Evidence
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-border bg-muted/10 text-muted-foreground">
                  {userExperienceEvidence.length} submitted
                </span>
                {activeSection === 'evidence' ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </div>
            </button>

            {activeSection === 'evidence' && (
              <div className="p-4 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Qualifications & Referee Letters</span>
                  <button
                    type="button"
                    onClick={() => setShowEvidenceForm(!showEvidenceForm)}
                    className="bg-primary text-primary-foreground font-black text-[10px] uppercase px-3 py-1.5 rounded-lg hover:bg-primary/95 transition-all shadow cursor-pointer"
                  >
                    {showEvidenceForm ? 'Cancel Add' : 'Add Experience Proof'}
                  </button>
                </div>

                {/* Evidence form */}
                {showEvidenceForm && (
                  <form onSubmit={handleAddExperienceEvidence} className="p-4 bg-muted/10 border border-dashed rounded-2xl space-y-4 max-w-lg">
                    <h5 className="text-xs font-black text-foreground uppercase tracking-wider">Upload Experience Proof</h5>
                    {evidenceError && <p className="text-xs font-bold text-red-500">{evidenceError}</p>}
                    {evidenceSuccess && <p className="text-xs font-bold text-green-600">{evidenceSuccess}</p>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Trade Category</label>
                        <select
                          value={selectedEvidenceTradeId}
                          onChange={e => setSelectedEvidenceTradeId(e.target.value)}
                          className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                        >
                          <option value="">-- Select Trade --</option>
                          {trades.map(tid => {
                            const label = categoryOptions.find(c => c.id === tid)?.label || tid;
                            return (
                              <option key={tid} value={tid}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Evidence Type</label>
                        <select
                          value={evidenceTypeVal}
                          onChange={e => setEvidenceTypeVal(e.target.value as any)}
                          className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                        >
                          <option value="certificate">Trade / Qualification Certificate</option>
                          <option value="referee_letter">Referee / Employer Letter</option>
                          <option value="completion_log">Apprenticeship Completion Log</option>
                        </select>
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Short Description</label>
                        <input
                          type="text"
                          value={evidenceDescription}
                          onChange={e => setEvidenceDescription(e.target.value)}
                          placeholder="e.g. Cert III in Electrotechnology or employer details"
                          className="w-full bg-background border rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Proof photo / PDF</label>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg cursor-pointer hover:bg-secondary/80">
                            <Upload className="h-3.5 w-3.5 shrink-0" /> Choose
                            <input
                              type="file"
                              onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
                              className="hidden"
                              accept="image/*,application/pdf"
                            />
                          </label>
                          <span className="text-[11px] font-semibold text-muted-foreground truncate max-w-[100px]">
                            {evidenceFile ? evidenceFile.name : 'No file'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingEvidence}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-black px-4 py-2 rounded-xl text-xs hover:bg-primary/95 shadow-sm cursor-pointer"
                    >
                      {submittingEvidence && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Upload Evidence
                    </button>
                  </form>
                )}

                {/* Evidence List */}
                {userExperienceEvidence.length === 0 ? (
                  <p className="text-xs font-semibold text-muted-foreground italic">No experience evidence submitted yet.</p>
                ) : (
                  <div className="border rounded-xl overflow-hidden divide-y">
                    {userExperienceEvidence.map(ev => {
                      const tLabel = categoryOptions.find(c => c.id === ev.trade_id)?.label || ev.trade_id;
                      return (
                        <div key={ev.id} className="p-3 bg-background flex items-center justify-between gap-3 text-left">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground truncate capitalize">
                              {ev.evidence_type.replace('_', ' ')}: {tLabel}
                            </p>
                            {ev.description && (
                              <p className="text-[10px] font-medium text-muted-foreground truncate">
                                {ev.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                              ev.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                              ev.status === 'pending' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :
                              'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {ev.status}
                            </span>
                            {ev.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteExperienceEvidence(ev.id)}
                                className="text-red-500 hover:text-red-700 text-sm font-black p-1 shrink-0 cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
