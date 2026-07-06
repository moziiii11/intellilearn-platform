/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Resources from "./pages/Resources";
import Profile from "./pages/Profile";
import FlashcardsPage from "./pages/FlashcardsPage";
import Auth from "./pages/Auth";
import { UserProvider, useUser } from "./UserContext";

function AppRoutes() {
  const { isLoggedIn } = useUser();

  return (
    <Routes>
      <Route path="/auth" element={!isLoggedIn ? <Auth /> : <Navigate to="/" />} />
      <Route path="/" element={isLoggedIn ? <Layout /> : <Navigate to="/auth" />}>
        <Route index element={<Home />} />
        <Route path="resources" element={<Resources />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </UserProvider>
  );
}
