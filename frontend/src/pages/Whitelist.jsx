import { useEffect, useState } from 'react';
import { fetchVehicles, addVehicle, deleteVehicle } from '../api/client';
import Layout from '../components/Layout';

const VEHICLE_TYPES = ['', 'Sedan', 'SUV', 'Pickup', 'Van', 'Truck', 'Motorcycle', 'Other'];

export default function Whitelist() {
  const [vehicles, setVehicles]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [form, setForm]             = useState({
    plate_number: '', owner_name: '', vehicle_type: '', notes: ''
  });
  const [formError, setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]         = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchVehicles();
      setVehicles(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (!form.plate_number.trim()) {
      setFormError('Plate number is required');
      return;
    }
    setSubmitting(true);
    try {
      await addVehicle(form);
      setFormSuccess(`✔ Plate "${form.plate_number.toUpperCase()}" added successfully!`);
      setForm({ plate_number: '', owner_name: '', vehicle_type: '', notes: '' });
      await load(); // reload table immediately
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to add vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (plate) => {
    if (!window.confirm(`Remove "${plate}" from whitelist?`)) return;
    try {
      await deleteVehicle(plate);
      setVehicles(v => v.filter(x => x.plate_number !== plate));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const filtered = vehicles.filter(v =>
    v.plate_number?.toLowerCase().includes(search.toLowerCase()) ||
    v.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.vehicle_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Whitelist</h2>
          <span className="page-count">{vehicles.length} vehicles</span>
        </div>

        <div className="whitelist-grid">
          {/* Add Form */}
          <div className="card add-card">
            <div className="card-header">
              <span className="card-title">Add Vehicle</span>
            </div>
            <form onSubmit={handleAdd} className="add-form">
              {formError   && <div className="alert-error">{formError}</div>}
              {formSuccess && <div className="alert-success">{formSuccess}</div>}

              <div className="form-group">
                <label>Plate Number *</label>
                <input
                  type="text"
                  placeholder="e.g. N 22221"
                  value={form.plate_number}
                  onChange={e => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Owner Name</label>
                <input
                  type="text"
                  placeholder="Vehicle owner"
                  value={form.owner_name}
                  onChange={e => setForm({ ...form, owner_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Vehicle Type</label>
                <select
                  value={form.vehicle_type}
                  onChange={e => setForm({ ...form, vehicle_type: e.target.value })}
                  className="form-select"
                >
                  {VEHICLE_TYPES.map(t => (
                    <option key={t} value={t}>{t || '— Select type —'}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary btn-block" disabled={submitting}>
                {submitting ? <span className="spinner" /> : '+ Add to Whitelist'}
              </button>
            </form>
          </div>

          {/* Vehicle Table */}
          <div className="card table-card">
            <div className="card-header">
              <span className="card-title">Known Vehicles</span>
              <input
                className="search-input"
                type="text"
                placeholder="Search plate, owner, type..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="loading-state"><span className="spinner-lg" /></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plate</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Notes</th>
                    <th>Added</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan="6" className="empty-cell">No whitelisted vehicles</td></tr>
                  )}
                  {filtered.map(v => (
                    <tr key={v.plate_number} className="table-row">
                      <td><span className="plate-badge">{v.plate_number}</span></td>
                      <td>{v.owner_name || '—'}</td>
                      <td>
                        {v.vehicle_type
                          ? <span className="type-badge">{v.vehicle_type}</span>
                          : '—'}
                      </td>
                      <td className="td-notes">{v.notes || '—'}</td>
                      <td className="td-time">{v.created_at || v.added_at || '—'}</td>
                      <td>
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(v.plate_number)}
                          title="Remove"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
