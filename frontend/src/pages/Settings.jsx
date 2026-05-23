import { useEffect, useState } from 'react';
import { fetchSettings, saveSettings, testTelegram } from '../api/client';
import Layout from '../components/Layout';

const SectionTitle = ({ icon, title, sub }) => (
  <div className="settings-section-title">
    <span className="settings-section-icon">{icon}</span>
    <div>
      <div className="settings-section-name">{title}</div>
      {sub && <div className="settings-section-sub">{sub}</div>}
    </div>
  </div>
);

export default function Settings() {
  const [form, setForm] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    cooldown_minutes: 30,
    esp32_stream_url: 'http://192.168.1.4:81/stream',
  });
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [saveErr, setSaveErr]     = useState('');
  const [testMsg, setTestMsg]     = useState('');
  const [testErr, setTestErr]     = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then(r => setForm(f => ({ ...f, ...r.data })))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveMsg(''); setSaveErr('');
    setSaving(true);
    try {
      await saveSettings(form);
      setSaveMsg('✔ Settings saved successfully!');
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestMsg(''); setTestErr('');
    setTesting(true);
    try {
      const r = await testTelegram({
        telegram_bot_token: form.telegram_bot_token,
        telegram_chat_id:   form.telegram_chat_id,
      });
      setTestMsg(r.data.message || '✔ Test message sent!');
    } catch (err) {
      setTestErr(err.response?.data?.error || 'Test failed. Check your bot token and chat ID.');
    } finally {
      setTesting(false);
    }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  if (loading) {
    return (
      <Layout>
        <div className="page">
          <div className="loading-state" style={{ marginTop: 80 }}><span className="spinner-lg" /></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Settings</h2>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          {/* ── Telegram ── */}
          <div className="card settings-card">
            <div className="card-header">
              <SectionTitle
                icon="✈"
                title="Telegram Alerts"
                sub="Send instant notifications for unknown vehicles"
              />
              <span className={`status-tag ${form.telegram_bot_token && form.telegram_chat_id ? 'tag-authorized' : 'tag-unknown'}`}>
                {form.telegram_bot_token && form.telegram_chat_id ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <div className="settings-body">
              <div className="settings-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Bot Token</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder="123456:ABC-DEFxyz..."
                      value={form.telegram_bot_token}
                      onChange={e => set('telegram_bot_token', e.target.value)}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      className="token-toggle"
                      onClick={() => setShowToken(s => !s)}
                      title={showToken ? 'Hide' : 'Show'}
                    >
                      {showToken ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Chat ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 987654321"
                    value={form.telegram_chat_id}
                    onChange={e => set('telegram_chat_id', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ width: 160 }}>
                  <label>Alert Cooldown (min)</label>
                  <input
                    type="number"
                    min="1" max="1440"
                    value={form.cooldown_minutes}
                    onChange={e => set('cooldown_minutes', parseInt(e.target.value) || 30)}
                  />
                </div>
              </div>

              <div className="settings-hint">
                <span className="hint-icon">ℹ</span>
                <span>
                  Create a bot via <strong>@BotFather</strong> on Telegram. Get your Chat ID from <strong>@userinfobot</strong>.
                  Cooldown prevents duplicate alerts for the same plate within the set period.
                </span>
              </div>

              {testMsg && <div className="alert-success">{testMsg}</div>}
              {testErr && <div className="alert-error">{testErr}</div>}

              <button
                type="button"
                className="btn-secondary"
                onClick={handleTest}
                disabled={testing || !form.telegram_bot_token || !form.telegram_chat_id}
              >
                {testing ? <><span className="spinner" /> Sending…</> : '⚡ Send Test Message'}
              </button>
            </div>
          </div>

          {/* ── Camera ── */}
          <div className="card settings-card">
            <div className="card-header">
              <SectionTitle
                icon="◉"
                title="Camera Configuration"
                sub="ESP32-S3 Eye stream endpoint"
              />
            </div>
            <div className="settings-body">
              <div className="form-group">
                <label>ESP32 Stream URL</label>
                <input
                  type="url"
                  placeholder="http://192.168.1.x:81/stream"
                  value={form.esp32_stream_url}
                  onChange={e => set('esp32_stream_url', e.target.value)}
                />
              </div>
              <div className="settings-hint">
                <span className="hint-icon">ℹ</span>
                <span>This is the MJPEG stream URL served by the ESP32. Changing it here updates the proxy used by the dashboard and camera page.</span>
              </div>
            </div>
          </div>

          {/* ── Save Bar ── */}
          <div className="settings-save-bar">
            {saveMsg && <div className="alert-success">{saveMsg}</div>}
            {saveErr && <div className="alert-error">{saveErr}</div>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : '💾 Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
