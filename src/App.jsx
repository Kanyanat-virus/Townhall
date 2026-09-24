import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import './index.css';

function App() {
  const [allData, setAllData] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters state
  const [limit, setLimit] = useState('50');
  const [province, setProvince] = useState('');
  const [po, setPo] = useState('');
  const [zip, setZip] = useState('');
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');
  const [diff, setDiff] = useState('');
  const [searchName, setSearchName] = useState('');
  
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRhmcXDUOIXt8Hs2CMbRF9v6sEZ8-ugBel8q3QgeoWQT5yhxUAv10UrBmbzvKx0TeIaO0K-hO9tifk/pub?output=csv';
        
        Papa.parse(csvUrl, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const parsedData = results.data;
            const mappedData = [];
            
            for (let i = 0; i < parsedData.length; i++) {
              const row = parsedData[i];
              const prov = row['Province'] ? row['Province'].trim() : "";
              if (!prov) continue;
              
              const spend2025 = parseFloat(row['Spending (2025)']) || 0;
              const spend2026 = parseFloat(row['Spending (2026)']) || 0;
              const spendDiff = parseFloat(row['Spending Difference']) || 0;
              
              let diffPercent = 0;
              if (spend2025 !== 0) {
                diffPercent = (spendDiff / spend2025) * 100;
              }

              const accountKey = Object.keys(row).find(k => k.includes('Account Name') || k.includes('ชื่อเต็ม')) || 'Account Name';
              const rawAccountName = (row[accountKey] || "").trim();
              
              let censoredName = "";
              if (rawAccountName) {
                const parts = rawAccountName.split(/\s+/).filter(Boolean);
                const isEnglish = /^[a-zA-Z]/.test(rawAccountName);

                if (isEnglish) {
                  if (parts.length === 1) {
                    censoredName = parts[0].substring(0, 5) + '***';
                  } else if (parts.length === 2) {
                    censoredName = parts[0].substring(0, 5) + '*** ' + parts[1].substring(0, 5) + '***';
                  } else {
                    // มากกว่า 2 วรรค: แสดงวรรค 1 และ วรรค 3
                    censoredName = parts[0].substring(0, 5) + '*** ' + parts[2].substring(0, 5) + '***';
                  }
                } else {
                  // ภาษาไทย: ชื่อ นามสกุล อย่างละ 3 ตัวอักษร (สูงสุด 3 วรรค)
                  censoredName = parts.slice(0, 3).map(p => p.substring(0, 3) + '***').join(' ');
                }
              }

              mappedData.push({
                rowIdx: i + 2,
                province: prov,
                poName: row['Post Office Name'] ? row['Post Office Name'].trim() : "",
                zip: row['Zip Code'] ? row['Zip Code'].trim() : "",
                accountName: censoredName,
                fullAccountName: rawAccountName,
                tier: row['Membership Tier'] ? row['Membership Tier'].trim() : "Customer",
                spend2025: spend2025,
                spend2026: spend2026,
                diff: spendDiff,
                diffPercent: diffPercent,
                salesforceStatus: row['Salesforce Status'] ? row['Salesforce Status'].trim() : ""
              });
            }
            
            setAllData(mappedData);
            setIsDataLoaded(true);
          },
          error: (error) => {
            setError(error.message);
          }
        });

      } catch (err) {
        setError(err.message);
      }
    };

    fetchData();

    const handleScroll = () => {
      if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusChange = (rowIdx, newStatus) => {
    setAllData(prevData => prevData.map(item => 
      item.rowIdx === rowIdx ? { ...item, salesforceStatus: newStatus } : item
    ));
  };

  const resetFilters = () => {
    setProvince('');
    setPo('');
    setZip('');
    setTier('');
    setStatus('');
    setDiff('');
    setSearchName('');
    setLimit('50');
  };

  // 1. ทำให้ตัวกรองสัมพันธ์กัน
  // ล้างค่า PO และ Zip เมื่อเปลี่ยน Province
  useEffect(() => {
    setPo('');
    setZip('');
  }, [province]);

  // ล้างค่า Zip เมื่อเปลี่ยน PO
  useEffect(() => {
    setZip('');
  }, [po]);

  const provinces = useMemo(() => [...new Set(allData.map(item => item.province))].filter(Boolean).sort(), [allData]);
  
  const pos = useMemo(() => {
    let filtered = allData;
    if (province) filtered = filtered.filter(item => item.province === province);
    return [...new Set(filtered.map(item => item.poName))].filter(Boolean).sort();
  }, [allData, province]);
  
  const zips = useMemo(() => {
    let filtered = allData;
    if (province) filtered = filtered.filter(item => item.province === province);
    if (po) filtered = filtered.filter(item => item.poName === po);
    return [...new Set(filtered.map(item => item.zip))].filter(Boolean).sort();
  }, [allData, province, po]);

  const tiers = useMemo(() => [...new Set(allData.map(item => item.tier))].filter(Boolean).sort(), [allData]);

  // Derived filtered data
  const filteredData = useMemo(() => {
    if (!isDataLoaded) return [];

    let filtered = allData.filter(item => {
      let matchDiff = true;
      if (diff === 'up') matchDiff = item.diffPercent > 0;
      if (diff === 'down-slight') matchDiff = item.diffPercent <= 0 && item.diffPercent >= -20;
      if (diff === 'down-heavy') matchDiff = item.diffPercent < -20;

      let matchStatus = true;
      if (status === 'ยังไม่ระบุ') matchStatus = (item.salesforceStatus === '' || !item.salesforceStatus);
      else if (status) matchStatus = (item.salesforceStatus === status);

      return (!province || item.province === province) &&
             (!po || item.poName === po) &&
             (!zip || item.zip == zip) &&
             (!tier || item.tier === tier) &&
             (!searchName || item.fullAccountName.toLowerCase().includes(searchName.toLowerCase())) &&
             matchStatus &&
             matchDiff;
    });

    // เรียงลำดับตาม Spend 2025 มากไปน้อย (Descending)
    filtered.sort((a, b) => b.spend2025 - a.spend2025);

    return filtered;
  }, [allData, isDataLoaded, province, po, zip, tier, searchName, status, diff]);

  // Derived summary data
  const summaryData = useMemo(() => {
    const total = filteredData.length;
    const done = filteredData.filter(d => d.salesforceStatus === 'ดำเนินการแล้ว').length;
    const prog = filteredData.filter(d => d.salesforceStatus === 'กำลังดำเนินการ').length;
    const fail = filteredData.filter(d => d.salesforceStatus === 'ไม่สามารถดำเนินการได้').length;
    const empty = total - (done + prog + fail);
    return { total, done, prog, fail, empty };
  }, [filteredData]);

  // Apply limit
  const displayData = useMemo(() => {
    if (limit !== 'all') {
      return filteredData.slice(0, parseInt(limit));
    }
    return filteredData;
  }, [filteredData, limit]);

  return (
    <div className="container-fluid">
      <h2 className="page-title mb-4">Customer (Salesforce)</h2>

      {/* Summary Boxes */}
      <div className="summary-wrapper" id="summary-boxes">
        <div className="summary-pill summary-all"><span>รายชื่อทั้งหมด</span> <span className="summary-count">{summaryData.total}</span></div>
        <div className="summary-pill summary-done"><span>ดำเนินการแล้ว</span> <span className="summary-count">{summaryData.done}</span></div>
        <div className="summary-pill summary-prog"><span>กำลังดำเนินการ</span> <span className="summary-count">{summaryData.prog}</span></div>
        <div className="summary-pill summary-fail"><span>ไม่สามารถดำเนินการได้</span> <span className="summary-count">{summaryData.fail}</span></div>
        <div className="summary-pill summary-empty"><span>ยังไม่ได้ระบุ</span> <span className="summary-count">{summaryData.empty}</span></div>
      </div>

      <div className="main-glass-card">
        {/* Filters */}
        <div className="filters-container">
          <select value={limit} onChange={(e) => setLimit(e.target.value)} className="pill-input">
            <option value="50">แสดง 50 รายชื่อ</option>
            <option value="100">แสดง 100 รายชื่อ</option>
            <option value="200">แสดง 200 รายชื่อ</option>
            <option value="all">แสดงทั้งหมด</option>
          </select>
          
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="pill-input">
            <option value="">Province</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={po} onChange={(e) => setPo(e.target.value)} className="pill-input">
            <option value="">Post Office</option>
            {pos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={zip} onChange={(e) => setZip(e.target.value)} className="pill-input">
            <option value="">Zip Code</option>
            {zips.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="pill-input">
            <option value="">Membership Tier</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="pill-input">
            <option value="">สถานะ Salesforce</option>
            <option value="ดำเนินการแล้ว">ดำเนินการแล้ว</option>
            <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
            <option value="ไม่สามารถดำเนินการได้">ไม่สามารถดำเนินการได้</option>
            <option value="ยังไม่ระบุ">ยังไม่ระบุ</option>
          </select>

          <select value={diff} onChange={(e) => setDiff(e.target.value)} className="pill-input">
            <option value="">Spending %</option>
            <option value="up">ยอดเพิ่มขึ้น (&gt; 0%)</option>
            <option value="down-slight">ยอดตกลง (0% ถึง -20%)</option>
            <option value="down-heavy">ยอดตกหนัก (ต่ำกว่า -20%)</option>
          </select>

          <input 
            type="text" 
            value={searchName} 
            onChange={(e) => setSearchName(e.target.value)} 
            className="pill-input search-box" 
            placeholder="🔍 ค้นหา Account Name..." 
          />
          
          <button onClick={resetFilters} className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{width: '38px', height: '38px', padding: 0}} title="รีเซ็ตตัวกรอง">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
            </svg>
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table custom-table align-middle mb-0">
            <thead>
              <tr>
                <th className="text-center" style={{width: '4%'}}>ลำดับที่</th>
                <th style={{width: '8%'}}>Province</th>
                <th style={{width: '9%'}}>Post Office</th>
                <th className="text-center" style={{width: '6%'}}>Zip Code</th>
                <th style={{width: '13%'}}>Account Name</th>
                <th className="text-center" style={{width: '9%'}}>Tier</th>
                <th className="text-end" style={{width: '10%'}}>Spend 2025</th>
                <th className="text-end" style={{width: '10%'}}>Spend 2026</th>
                <th className="text-end" style={{width: '10%'}}>Spending Diff.</th>
                <th className="text-end" style={{width: '6%'}}>% Diff</th>
                <th className="text-center" style={{width: '15%'}}>สถานะ Salesforce</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan="11" className="text-center text-danger py-4">❌ โหลดข้อมูลไม่สำเร็จ: {error}</td></tr>
              ) : !isDataLoaded ? (
                <tr><td colSpan="11" className="text-center py-5 text-muted">⏳ กำลังโหลดข้อมูลระบบ...</td></tr>
              ) : displayData.length === 0 ? (
                <tr><td colSpan="11" className="text-center py-4 text-muted">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>
              ) : (
                displayData.map((item, index) => {
                  let tierClass = 'tier-customer';
                  if (item.tier === 'Red Box') tierClass = 'tier-red-box';
                  if (item.tier === 'Platinum Box') tierClass = 'tier-platinum-box';

                  let diffColor = item.diffPercent >= 0 ? 'text-success' : 'text-danger';

                  let selectClass = 'status-select ';
                  if (item.salesforceStatus === 'ดำเนินการแล้ว') selectClass += 'done';
                  else if (item.salesforceStatus === 'กำลังดำเนินการ') selectClass += 'progress';
                  else if (item.salesforceStatus === 'ไม่สามารถดำเนินการได้') selectClass += 'fail';
                  else selectClass += 'empty';

                  return (
                    <tr key={item.rowIdx}>
                      <td className="text-center text-muted">{index + 1}</td>
                      <td>{item.province}</td>
                      <td title={item.poName}>{item.poName}</td>
                      <td className="text-center">{item.zip}</td>
                      <td className="fw-medium td-account" title={item.accountName}>{item.accountName}</td>
                      <td className="text-center"><span className={`tier-badge ${tierClass}`}>{item.tier}</span></td>
                      <td className="text-end">{item.spend2025.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="text-end">{item.spend2026.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`text-end ${diffColor}`}>{item.diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`text-end ${diffColor} fw-bold`}>{item.diffPercent.toFixed(2)}%</td>
                      <td>
                        <select 
                          className={selectClass} 
                          value={item.salesforceStatus || ""}
                          onChange={(e) => handleStatusChange(item.rowIdx, e.target.value)}
                        >
                          <option value="">- เลือกสถานะ -</option>
                          <option value="ดำเนินการแล้ว">ดำเนินการแล้ว</option>
                          <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
                          <option value="ไม่สามารถดำเนินการได้">ไม่สามารถดำเนินการได้</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showScrollTop && (
        <button type="button" className="btn" id="btn-back-to-top" onClick={scrollToTop} style={{ display: 'block' }}>
          ↑ ขึ้นบนสุด
        </button>
      )}
    </div>
  );
}

export default App;
