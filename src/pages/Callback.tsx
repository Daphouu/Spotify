import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { exchangeCodeForToken } from '../utils/spotify';

const Callback: React.FC = () => {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        console.error('Spotify auth error:', error);
        navigate('/');
        return;
      }
      if (!code) {
        navigate('/');
        return;
      }

      try {
        const resp = await exchangeCodeForToken(code);
        if (resp.access_token) {
          navigate('/dashboard', { replace: true });
        } else {
          console.error('No access_token returned:', resp);
          navigate('/');
        }
      } catch (err) {
        console.error('Callback error:', err);
        navigate('/');
      }
    };

    run();
  }, [navigate]);

  return (
    <div className="hero-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <motion.div
        className="pulse"
        style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: 'var(--spotify-green)' }}
      />
      <h2 style={{ marginTop: 24, letterSpacing: 2 }}>Authenticating…</h2>
    </div>
  );
};

export default Callback;
