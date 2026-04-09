import { Suspense, lazy, useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import CookieBanner from "@/components/cookies/CookieBanner";
import CookiePreferencesDialog from "@/components/cookies/CookiePreferencesDialog";
import ConsentGatedAnalytics from "@/components/cookies/ConsentGatedAnalytics";
import { VersionUpdateBanner } from "@/components/VersionUpdateBanner";

const Home = lazy(() => import("./components/home"));
const LandingPage = lazy(() => import("./components/landingpage"));
const Terms = lazy(() => import("./components/terms"));
const Privacy = lazy(() => import("./components/privacy"));
const DataDeletion = lazy(() => import("./components/datadeletion"));
const Cookies = lazy(() => import("./components/cookies"));

// Global Scroll to Top Button Component
const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();

  // Show button when page is scrolled down
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 400) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  // Scroll to top smoothly
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Reset scroll position on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-4 bg-autisync-gold text-white rounded-full shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-autisync-gold focus:ring-offset-2"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-autisync-surface" aria-hidden="true" />
      }
    >
      <>
        <VersionUpdateBanner />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<Home />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/datadeletion" element={<DataDeletion />} />
          <Route path="/cookies" element={<Cookies />} />
        </Routes>
        <Toaster position="top-right" richColors />
        <CookieBanner />
        <CookiePreferencesDialog />
        <ConsentGatedAnalytics />
        <ScrollToTopButton />
      </>
    </Suspense>
  );
}

export default App;
