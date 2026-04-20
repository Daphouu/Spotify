import React from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Sparkles, BarChart3, Clock } from 'lucide-react';
import { redirectToSpotifyAuth } from '../utils/spotify';

const Home: React.FC = () => {
  return (
    <div className="hero-wrapper">
      <div className="hero-bg-blob pulse"></div>
      
      <div className="container" style={{ position: 'relative', zIndex: 10 }}>
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ maxWidth: '800px', margin: '0 auto' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <motion.div 
              className="glass-panel"
              style={{ display: 'inline-flex', padding: '12px 24px', alignItems: 'center', gap: '10px', borderRadius: '50px' }}
              whileHover={{ scale: 1.05 }}
            >
              <AudioLines size={24} className="text-spotify floating" />
              <span style={{ fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                Your Ultimate Audio Companion
              </span>
            </motion.div>
          </div>

          <h1 style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)', lineHeight: 1.1, marginBottom: '24px' }}>
            Discover Your True <br />
            <span className="text-gradient">Listening Habits</span>
          </h1>
          
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '48px', maxWidth: '600px', margin: '0 auto 48px auto' }}>
            Connect your Spotify account to analyze your top artists, tracks, and dive deep into your auditory DNA like never before. 
          </p>

          <motion.button 
            className="btn-primary"
            onClick={redirectToSpotifyAuth}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 168 168" aria-label="Spotify">
              <path fill="#191414" d="M83.996.277C37.747.277.253 37.77.253 84.019c0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738l.001-.004zm38.404 120.78a5.217 5.217 0 01-7.18 1.73c-19.662-12.01-44.414-14.73-73.564-8.07a5.222 5.222 0 01-6.249-3.93 5.213 5.213 0 013.926-6.25c31.9-7.291 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18zm10.25-22.805c-1.89 3.075-5.91 4.045-8.98 2.155-22.51-13.839-56.823-17.846-83.448-9.764-3.453 1.043-7.1-.903-8.148-4.35a6.538 6.538 0 014.354-8.143c30.413-9.228 68.222-4.758 94.072 11.139 3.07 1.89 4.04 5.91 2.15 8.964zm.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219a7.835 7.835 0 015.221-9.771c29.581-8.98 78.756-7.245 109.83 11.202a7.823 7.823 0 012.74 10.733c-2.2 3.722-7.02 4.949-10.73 2.739z"/>
            </svg>
            Connect with Spotify
          </motion.button>
        </motion.div>

        <motion.div 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginTop: '80px' }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          <FeatureCard 
            icon={<BarChart3 size={28} className="text-spotify" />}
            title="Top Artists & Tracks"
            desc="See exactly who dominated your headphones over different time periods."
          />
          <FeatureCard 
            icon={<Sparkles size={28} className="text-spotify" />}
            title="Fan Analytics"
            desc="Find out if you're in the top 1% of listeners for your favorite bands."
          />
          <FeatureCard 
            icon={<Clock size={28} className="text-spotify" />}
            title="Listening Time"
            desc="(Pro option) Upload your history file for lifetime minute-by-minute tracking."
          />
        </motion.div>
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <motion.div 
    className="glass-panel" 
    style={{ padding: '32px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}
    whileHover={{ y: -5, background: 'rgba(30,30,30,0.6)' }}
    transition={{ type: 'spring', stiffness: 300 }}
  >
    {icon}
    <h3 style={{ fontSize: '1.4rem' }}>{title}</h3>
    <p style={{ color: 'var(--text-secondary)' }}>{desc}</p>
  </motion.div>
);

export default Home;
