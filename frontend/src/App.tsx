import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import HowItWorks from './pages/HowItWorks';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import PostJob from './pages/PostJob';
import BrowseTradies from './pages/BrowseTradies';
import BrowseCustomers from './pages/BrowseCustomers';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import PublicTradieProfile from './pages/PublicTradieProfile';
import Admin from './pages/Admin';
import AdminDisputes from './pages/AdminDisputes';
import AdminDisputeCase from './pages/AdminDisputeCase';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import {
  ContactSupport,
  CustomerVerificationExplainer,
  DisputeProcessExplainer,
  PrivacyPolicy,
  ProtectedPaymentExplainer,
  TermsOfService,
  TradieVerificationExplainer,
  TrustAndSafetyExplainer,
} from './pages/BetaInfoPages';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:jobId" element={<JobDetail />} />
            <Route path="post-job" element={<PostJob />} />
            <Route path="browse-tradies" element={<BrowseTradies />} />
            <Route path="browse-customers" element={<BrowseCustomers />} />
            <Route path="tradies/:userId" element={<PublicTradieProfile />} />
            <Route path="messages" element={<Messages />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/:id" element={<Profile />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/disputes" element={<AdminDisputes />} />
            <Route path="admin/disputes/:jobId" element={<AdminDisputeCase />} />
            <Route path="login" element={<Auth />} />
            <Route path="auth/callback" element={<AuthCallback />} />
            <Route path="support" element={<ContactSupport />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="terms" element={<TermsOfService />} />
            <Route path="protected-payments" element={<ProtectedPaymentExplainer />} />
            <Route path="trust-and-safety" element={<TrustAndSafetyExplainer />} />
            <Route path="dispute-process" element={<DisputeProcessExplainer />} />
            <Route path="tradie-verification" element={<TradieVerificationExplainer />} />
            <Route path="customer-verification" element={<CustomerVerificationExplainer />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
