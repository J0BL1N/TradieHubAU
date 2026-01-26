
import { supabase, getCurrentUser } from '/js/core/supabase-client.js';
import * as db from '/js/core/db.js';
import { uploadAvatar } from '/js/api/storage-api.js';
import { uploadVerificationDocument, getVerificationStatus } from '/js/api/verification-api.js';

export async function initProfilePage() {
    console.log('Initializing My Profile Page...');
    
    // Initialize icons
    if (typeof feather !== 'undefined') feather.replace();

    // Check Auth
    const { user } = await getCurrentUser();
    if (!user) {
        window.location.href = '/index.html?action=login&return=/pages/my-profile.html';
        return;
    }

    const userId = user.id;

    // Load Profile Data
    const { data: profile, error } = await db.getUserProfile(userId);

    if (error) {
        console.error('Failed to load profile:', error);
        alert('Could not load profile. Please try again.');
        return;
    }

    // Render Main Profile
    renderProfileHeader(profile || { ...user, role: 'customer' }); // Fallback
    renderSettings(profile || { ...user });
    setupEventListeners(userId, profile);
    
    // Render Jobs (New Feature)
    renderMyJobs(userId, profile.role || 'customer');

    // Setup Verification UI
    setupVerificationUI(userId, profile.role);
}

function renderProfileHeader(profile) {
    // Basic Info
    setText('mpName', profile.display_name || 'New User');
    setText('mpSubtitle', `Manage your ${profile.role} account.`);
    
    const roleBadge = document.getElementById('mpRoleBadge');
    if (roleBadge) {
        roleBadge.textContent = (profile.role || 'customer').toUpperCase();
    }

    // Avatar
    const avatarEl = document.getElementById('mpAvatar');
    if (avatarEl) {
        avatarEl.src = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name || 'User')}&background=0d9488&color=fff`;
    }

    // Public Profile Links (Dynamic)
    const tradieLink = document.getElementById('mpPublicTradieLink');
    const customerLink = document.getElementById('mpPublicCustomerLink');
    
    if (tradieLink) {
        tradieLink.href = `/pages/profile-tradesman.html?id=${profile.id}`;
        tradieLink.classList.toggle('hidden', profile.role === 'customer');
    }
    
    if (customerLink) {
        customerLink.href = `/pages/profile-customer.html?id=${profile.id}`;
        // Everyone has a customer profile effectively, but maybe hide if pure tradie? 
        // For dual/customer it's valid. 
        // Tradies can also post jobs, so they have a customer profile too.
        customerLink.classList.remove('hidden');
    }
}

function renderSettings(profile) {
    setValue('mpDisplayName', profile.display_name);
    setValue('mpEmail', profile.email);
    setValue('mpPhone', profile.phone);
    setValue('mpSuburb', profile.suburb);
    setValue('mpState', profile.state);
    setValue('mpPostcode', profile.postcode);
    setValue('mpAbn', profile.abn); // Private
    setValue('mpLicense', profile.license_number); // Private

    // Checkboxes / Selects
    const showLoc = document.getElementById('mpShowLocation');
    if (showLoc) showLoc.checked = profile.show_location;
    
    const addrRule = document.getElementById('mpAddressRule');
    if (addrRule) addrRule.value = profile.address_rule || 'afterAccepted';

    // Highlight Role Button
    document.querySelectorAll('.mpRoleBtn').forEach(btn => {
        const isActive = btn.dataset.role === (profile.role || 'customer');
        btn.classList.toggle('bg-teal-50', isActive);
        btn.classList.toggle('text-teal-700', isActive);
        btn.classList.toggle('border-teal-200', isActive);
    });
}

async function renderMyJobs(userId, role) {
    const listEl = document.getElementById('mpMyJobsList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="p-4 text-center text-gray-400">Loading jobs...</div>';

    try {
        let jobs = [];
        
        // 1. Fetch "Jobs I Posted" (Customer view)
        // We always fetch these because even tradies can post jobs.
        const { data: posted } = await supabase
            .from('jobs')
            .select('*')
            .eq('customer_id', userId)
            .order('created_at', { ascending: false });
            
        if (posted) jobs.push(...posted.map(j => ({ ...j, _type: 'posted' })));

        // 2. Fetch "Jobs I'm Working On" (Tradie view)
        if (role !== 'customer') {
            const { data: assignments } = await supabase
                .from('job_assignments')
                .select('*, job:jobs(*)')
                .eq('tradie_id', userId)
                .order('accepted_at', { ascending: false });
            
            if (assignments) {
                // Flatten structure
                const worked = assignments.map(a => ({
                    ...a.job,
                    _type: 'working',
                    _assignment_status: a.status
                }));
                jobs.push(...worked);
            }
        }

        // Render
        if (jobs.length === 0) {
            listEl.innerHTML = '<div class="p-4 text-center text-gray-500 italic">No active or past jobs found.</div>';
            return;
        }

        // Sort by date desc
        jobs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

        listEl.innerHTML = jobs.map(job => {
            const isPosted = job._type === 'posted';
            const badgeColor = isPosted ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700';
            const badgeText = isPosted ? 'Posted by You' : 'Working On';
            const statusColor = job.status === 'completed' ? 'text-green-600' : 'text-gray-600';

            return `
            <div class="flex items-center justify-between p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
                <div>
                    <div class="font-medium text-gray-900">${escapeHtml(job.title)}</div>
                    <div class="text-xs text-gray-500 flex gap-2">
                        <span>${new Date(job.created_at).toLocaleDateString()}</span>
                        <span class="${statusColor} capitalize">• ${job.status.replace('_', ' ')}</span>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="px-2 py-0.5 rounded text-[10px] border ${badgeColor} border-opacity-20">${badgeText}</span>
                    <a href="/pages/ongoing-job.html?id=${job.id}" class="text-xs text-teal-600 hover:text-teal-700 hover:underline">View</a>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('Error fetching jobs:', e);
        listEl.innerHTML = '<div class="p-4 text-center text-red-400">Failed to load jobs.</div>';
    }
}

