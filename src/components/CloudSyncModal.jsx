import { useState } from 'react';
import { storageService, APPS_SCRIPT_CODE } from '../services/storageService';

export default function CloudSyncModal({
  isOpen,
  onClose,
  statusMap,
  setStatusMap,
  gasUrl,
  setGasUrl,
  onSyncNow,
  isSyncing,
  lastSyncTime
}) {
  const [activeTab, setActiveTab] = useState('connection');
  const [inputUrl, setInputUrl] = useState(gasUrl || '');
  const [testStatus, setTestStatus] = useState(null); // { type: 'loading'|'success'|'error', message: '' }
  const [copied, setCopied] = useState(false);
  const [autoSync, setAutoSync] = useState(() => storageService.isAutoSyncEnabled());
  const [importMessage, setImportMessage] = useState(null);

  if (!isOpen) return null;

  const handleSaveUrl = () => {
    const trimmed = inputUrl.trim();
    storageService.setGasUrl(trimmed);
    setGasUrl(trimmed);
    storageService.setAutoSyncEnabled(autoSync);
    if (trimmed) {
      onSyncNow(trimmed);
    }
  };

  const handleTestConnection = async () => {
    if (!inputUrl.trim()) {
      setTestStatus({ type: 'error', message: 'กรุณากรอก Web App URL ก่อนทดสอบ' });
      return;
    }
    setTestStatus({ type: 'loading', message: 'กำลังทดสอบเชื่อมต่อกับ Google Apps Script...' });
    try {
      const data = await storageService.fetchCloudStatuses(inputUrl.trim());
      const count = Object.keys(data).length;
      setTestStatus({
        type: 'success',
        message: `เชื่อมต่อสำเร็จ! ดึงสถานะจาก Google Sheet ได้ ${count.toLocaleString()} รายการ`
      });
    } catch (err) {
      setTestStatus({
        type: 'error',
        message: `ไม่สามารถเชื่อมต่อได้: ${err.message || 'โปรดตรวจสอบว่าตั้งค่าสิทธิ์เข้าถึงเป็น "ทุกคน (Anyone)" แล้ว'}`
      });
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleExportBackup = () => {
    storageService.exportBackupJson(statusMap);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await storageService.importBackupJson(file);
      const count = Object.keys(imported).length;
      const merged = { ...statusMap, ...imported };
      setStatusMap(merged);
      storageService.saveLocalStatuses(merged);
      setImportMessage({ type: 'success', message: `นำเข้าข้อมูลสำเร็จ ${count} รายการ!` });
      setTimeout(() => setImportMessage(null), 4000);
    } catch (err) {
      setImportMessage({ type: 'error', message: `เกิดข้อผิดพลาด: ${err.message}` });
      setTimeout(() => setImportMessage(null), 4000);
    }
    e.target.value = '';
  };

  const handlePushAllToCloud = async () => {
    if (!gasUrl) {
      alert('กรุณาบันทึก Web App URL ก่อน');
      return;
    }
    const items = Object.entries(statusMap).map(([rowIdx, val]) => ({
      rowIdx,
      status: typeof val === 'object' ? val.status : val,
      accountName: typeof val === 'object' ? val.accountName : '',
      province: typeof val === 'object' ? val.province : '',
      poName: typeof val === 'object' ? val.poName : '',
      zip: typeof val === 'object' ? val.zip : ''
    }));

    if (!items.length) {
      alert('ยังไม่มีข้อมูลสถานะที่บันทึกไว้ในเครื่อง');
      return;
    }

    setTestStatus({ type: 'loading', message: `กำลังส่งข้อมูล ${items.length} รายการขึ้น Google Sheet...` });
    try {
      await storageService.batchSyncToCloud(gasUrl, items);
      setTestStatus({ type: 'success', message: `ส่งข้อมูล ${items.length} รายการขึ้น Google Sheet เรียบร้อยแล้ว!` });
      onSyncNow();
    } catch (err) {
      setTestStatus({ type: 'error', message: `เกิดข้อผิดพลาดในการส่งข้อมูล: ${err.message}` });
    }
  };

  const totalLocalUpdated = Object.keys(statusMap).length;

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div className="modal-dialog-custom" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header-custom">
          <div>
            <h5 className="modal-title-custom">
              ☁️ ระบบบันทึกและแชร์ข้อมูลส่วนกลาง (Cloud Sync)
            </h5>
            <p className="modal-subtitle-custom">
              เชื่อมต่อ Google Sheets เพื่อให้เจ้าหน้าที่ทุกคนดูและอัปเดตสถานะพร้อมกันได้จากทุกที่
            </p>
          </div>
          <button className="btn-close-custom" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Modal Tabs */}
        <div className="modal-tabs-custom">
          <button 
            className={`modal-tab-btn ${activeTab === 'connection' ? 'active' : ''}`}
            onClick={() => setActiveTab('connection')}
          >
            🔌 การเชื่อมต่อ Google Sheet
          </button>
          <button 
            className={`modal-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            📋 วิธีติดตั้งโค้ด (4 ขั้นตอน)
          </button>
          <button 
            className={`modal-tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            💾 สำรองข้อมูล ({totalLocalUpdated})
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-custom">
          {activeTab === 'connection' && (
            <div className="tab-pane-content">
              <div className="alert-info-custom mb-3">
                <strong>💡 การทำงาน:</strong> เมื่อเชื่อมต่อแล้ว ทุกครั้งที่มีการเปลี่ยนสถานะ ระบบจะบันทึกทั้งในเครื่องและส่งขึ้น <strong>Google Sheet</strong> ทันที ทำให้ทุกคนที่เปิดเว็บนี้เห็นข้อมูลอัปเดตตรงกันเสมอ
              </div>

              <div className="mb-3">
                <label className="form-label-custom">
                  Google Apps Script Web App URL
                </label>
                <div className="d-flex gap-2">
                  <input
                    type="url"
                    className="form-control-custom flex-grow-1"
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                  />
                  <button 
                    className="btn btn-outline-secondary btn-sm-custom"
                    onClick={handleTestConnection}
                    disabled={testStatus?.type === 'loading'}
                  >
                    {testStatus?.type === 'loading' ? '⏳ ตรวจสอบ...' : '🔍 ทดสอบ'}
                  </button>
                </div>
                <div className="form-text text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                  * นำ URL ที่ได้จากการ Deploy Google Apps Script (ดูขั้นตอนในแท็บ "วิธีติดตั้งโค้ด") มาวางที่นี่
                </div>
              </div>

              {testStatus && (
                <div className={`status-box-custom ${testStatus.type} mb-3`}>
                  {testStatus.type === 'loading' && <span>🔄 </span>}
                  {testStatus.type === 'success' && <span>✅ </span>}
                  {testStatus.type === 'error' && <span>❌ </span>}
                  {testStatus.message}
                </div>
              )}

              <div className="options-card mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div>
                    <div className="fw-semibold">ซิงค์อัตโนมัติ (Auto-Sync)</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                      ดึงข้อมูลอัปเดตล่าสุดจากเพื่อนร่วมงานทุก 30 วินาที
                    </div>
                  </div>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={autoSync}
                      onChange={e => setAutoSync(e.target.checked)}
                      id="autoSyncSwitch"
                    />
                  </div>
                </div>

                <div className="text-muted" style={{ fontSize: '0.8rem', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                  สถานะการซิงค์ล่าสุด: {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('th-TH') : 'ยังไม่มีการซิงค์'}
                </div>
              </div>

              <div className="d-flex gap-2 justify-content-between align-items-center pt-2">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={handlePushAllToCloud}
                  disabled={!gasUrl || totalLocalUpdated === 0 || testStatus?.type === 'loading'}
                  title="ส่งรายการที่บันทึกไว้ในเครื่องขึ้น Google Sheet ทั้งหมด"
                >
                  ⬆️ ส่งข้อมูลในเครื่องขึ้น Cloud ทั้งหมด
                </button>

                <div className="d-flex gap-2">
                  <button className="btn btn-secondary btn-custom" onClick={onClose}>
                    ปิด
                  </button>
                  <button 
                    className="btn btn-primary btn-custom" 
                    onClick={handleSaveUrl}
                    disabled={isSyncing}
                  >
                    {isSyncing ? '⏳ กำลังซิงค์...' : '💾 บันทึกและซิงค์'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="tab-pane-content">
              <div className="guide-steps">
                <div className="guide-step-item">
                  <div className="step-number">1</div>
                  <div className="step-body">
                    <strong>เปิด Google Sheet ที่จัดเก็บข้อมูล Customer</strong>
                    <p className="text-muted mb-0">
                      ไปที่แถบเมนูด้านบน คลิก <strong>ส่วนขยาย (Extensions)</strong> &gt; เลือก <strong>Apps Script</strong>
                    </p>
                  </div>
                </div>

                <div className="guide-step-item">
                  <div className="step-number">2</div>
                  <div className="step-body">
                    <strong>วางโค้ด Apps Script</strong>
                    <p className="text-muted mb-1">
                      ลบโค้ดเดิมในไฟล์ <code>Code.gs</code> ออกทั้งหมด แล้วกดปุ่มด้านล่างเพื่อคัดลอกโค้ดไปวาง
                    </p>
                    <button 
                      className={`btn btn-sm ${copied ? 'btn-success' : 'btn-primary'} mb-2`}
                      onClick={handleCopyCode}
                    >
                      {copied ? '✅ คัดลอกโค้ดสำเร็จแล้ว!' : '📋 คลิกคัดลอกโค้ด Google Apps Script ทั้งหมด'}
                    </button>
                    <p className="text-muted mb-0" style={{ fontSize: '0.78rem' }}>
                      * จากนั้นกดบันทึก (Ctrl + S)
                    </p>
                  </div>
                </div>

                <div className="guide-step-item">
                  <div className="step-number">3</div>
                  <div className="step-body">
                    <strong>Deploy เป็น Web App</strong>
                    <p className="text-muted mb-1">
                      คลิกปุ่มสีน้ำเงินมุมบนขวา <strong>ทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong>การนำไปใช้งานใหม่ (New deployment)</strong>
                    </p>
                    <ul className="text-muted mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                      <li>คลิกรูปเฟืองเลือกประเภท: <strong>เว็บแอป (Web app)</strong></li>
                      <li>ดำเนินการในฐานะ (Execute as): <strong>ฉัน (Me)</strong></li>
                      <li>ผู้มีสิทธิ์เข้าถึง (Who has access): <strong className="text-danger">ทุกคน (Anyone)</strong> <span className="badge bg-danger text-white">สำคัญมาก</span></li>
                    </ul>
                  </div>
                </div>

                <div className="guide-step-item">
                  <div className="step-number">4</div>
                  <div className="step-body">
                    <strong>คัดลอก Web App URL มาใส่ในระบบ</strong>
                    <p className="text-muted mb-0">
                      กด <strong>Deploy</strong> แล้วคัดลอก <strong>Web app URL</strong> (ลงท้ายด้วย <code>/exec</code>) นำกลับมาวางในแท็บ <strong>"การเชื่อมต่อ Google Sheet"</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="code-preview-box mt-3">
                <div className="code-preview-header">
                  <span>ตัวอย่างโค้ดที่จะทำงานใน Google Sheet</span>
                  <button className="btn btn-xs btn-outline-light" onClick={handleCopyCode}>
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
                <pre className="code-preview-content">
                  {APPS_SCRIPT_CODE.slice(0, 500)}...
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="tab-pane-content">
              <div className="stats-box mb-3">
                <div className="row g-2 text-center">
                  <div className="col-4">
                    <div className="stat-card">
                      <div className="stat-num text-primary">{totalLocalUpdated}</div>
                      <div className="stat-label">บันทึกทั้งหมด</div>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="stat-card">
                      <div className="stat-num text-success">
                        {Object.values(statusMap).filter(v => (typeof v === 'object' ? v.status : v) === 'ดำเนินการแล้ว').length}
                      </div>
                      <div className="stat-label">ดำเนินการแล้ว</div>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="stat-card">
                      <div className="stat-num text-warning">
                        {Object.values(statusMap).filter(v => (typeof v === 'object' ? v.status : v) === 'กำลังดำเนินการ').length}
                      </div>
                      <div className="stat-label">กำลังดำเนินการ</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <h6>ดาวน์โหลดไฟล์สำรองข้อมูล (Export JSON)</h6>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  สำรองสถานะทั้งหมดที่บันทึกไว้ในเครื่องลงไฟล์คอมพิวเตอร์ของคุณ ป้องกันข้อมูลสูญหาย
                </p>
                <button className="btn btn-outline-primary btn-sm-custom" onClick={handleExportBackup}>
                  📥 ดาวน์โหลดไฟล์สำรอง (Backup JSON)
                </button>
              </div>

              <div className="mb-3 border-top pt-3">
                <h6>นำเข้าข้อมูลจากไฟล์สำรอง (Import JSON)</h6>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  กู้คืนสถานะจากไฟล์สำรอง หรือนำเข้าสถานะจากเครื่องเพื่อนร่วมงาน
                </p>
                <label className="btn btn-outline-secondary btn-sm-custom">
                  📤 เลือกไฟล์สำรอง (.json)
                  <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
                </label>
                {importMessage && (
                  <div className={`mt-2 text-${importMessage.type === 'success' ? 'success' : 'danger'}`} style={{ fontSize: '0.85rem' }}>
                    {importMessage.message}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
