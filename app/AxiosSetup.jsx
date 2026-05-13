'use client';
import axios from 'axios';
import { useEffect } from 'react';

export default function AxiosSetup() {
  useEffect(() => {
    // Removed hardcoded baseURL so it uses the same origin and hits Next.js rewrites
    // Bypass Ngrok's free tier browser warning for all API requests
    axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';
  }, []);
  return null;
}
