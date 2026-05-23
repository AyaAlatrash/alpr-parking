import { useState } from 'react';
import { CAMERA_FEED_URL } from '../api/client';
import Layout from '../components/Layout';

export default function Camera() {
  const [error, setError]   = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ts, setTs]         = useState(Date.now()); // bust cache on retry

  const retry = () => {
    setError(false);
    setLoaded(false);
    setTs(Date.now());
  };

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Live Camera</h2>
          {!error && loaded && <span className="live-badge">● LIVE</span>}
        </div>

        <div className="card cam-full-card">
          {!error ? (
            <>
              {!loaded && (
                <div className="cam-loading">
                  <span className="spinner-lg" />
                  <p>Connecting to camera…</p>
                </div>
              )}
              <img
                key={ts}
                src={`${CAMERA_FEED_URL}?t=${ts}`}
                alt="Live stream"
                className="cam-stream-full"
                style={{ display: loaded ? 'block' : 'none' }}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
              />
            </>
          ) : (
            <div className="cam-error">
              <div className="cam-error-icon">📷</div>
              <p>Camera feed is unavailable</p>
              <p className="cam-error-hint">Make sure the ESP32 is powered on and connected to the network.</p>
              <button className="btn-primary" onClick={retry}>↻ Retry</button>
            </div>
          )}
        </div>

        <div className="cam-info">
          <div className="cam-info-row">
            <span className="cam-label">Stream URL</span>
            <span className="cam-value">{CAMERA_FEED_URL}</span>
          </div>
          <div className="cam-info-row">
            <span className="cam-label">Format</span>
            <span className="cam-value">MJPEG (proxied via Flask)</span>
          </div>
          <div className="cam-info-row">
            <span className="cam-label">Resolution</span>
            <span className="cam-value">240 × 240 (Grayscale)</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
