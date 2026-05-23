import { useEffect, useState } from 'react';
import { fetchStats, fetchDetections, CAMERA_FEED_URL, IMAGE_BASE_URL } from '../api/client';
import Layout from '../components/Layout';
import client from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const StatCard = ({ label, value, accent, icon }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ color: accent }}>{icon}</div>
    <div className="stat-body">
      <div className="stat-value" style={{ color: accent }}>{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

const statusClass = (s) => (s === 'AUTHORIZED' ? 'tag-authorized' : 'tag-unknown');

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.fill }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [stats, setStats]         = useState(null);
  const [recent, setRecent]       = useState([]);
  const [chartData, setChartData] = useState([]);
  const [preview, setPreview]     = useState(null);
  const [camError, setCamError]   = useState(false);

  const loadData = () => {
    fetchStats().then(r => setStats(r.data)).catch(console.error);
    fetchDetections({ per_page: 6 }).then(r => setRecent(r.data.detections)).catch(console.error);
    client.get('/api/stats/chart').then(r => setChartData(r.data)).catch(console.error);
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Dashboard</h2>
          <span className="live-badge">● LIVE</span>
        </div>

        {/* Stats Row */}
        <div className="stats-grid">
          <StatCard label="Detections Today"   value={stats?.today_total}   accent="#3b82f6" icon="📷" />
          <StatCard label="Unknown Today"       value={stats?.today_unknown} accent="#ef4444" icon="⚠️" />
          <StatCard label="Whitelisted Plates"  value={stats?.known_total}   accent="#22c55e" icon="✔"  />
          <StatCard label="All-Time Detections" value={stats?.all_time_total} accent="#a78bfa" icon="📊" />
        </div>

        {/* Weekly Chart */}
        <div className="card chart-card">
          <div className="card-header">
            <span className="card-title">Detections — Last 7 Days</span>
          </div>
          <div className="chart-body">
            {chartData.length === 0 ? (
              <div className="empty-state">No data yet for the past 7 days</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }}
                    formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                  <Bar dataKey="authorized" name="Authorized" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="unknown"    name="Unknown"    fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dashboard-bottom">
          {/* Camera Stream */}
          <div className="card camera-card">
            <div className="card-header">
              <span className="card-title">Live Camera</span>
              {!camError && <span className="dot-green" />}
            </div>
            {camError ? (
              <div className="cam-error">
                <span>📷</span>
                <p>Camera feed unavailable</p>
              </div>
            ) : (
              <img
                className="cam-stream"
                src={CAMERA_FEED_URL}
                alt="Live camera"
                onError={() => setCamError(true)}
              />
            )}
          </div>

          {/* Recent Detections */}
          <div className="card recent-card">
            <div className="card-header">
              <span className="card-title">Recent Detections</span>
            </div>
            <div className="recent-list">
              {recent.length === 0 && (
                <div className="empty-state">No detections yet</div>
              )}
              {recent.map((d) => (
                <div
                  key={d.id}
                  className="recent-row"
                  onClick={() => d.image_path && setPreview(`${IMAGE_BASE_URL}${d.image_path}`)}
                >
                  <div className="recent-thumb">
                    {d.image_path
                      ? <img src={`${IMAGE_BASE_URL}${d.image_path}`} alt="car" />
                      : <span>🚗</span>}
                  </div>
                  <div className="recent-info">
                    <span className="plate-number">{d.plate_number}</span>
                    <span className="recent-time">{d.created_at}</span>
                  </div>
                  <span className={`status-tag ${statusClass(d.status)}`}>{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal-img-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreview(null)}>✕</button>
            <img src={preview} alt="Detection" className="modal-img" />
          </div>
        </div>
      )}
    </Layout>
  );
}
