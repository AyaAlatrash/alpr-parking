import { useEffect, useState, useCallback } from 'react';
import { fetchDetections, deleteDetection, IMAGE_BASE_URL } from '../api/client';
import Layout from '../components/Layout';

const STATUS_OPTIONS = ['', 'AUTHORIZED', 'UNKNOWN'];

export default function Detections() {
  const [detections, setDetections] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [status, setStatus]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [preview, setPreview]       = useState(null);
  const [deleting, setDeleting]     = useState(null); // id being deleted
  const perPage = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (status) params.status = status;
      const { data } = await fetchDetections(params);
      setDetections(data.detections);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleFilter = (s) => {
    setStatus(s);
    setPage(1);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this detection record?')) return;
    setDeleting(id);
    try {
      await deleteDetection(id);
      setDetections(prev => prev.filter(d => d.id !== id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete detection');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Detection Log</h2>
          <span className="page-count">{total} records</span>
        </div>

        {/* Filter Pills */}
        <div className="filter-row">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              className={`filter-pill${status === s ? ' active' : ''}`}
              onClick={() => handleFilter(s)}
            >
              {s === '' ? 'All' : s === 'AUTHORIZED' ? '✔ Authorized' : '⚠ Unknown'}
            </button>
          ))}
          <button className="btn-sm btn-refresh" onClick={load} title="Refresh">↻ Refresh</button>
        </div>

        {/* Table */}
        <div className="card table-card">
          {loading ? (
            <div className="loading-state"><span className="spinner-lg" /></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Image</th>
                  <th>Plate</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {detections.length === 0 && (
                  <tr><td colSpan="7" className="empty-cell">No detections found</td></tr>
                )}
                {detections.map((d) => (
                  <tr key={d.id} className="table-row">
                    <td className="td-id">{d.id}</td>
                    <td className="td-img">
                      {d.image_path ? (
                        <img
                          src={`${IMAGE_BASE_URL}${d.image_path}`}
                          alt="car"
                          className="thumb"
                          onClick={() => setPreview(`${IMAGE_BASE_URL}${d.image_path}`)}
                        />
                      ) : <span className="no-img">—</span>}
                    </td>
                    <td className="td-plate">
                      <span className="plate-badge">{d.plate_number}</span>
                    </td>
                    <td>
                      <span className={`status-tag ${d.status === 'AUTHORIZED' ? 'tag-authorized' : 'tag-unknown'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="td-conf">
                      <div className="conf-bar-wrap">
                        <div
                          className="conf-bar"
                          style={{ width: `${Math.min(d.confidence, 100)}%` }}
                        />
                        <span className="conf-value">{d.confidence?.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="td-time">{d.created_at}</td>
                    <td>
                      <button
                        className="btn-delete"
                        title="Delete record"
                        disabled={deleting === d.id}
                        onClick={() => handleDelete(d.id)}
                      >
                        {deleting === d.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '✕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >← Prev</button>
          <span className="page-info">Page {page} of {totalPages}</span>
          <button
            className="page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >Next →</button>
        </div>
      </div>

      {/* Preview Modal */}
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