function setupEventListeners(userId, profile) {
    // Edit/Save/Cancel Toggles
    const editBtn = document.getElementById('mpEditBtn');
    const saveBtn = document.getElementById('mpSaveBtn');
    const cancelBtn = document.getElementById('mpCancelBtn');
    
    if (editBtn) editBtn.onclick = () => toggleEditMode(true);
    if (cancelBtn) cancelBtn.onclick = () => toggleEditMode(false);
    
    if (saveBtn) saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-feather="loader" class="animate-spin w-4 h-4"></i> Saving...';
        if (typeof feather !== 'undefined') feather.replace();
        
        await saveProfileChanges(userId);
        
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-feather="save" class="w-4 h-4"></i> Save';
        if (typeof feather !== 'undefined') feather.replace();
    };

    // Role Buttons
    document.querySelectorAll('.mpRoleBtn').forEach(btn => {
        btn.onclick = () => {
            if (!document.body.classList.contains('mp-editing')) return;
            
            // Visual toggle
            document.querySelectorAll('.mpRoleBtn').forEach(b => {
                b.classList.remove('bg-teal-50', 'text-teal-700', 'border-teal-200');
            });
            btn.classList.add('bg-teal-50', 'text-teal-700', 'border-teal-200');
        };
    });

    // Avatar Upload
    const pickBtn = document.getElementById('mpAvatarPickBtn');
    const fileInput = document.getElementById('mpAvatarFile');
    
    if (pickBtn && fileInput) {
        pickBtn.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            pickBtn.textContent = 'Uploading...';
            pickBtn.disabled = true;
            
            try {
                const { url, error } = await uploadAvatar(file, userId);
                if (error) throw error;
                
                // Update DB immediately
                await db.updateUserProfile(userId, { avatar_url: url });
                
                // Update UI
                document.getElementById('mpAvatar').src = url;
                if (window.ATHToast) window.ATHToast.show({ type: 'success', message: 'Avatar updated!' });
                
            } catch (err) {
                console.error(err);
                alert('Avatar upload failed.');
            } finally {
                pickBtn.textContent = 'Upload image';
                pickBtn.disabled = false;
            }
        };
    }
}

