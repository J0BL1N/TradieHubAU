// ----------------------------
// v0.0298: Onboarding Wizard (Phase 1)
// ----------------------------
// First-run wizard for role selection, trade selection, and profile setup.
// Usage:
//   if (window.ATHOnboarding?.shouldShow()) window.ATHOnboarding.show();
window.ATHOnboarding = window.ATHOnboarding || (function () {
  const STORAGE_KEY = 'athOnboardingComplete';
  const USER_KEY = 'athCurrentUser';
  const WIZARD_ID = 'athOnboardingWizard';
  
  let currentStep = 1;
  let wizardData = {
    role: null,
    trades: [],
    name: '',
    location: ''
  };

  function shouldShow() {
    try {
      const completed = window.ATHStore?.get(STORAGE_KEY, false);
      return !completed;
    } catch {
      return false;
    }
  }

  function show() {
    if (document.getElementById(WIZARD_ID)) return; // Already shown
    currentStep = 1;
    wizardData = { role: null, trades: [], name: '', location: '' };
    renderWizard();
    renderStep1();
  }

  function hide() {
    const wizard = document.getElementById(WIZARD_ID);
    if (wizard) {
      wizard.classList.add('ath-wizard-fade-out');
      setTimeout(() => wizard.remove(), 300);
    }
  }

  function skip() {
    try {
      window.ATHStore?.set(STORAGE_KEY, true);
    } catch { }
    hide();
    if (window.ATHToast) {
      window.ATHToast.show({
        message: 'You can complete your profile anytime',
        icon: 'user',
        link: { href: 'my-profile.html', label: 'Go to Profile' }
      });
    }
  }

  async function complete() {
    // Basic user object for local storage (fallback/legacy)
    const user = {
      id: `user-${Date.now()}`,
      role: wizardData.role,
      name: wizardData.name || 'New User',
      location: wizardData.location || 'Australia',
      trades: wizardData.role !== 'customer' ? wizardData.trades : [],
      onboardedAt: new Date().toISOString()
    };

    try {
      // 1. Save to localStorage keys (legacy support)
      window.ATHStore?.set(STORAGE_KEY, true);
      window.ATHStore?.set(USER_KEY, user);
      
      // 2. Save to Supabase (if authenticated)
      if (window.supabase) {
        const { data: { user: authUser } } = await window.supabase.auth.getUser();
        
        if (authUser) {
          const profileData = {
            id: authUser.id,
            role: wizardData.role,
            display_name: wizardData.name || authUser.user_metadata?.full_name || 'New User',
            suburb: '', // Onboarding only asks for state effectively
            state: wizardData.location || '',
            onboarded_at: new Date().toISOString()
            // trades are stored in a separate table/column - simplified for now
          };
          
          const { error } = await window.supabase
            .from('users')
            .upsert(profileData);
            
          if (error) console.error('Supabase profile update failed:', error);
          else console.log('✅ Supabase profile updated from wizard');
        }
      }
    } catch (e) {
      console.error('Onboarding complete error:', e);
    }

    hide();

    if (window.ATHToast) {
      window.ATHToast.show({
        message: 'Welcome to TradieHub!',
        icon: 'check-circle'
      });
    }

    setTimeout(() => redirectUser(wizardData.role), 800);
  }

  function redirectUser(role) {
    if (role === 'customer') {
      window.location.href = 'browse-trades.html';
    } else if (role === 'tradie') {
      window.location.href = 'browse-customers.html';
    } else {
      window.location.href = 'jobs.html';
    }
  }

  function renderWizard() {
    const wizard = document.createElement('div');
    wizard.id = WIZARD_ID;
    wizard.className = 'fixed inset-0 bg-gradient-to-br from-teal-500 to-cyan-600 z-[10000] flex items-center justify-center p-4 ath-wizard-fade-in';
    wizard.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative">
        <div id="athOnboardingContent"></div>
      </div>
    `;
    document.body.appendChild(wizard);
    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderStep1() {
    const content = document.getElementById('athOnboardingContent');
    if (!content) return;

    content.innerHTML = `
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">Welcome to TradieHub!</h2>
        <p class="text-gray-600">Let's get you set up in just a few steps</p>
        <div class="mt-4 flex justify-center gap-2">
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
          <div class="h-2 w-16 bg-gray-200 rounded-full"></div>
          <div class="h-2 w-16 bg-gray-200 rounded-full"></div>
        </div>
      </div>

      <div class="mb-8">
        <h3 class="text-xl font-semibold text-gray-900 mb-4">I'm a...</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onclick="window.ATHOnboarding._selectRole('customer')" class="ath-role-card" data-role="customer">
            <i data-feather="briefcase" class="w-12 h-12 mb-3 text-teal-600"></i>
            <div class="font-semibold text-gray-900">Customer</div>
            <p class="text-sm text-gray-600 mt-1">I need work done</p>
          </button>
          <button onclick="window.ATHOnboarding._selectRole('tradie')" class="ath-role-card" data-role="tradie">
            <i data-feather="tool" class="w-12 h-12 mb-3 text-teal-600"></i>
            <div class="font-semibold text-gray-900">Tradie</div>
            <p class="text-sm text-gray-600 mt-1">I do the work</p>
          </button>
          <button onclick="window.ATHOnboarding._selectRole('dual')" class="ath-role-card" data-role="dual">
            <i data-feather="users" class="w-12 h-12 mb-3 text-teal-600"></i>
            <div class="font-semibold text-gray-900">Both</div>
            <p class="text-sm text-gray-600 mt-1">I hire & work</p>
          </button>
        </div>
      </div>

      <div class="text-center">
        <button onclick="window.ATHOnboarding.skip()" class="text-sm text-gray-500 hover:text-gray-700">
          Skip for now
        </button>
      </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderStep2() {
    const content = document.getElementById('athOnboardingContent');
    if (!content) return;

    const trades = Array.isArray(window.TRADE_CATEGORIES) ? window.TRADE_CATEGORIES : [
      { id: 'plumbing', label: 'Plumbing' },
      { id: 'electrical', label: 'Electrical' },
      { id: 'carpentry', label: 'Carpentry' },
      { id: 'painting', label: 'Painting' },
      { id: 'building', label: 'Building' },
      { id: 'gardening', label: 'Gardening' }
    ];

    const tradeCheckboxes = trades.map(t => `
      <label class="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" value="${t.id}" class="ath-trade-checkbox rounded border-gray-300 text-teal-600 focus:ring-teal-500 mr-3">
        <span class="text-gray-900">${t.label}</span>
      </label>
    `).join('');

    content.innerHTML = `
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">What trades do you do?</h2>
        <p class="text-gray-600">Select all that apply (you can change this later)</p>
        <div class="mt-4 flex justify-center gap-2">
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
          <div class="h-2 w-16 bg-gray-200 rounded-full"></div>
        </div>
      </div>

      <div class="mb-8 max-h-96 overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${tradeCheckboxes}
        </div>
      </div>

      <div class="flex justify-between">
        <button onclick="window.ATHOnboarding._prevStep()" class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium">
          <i data-feather="arrow-left" class="w-4 h-4 inline-block mr-2"></i>Back
        </button>
        <div class="flex gap-3">
          <button onclick="window.ATHOnboarding.skip()" class="px-6 py-2 text-gray-500 hover:text-gray-700">
            Skip for now
          </button>
          <button onclick="window.ATHOnboarding._nextStep()" class="px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:opacity-90 font-medium">
            Continue
          </button>
        </div>
      </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderStep3() {
    const content = document.getElementById('athOnboardingContent');
    if (!content) return;

    content.innerHTML = `
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-gray-900 mb-2">Almost there!</h2>
        <p class="text-gray-600">Tell us a bit about yourself</p>
        <div class="mt-4 flex justify-center gap-2">
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
          <div class="h-2 w-16 bg-teal-500 rounded-full"></div>
        </div>
      </div>

      <div class="mb-8 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Your Name (optional)</label>
          <input type="text" id="athOnboardingName" placeholder="e.g., John Smith" value="${wizardData.name || ''}" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Location (optional)</label>
          <select id="athOnboardingLocation" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
            <option value="">Select your state</option>
            <option value="NSW">NSW</option>
            <option value="VIC">VIC</option>
            <option value="QLD">QLD</option>
            <option value="WA">WA</option>
            <option value="SA">SA</option>
            <option value="TAS">TAS</option>
            <option value="ACT">ACT</option>
            <option value="NT">NT</option>
          </select>
        </div>
      </div>

      <div class="flex justify-between">
        <button onclick="window.ATHOnboarding._prevStep()" class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium">
          <i data-feather="arrow-left" class="w-4 h-4 inline-block mr-2"></i>Back
        </button>
        <button onclick="window.ATHOnboarding._finish()" class="px-8 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:opacity-90 font-medium">
          Get Started <i data-feather="arrow-right" class="w-4 h-4 inline-block ml-2"></i>
        </button>
      </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();
  }

  // Internal navigation methods (exposed for onclick handlers)
  function _selectRole(role) {
    wizardData.role = role;
    currentStep = 2;
    
    if (role === 'customer') {
      // Skip trade selection for customers
      currentStep = 3;
      renderStep3();
    } else {
      renderStep2();
    }
  }

  function _nextStep() {
    if (currentStep === 2) {
      // Collect selected trades
      const checkboxes = document.querySelectorAll('.ath-trade-checkbox:checked');
      wizardData.trades = Array.from(checkboxes).map(cb => cb.value);
      
      if (wizardData.trades.length === 0) {
        alert('Please select at least one trade');
        return;
      }
    }
    
    currentStep++;
    if (currentStep === 3) renderStep3();
  }

  function _prevStep() {
    currentStep--;
    if (currentStep === 1) {
      renderStep1();
    } else if (currentStep === 2) {
      if (wizardData.role === 'customer') {
        currentStep = 1;
        renderStep1();
      } else {
        renderStep2();
      }
    }
  }

  function _finish() {
    // Collect final data
    const nameInput = document.getElementById('athOnboardingName');
    const locationSelect = document.getElementById('athOnboardingLocation');
    
    if (nameInput) wizardData.name = nameInput.value.trim();
    if (locationSelect) wizardData.location = locationSelect.value;
    
    complete();
  }

  // Expose internal methods for onclick handlers
  return {
    shouldShow,
    show,
    skip,
    _selectRole,
    _nextStep,
    _prevStep,
    _finish
  };
})();

