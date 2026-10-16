/* eslint-disable no-unused-vars */
/**
 * Google Apps Script for Townhall Customer (Salesforce)
 * สำนักงานไปรษณีย์เขต 6 (ปข.6)
 * 
 * -----------------------------------------------------------------
 * คำแนะนำการติดตั้ง:
 * 1. เปิด Google Sheet ที่เก็บข้อมูล Customer
 * 2. เมนู "ส่วนขยาย" (Extensions) -> เลือก "Apps Script"
 * 3. ลบโค้ดเดิมใน Code.gs ทั้งหมด แล้วคัดลอกโค้ดนี้ไปวาง
 * 4. กดบันทึก (รูปแผ่นดิสก์ หรือ Ctrl + S)
 * 5. กดปุ่มสีน้ำเงินมุมขวาบน "ทำให้ใช้งานได้" (Deploy) -> "การนำไปใช้งานใหม่" (New deployment)
 * 6. เลือกประเภท: "เว็บแอป" (Web app)
 *    - คำอธิบาย: Salesforce Status API
 *    - ดำเนินการในฐานะ (Execute as): "ฉัน" (Me)
 *    - ผู้มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone) **สำคัญมาก**
 * 7. กด "ทำให้ใช้งานได้" (Deploy) แล้วคัดลอก Web App URL (ลงท้ายด้วย /exec)
 * 8. นำ URL มาใส่ในเมนู "ตั้งค่า Google Sheet" บนหน้าเว็บ
 * -----------------------------------------------------------------
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
