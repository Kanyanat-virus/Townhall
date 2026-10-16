/**
 * Storage Service for Customer (Salesforce) Dashboard
 * Handles LocalStorage caching and Google Apps Script Cloud synchronization
 */

const STORAGE_KEYS = {
  STATUSES: 'townhall_salesforce_status_map',
  GAS_URL: 'townhall_gas_url',
  LAST_SYNC: 'townhall_last_sync_time',
  AUTO_SYNC: 'townhall_auto_sync_enabled'
};

export const APPS_SCRIPT_CODE = `/**
 * Google Apps Script for Townhall Customer (Salesforce)
 * สำนักงานไปรษณีย์เขต 6 (ปข.6)
 * 
 * สคริปต์นี้ใช้สำหรับจัดเก็บและแชร์สถานะ Salesforce ระหว่างทุกคนในองค์กร
 * ข้อมูลจะถูกบันทึกไว้ในแท็บ "Status_Updates" ภายใน Google Sheet นี้โดยอัตโนมัติ
 */

const STATUS_SHEET_NAME = "Status_Updates";

// สร้างหรือเรียกแท็บเก็บข้อมูลสถานะ
function getOrCreateStatusSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATUS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATUS_SHEET_NAME);
    sheet.appendRow([
      "Row Index", 
      "Account Name", 
      "Province", 
      "Post Office", 
      "Zip Code", 
      "Salesforce Status", 
      "Updated At",
      "User / Source"
    ]);
    sheet.getRange(1, 1, 1, 8)
      .setFontWeight("bold")
      .setBackground("#e0f2fe")
      .setFontColor("#0369a1");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 90);
    sheet.setColumnWidth(6, 160);
    sheet.setColumnWidth(7, 180);
    sheet.setColumnWidth(8, 140);
  }
  return sheet;
}

// 1. รับคำขอ GET: ดึงข้อมูลสถานะทั้งหมด หรือ อัปเดตรายการ
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "getAll";

    // รองรับการอัปเดตผ่าน GET เพื่อความเข้ากันได้ 100% กับเบราว์เซอร์
    if (action === "update") {
      return handleUpdate(e.parameter);
    }

    // ค่าเริ่มต้น: ดึงสถานะทั้งหมดที่บันทึกไว้
    const sheet = getOrCreateStatusSheet();
    const lastRow = sheet.getLastRow();
    const result = {};

    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      for (let i = 0; i < data.length; i++) {
        const rowIdx = String(data[i][0]).trim();
        const accountName = String(data[i][1] || "").trim();
        const province = String(data[i][2] || "").trim();
        const poName = String(data[i][3] || "").trim();
        const zip = String(data[i][4] || "").trim();
        const status = String(data[i][5] || "").trim();
        const updatedAt = data[i][6];
        
        if (rowIdx) {
          result[rowIdx] = {
            status: status,
            accountName: accountName,
            province: province,
            poName: poName,
            zip: zip,
            updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString()
          };
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      count: Object.keys(result).length,
      data: result,
      serverTime: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. รับคำขอ POST: บันทึกข้อมูลสถานะ
function doPost(e) {
  try {
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    }

    if (payload.action === "batchUpdate" && Array.isArray(payload.items)) {
      return handleBatchUpdate(payload.items);
    }

    return handleUpdate(payload);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันบันทึกรายการเดี่ยว
function handleUpdate(params) {
  const rowIdx = String(params.rowIdx || "").trim();
  const status = String(params.status || "").trim();
  const accountName = String(params.accountName || "").trim();
  const province = String(params.province || "").trim();
  const poName = String(params.poName || "").trim();
  const zip = String(params.zip || "").trim();
  const now = new Date();

  if (!rowIdx) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Missing rowIdx"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = getOrCreateStatusSheet();
  const lastRow = sheet.getLastRow();
  let foundRow = -1;

  if (lastRow > 1) {
    const rowIdxValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rowIdxValues.length; i++) {
      if (String(rowIdxValues[i][0]).trim() === rowIdx) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (foundRow > 0) {
    // อัปเดตแถวเดิม
    sheet.getRange(foundRow, 6).setValue(status);
    sheet.getRange(foundRow, 7).setValue(now);
    if (accountName) sheet.getRange(foundRow, 2).setValue(accountName);
  } else {
    // เพิ่มแถวใหม่
    sheet.appendRow([
      rowIdx,
      accountName,
      province,
      poName,
      zip,
      status,
      now,
      params.user || "Web User"
    ]);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    rowIdx: rowIdx,
    status: status,
    updatedAt: now.toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันบันทึกชุดข้อมูลหลายรายการพร้อมกัน (Batch Update)
function handleBatchUpdate(items) {
  const sheet = getOrCreateStatusSheet();
  const lastRow = sheet.getLastRow();
  const rowMap = {};

  if (lastRow > 1) {
    const rowIdxValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rowIdxValues.length; i++) {
      rowMap[String(rowIdxValues[i][0]).trim()] = i + 2;
    }
  }

  const newRows = [];
  const now = new Date();

  items.forEach(function(item) {
    const rIdx = String(item.rowIdx || "").trim();
    if (!rIdx) return;
    const existingRow = rowMap[rIdx];
    if (existingRow) {
      sheet.getRange(existingRow, 6).setValue(item.status || "");
      sheet.getRange(existingRow, 7).setValue(now);
    } else {
      newRows.push([
        rIdx,
        item.accountName || "",
        item.province || "",
        item.poName || "",
        item.zip || "",
        item.status || "",
        now,
        item.user || "Web User"
      ]);
      rowMap[rIdx] = lastRow + newRows.length;
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 8).setValues(newRows);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    updatedCount: items.length
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

// URL ค่าเริ่มต้นของ Google Apps Script Web App 
// (เมื่อใส่ URL ตรงนี้ ทุกคนที่เปิดเว็บจะเชื่อมต่อ Cloud อัตโนมัติทันที ไม่ต้องตั้งค่าเอง)
export const DEFAULT_GAS_URL = import.meta.env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbyxQ7cHLH4BxVSB-TkaYF-OnehhjxVpCypP8iveZWy9HLPpu6rYJgH9XnI7xXDXaRpt/exec';

export const storageService = {
  // อ่านข้อมูลสถานะทั้งหมดจาก LocalStorage
  getLocalStatuses() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STATUSES);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return {};
    }
  },

  // บันทึกสถานะทั้งหมดลง LocalStorage
  saveLocalStatuses(statusMap) {
    try {
      localStorage.setItem(STORAGE_KEYS.STATUSES, JSON.stringify(statusMap));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  },

  // ดึง URL ของ Google Apps Script Web App (ถ้าไม่มีใน LocalStorage ให้ใช้ค่าเริ่มต้นของระบบ)
  getGasUrl() {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_URL || '';
  },

  // บันทึก URL ของ Google Apps Script Web App
  setGasUrl(url) {
    const cleanUrl = (url || '').trim();
    localStorage.setItem(STORAGE_KEYS.GAS_URL, cleanUrl);
    return cleanUrl;
  },

  // เวลาซิงค์ล่าสุด
  getLastSyncTime() {
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNC) || null;
  },

  setLastSyncTime(time) {
    const val = time instanceof Date ? time.toISOString() : (time || new Date().toISOString());
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, val);
  },

  // ตรวจสอบ Auto-Sync
  isAutoSyncEnabled() {
    const val = localStorage.getItem(STORAGE_KEYS.AUTO_SYNC);
    return val === null ? true : val === 'true';
  },

  setAutoSyncEnabled(enabled) {
    localStorage.setItem(STORAGE_KEYS.AUTO_SYNC, enabled ? 'true' : 'false');
  },

  // ดึงข้อมูลสถานะล่าสุดจาก Google Apps Script Cloud
  async fetchCloudStatuses(gasUrl) {
    const targetUrl = gasUrl || this.getGasUrl();
    if (!targetUrl) throw new Error('ยังไม่ได้กำหนด URL ของ Google Apps Script');

    const sep = targetUrl.includes('?') ? '&' : '?';
    const requestUrl = `${targetUrl}${sep}action=getAll&_t=${Date.now()}`;

    const res = await fetch(requestUrl);
    if (!res.ok) {
      throw new Error(`Cloud response error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Cloud sync returned unsuccessful status');
    }
    return data.data || {};
  },

  // บันทึกสถานะ 1 รายการขึ้น Google Apps Script Cloud
  async saveStatusToCloud(gasUrl, { rowIdx, status, accountName, province, poName, zip }) {
    const targetUrl = gasUrl || this.getGasUrl();
    if (!targetUrl) throw new Error('ยังไม่ได้ระบุ Google Apps Script URL');

    const payload = {
      action: 'update',
      rowIdx,
      status,
      accountName: accountName || '',
      province: province || '',
      poName: poName || '',
      zip: zip || '',
      updatedAt: new Date().toISOString()
    };

    // วิธีที่ 1: ลองส่งด้วย POST (text/plain เลี่ยง preflight CORS)
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        return result;
      }
    } catch (postErr) {
      console.warn('POST failed, attempting fallback to GET update:', postErr);
    }

    // วิธีที่ 2 (Fallback): ส่งผ่าน GET query params (ทนทานต่อ CORS 100%)
    const params = new URLSearchParams({
      action: 'update',
      rowIdx: String(rowIdx),
      status: String(status),
      accountName: String(accountName || ''),
      province: String(province || ''),
      poName: String(poName || ''),
      zip: String(zip || ''),
      _t: String(Date.now())
    });

    const sep = targetUrl.includes('?') ? '&' : '?';
    const resGet = await fetch(`${targetUrl}${sep}${params.toString()}`);
    if (!resGet.ok) {
      throw new Error(`Failed to update cloud: HTTP ${resGet.status}`);
    }
    return await resGet.json();
  },

  // ซิงค์หลายรายการพร้อมกันขึ้น Cloud (สำหรับข้อมูลที่ยังไม่ได้ซิงค์)
  async batchSyncToCloud(gasUrl, items) {
    const targetUrl = gasUrl || this.getGasUrl();
    if (!targetUrl || !items.length) return;

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'batchUpdate',
          items: items
        })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Batch sync error:', e);
      throw e;
    }
  },

  // ส่งออกข้อมูลสำรองเป็นไฟล์ JSON
  exportBackupJson(statusMap) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(statusMap, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `salesforce_status_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  // นำเข้าข้อมูลจากไฟล์ JSON
  async importBackupJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }
};
