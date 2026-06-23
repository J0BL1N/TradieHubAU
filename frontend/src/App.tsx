import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import PostJob from './pages/PostJob';
import BrowseTradies from './pages/BrowseTradies';
import BrowseCustomers from './pages/BrowseCustomers';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import AdminDisputes from './pages/AdminDisputes';
import AdminDisputeCase from './pages/AdminDisputeCase';
import Auth from './pages/Auth';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="post-job" element={<PostJob />} />
            <Route path="browse-tradies" element={<BrowseTradies />} />
            <Route path="browse-customers" element={<BrowseCustomers />} />
            <Route path="messages" element={<Messages />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/:id" element={<Profile />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/disputes" element={<AdminDisputes />} />
            <Route path="admin/disputes/:jobId" element={<AdminDisputeCase />} />
            <Route path="login" element={<Auth />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
