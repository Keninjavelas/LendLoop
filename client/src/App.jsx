import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ExplorePage from './pages/ExplorePage.jsx';
import ItemDetailsPage from './pages/ItemDetailsPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoanDetailPage from './pages/LoanDetailPage.jsx';
import LoansPage from './pages/LoansPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MyItemsPage from './pages/MyItemsPage.jsx';
import NewLoanPage from './pages/NewLoanPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RemindersPage from './pages/RemindersPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Browsing stays public so the landing page CTA works for signed-out visitors. */}
      <Route element={<AppLayout />}>
        <Route path="/items" element={<ExplorePage />} />
        <Route path="/items/:id" element={<ItemDetailsPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-items" element={<MyItemsPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/loans/new" element={<NewLoanPage />} />
          <Route path="/loans/:id" element={<LoanDetailPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