function toggleEditMode(isEditing) {
    document.body.classList.toggle('mp-editing', isEditing);
    
    const viewEls = document.querySelectorAll('.mp-view-mode');
    const editEls = document.querySelectorAll('.mp-edit-mode');
    const inputs = document.querySelectorAll('.mp-input');
    
    viewEls.forEach(el => el.classList.toggle('hidden', isEditing));
    editEls.forEach(el => el.classList.toggle('hidden', !isEditing));
    
    inputs.forEach(inp => {
        inp.disabled = !isEditing;
        if (isEditing) {
             inp.classList.add('bg-white', 'border-teal-500', 'ring-1', 'ring-teal-500');
             inp.classList.remove('bg-gray-50', 'border-gray-200');
        } else {
             inp.classList.remove('bg-white', 'border-teal-500', 'ring-1', 'ring-teal-500');
             inp.classList.add('bg-gray-50', 'border-gray-200');
        }
    });
}

async function saveProfileChanges(userId) {
    const updates = {
        display_name: getValue('mpDisplayName'),
        email: getValue('mpEmail'),
        phone: getValue('mpPhone'),
        suburb: getValue('mpSuburb'),
        state: getValue('mpState'),
        postcode: getValue('mpPostcode'),
        abn: getValue('mpAbn'),
        license_number: getValue('mpLicense'),
        show_location: document.getElementById('mpShowLocation')?.checked,
        address_rule: getValue('mpAddressRule')
    };

    // Role
    const activeRoleBtn = document.querySelector('.mpRoleBtn.text-teal-700');
    if (activeRoleBtn) updates.role = activeRoleBtn.dataset.role;

    const { error } = await db.updateUserProfile(userId, updates);
    
    if (error) {
        alert('Failed to save changes.');
        console.error(error);
    } else {
        if (window.ATHToast) window.ATHToast.show({ type: 'success', message: 'Profile saved!' });
        toggleEditMode(false);
        renderProfileHeader({ ...updates, id: userId }); // Refresh header
        
        // Refresh jobs view if role changed
        // We'll just reload it to be safe or re-fetch
        renderMyJobs(userId, updates.role);
    }
}

async function setupVerificationUI(userId, role) {
    const section = document.getElementById('mpVerificationSection');
    if (!section) return;
    
    if (role === 'customer') {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    
    const { status } = await getVerificationStatus(userId);
    const badge = document.getElementById('mpVerificationStatus');
    const action = document.getElementById('mpVerifyAction');
    const pending = document.getElementById('mpVerifyPending');

    if (status === 'approved') {
        badge.textContent = 'Verified';
        badge.className = 'text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
    } else if (status === 'pending') {
         badge.textContent = 'Pending';
         badge.className = 'text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700';
         pending.classList.remove('hidden');
    } else {
         badge.textContent = 'Unverified';
         action.classList.remove('hidden');
         
         // Setup upload
         const btn = document.getElementById('mpVerifyBtn');
         const inp = document.getElementById('mpVerifyInput');
         if (btn && inp) {
             btn.onclick = () => inp.click();
             inp.onchange = async (e) => {
                 const file = e.target.files[0];
                 if(!file) return;
                 
                 btn.textContent = 'Uploading...';
                 btn.disabled = true;
                 
                 const { error } = await uploadVerificationDocument(file, 'license');
                 if (error) {
                     alert('Upload failed');
                     btn.disabled = false;
                     btn.textContent = 'Verify Identity';
                 } else {
                     action.classList.add('hidden');
                     pending.classList.remove('hidden');
                     badge.textContent = 'Pending';
                     if (window.ATHToast) window.ATHToast.show({ type: 'success', message: 'Document sent for review.' });
                 }
             };
         }
    }
}

// Helpers
function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setValue(id, val) { const el = document.getElementById(id); if(el) el.value = val || ''; }
function getValue(id) { const el = document.getElementById(id); return el ? el.value : null; }
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Auto Init
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('my-profile.html')) {
        initProfilePage();
    }
});

// Global for SPA
window.initProfilePage = initProfilePage;
