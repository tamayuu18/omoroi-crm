// ============================================================
// Foresma取込処理
// ============================================================

// ------------------------------------------------------------
// Foresma取込シートの列インデックス（1始まり → 0始まりに変換して使用）
// 列順: 取込ステータス, 取込日時, Foresma管理ID, 送客日,
//       氏名, フリガナ, 電話番号, メールアドレス,
//       年齢, 性別, 居住地, 現職職種, 現在年収,
//       希望職種, 希望勤務地, 転職希望時期, 備考, 担当CA
// ------------------------------------------------------------
var FORESMA_COL = {
  STATUS:     0,  // 取込ステータス
  IMPORT_DT:  1,  // 取込日時
  FORESMA_ID: 2,  // Foresma管理ID
  SEND_DATE:  3,  // 送客日
  NAME:       4,  // 氏名
  KANA:       5,  // フリガナ
  PHONE:      6,  // 電話番号
  EMAIL:      7,  // メールアドレス
  AGE:        8,  // 年齢
  GENDER:     9,  // 性別
  AREA:       10, // 居住地
  JOB:        11, // 現職職種
  SALARY:     12, // 現在年収
  HOPE_JOB:   13, // 希望職種
  HOPE_AREA:  14, // 希望勤務地
  TIMING:     15, // 転職希望時期
  NOTE:       16, // 備考
  CA:         17  // 担当CA
};

// 顧客マスタの列インデックス（0始まり）
// 列順: 顧客ID, 登録日, 最終更新日, 流入元, Foresma管理ID,
//       氏名, フリガナ, 電話番号, メールアドレス, 年齢, 性別, 居住地,
//       現職企業名, 現職職種, 現在年収, 希望職種, 希望勤務地, 希望年収, 転職希望時期,
//       担当CA, 顧客ステータス, ヨミランク,
//       次回アクション, 次回アクション期限, 最終対応日, 備考
var CUSTOMER_COL = {
  ID:          0,  // 顧客ID
  REG_DATE:    1,  // 登録日
  UPDATED_AT:  2,  // 最終更新日
  INFLOW:      3,  // 流入元
  FORESMA_ID:  4,  // Foresma管理ID
  NAME:        5,  // 氏名
  KANA:        6,  // フリガナ
  PHONE:       7,  // 電話番号
  EMAIL:       8,  // メールアドレス
  AGE:         9,  // 年齢
  GENDER:      10, // 性別
  AREA:        11, // 居住地
  COMPANY:     12, // 現職企業名
  JOB:         13, // 現職職種
  SALARY:      14, // 現在年収
  HOPE_JOB:    15, // 希望職種
  HOPE_AREA:   16, // 希望勤務地
  HOPE_SALARY: 17, // 希望年収
  TIMING:      18, // 転職希望時期
  CA:          19, // 担当CA
  STATUS:      20, // 顧客ステータス
  YOMI_RANK:   21, // ヨミランク
  NEXT_ACTION: 22, // 次回アクション
  NEXT_DL:     23, // 次回アクション期限
  LAST_CONT:   24, // 最終対応日
  NOTE:        25  // 備考
};

// タスク管理の列インデックス（0始まり）
// 列順: タスクID, 顧客ID, 氏名, 担当CA,
//       タスク内容, タスク期限, タスクステータス, 優先度,
//       関連ステータス, 完了日, 備考
var TASK_COL = {
  ID:       0,
  CUST_ID:  1,
  NAME:     2,
  CA:       3,
  CONTENT:  4,
  DEADLINE: 5,
  STATUS:   6,
  PRIORITY: 7,
  REL_STATUS: 8,
  DONE_DATE:  9,
  NOTE:       10
};

// ============================================================
// メイン処理
// ============================================================
function importForesmaData() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();

  var foresmaSheet   = ss.getSheetByName(SHEET_NAMES.FORESMA);
  var customerSheet  = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var taskSheet      = ss.getSheetByName(SHEET_NAMES.TASK);

  if (!foresmaSheet || !customerSheet || !taskSheet) {
    ui.alert('エラー', '必要なシートが見つかりません。先に「CRMを初期化」を実行してください。', ui.ButtonSet.OK);
    return;
  }

  var lastRow = foresmaSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('Foresma取込', '取込対象のデータがありません。', ui.ButtonSet.OK);
    return;
  }

  // Foresma取込シート全データ取得（ヘッダー除く）
  var foresmaData = foresmaSheet.getRange(2, 1, lastRow - 1, Object.keys(FORESMA_COL).length).getValues();

  // 顧客マスタの既存データをメモリに読み込む（重複チェック用）
  var customerIndex = buildCustomerIndex_(customerSheet);

  var stats = { success: 0, duplicate: 0, error: 0, skip: 0 };
  var now   = new Date();

  foresmaData.forEach(function(row, i) {
    var sheetRowNum = i + 2; // 実際の行番号（ヘッダー行を足す）
    var status = String(row[FORESMA_COL.STATUS]).trim();

    // 「未取込」以外はスキップ
    if (status !== '未取込') {
      stats.skip++;
      return;
    }

    try {
      var result = processOneForesmaRow_(row, now, customerSheet, taskSheet, customerIndex, ss);

      if (result === 'duplicate') {
        foresmaSheet.getRange(sheetRowNum, FORESMA_COL.STATUS + 1).setValue('重複');
        foresmaSheet.getRange(sheetRowNum, FORESMA_COL.IMPORT_DT + 1).setValue(now);
        stats.duplicate++;
        appendLog_(ss, 'Foresma取込', row[FORESMA_COL.NAME], '重複のためスキップ', '重複', '');
      } else {
        // result = 新規登録した顧客ID
        foresmaSheet.getRange(sheetRowNum, FORESMA_COL.STATUS + 1).setValue('取込済');
        foresmaSheet.getRange(sheetRowNum, FORESMA_COL.IMPORT_DT + 1).setValue(now);
        stats.success++;
        appendLog_(ss, 'Foresma取込', row[FORESMA_COL.NAME], '顧客マスタに登録しました。ID: ' + result, '成功', '');
      }

    } catch (e) {
      foresmaSheet.getRange(sheetRowNum, FORESMA_COL.STATUS + 1).setValue('エラー');
      foresmaSheet.getRange(sheetRowNum, FORESMA_COL.IMPORT_DT + 1).setValue(now);
      stats.error++;
      appendLog_(ss, 'Foresma取込エラー', row[FORESMA_COL.NAME], e.message, 'エラー', e.stack);
    }
  });

  var msg = 'Foresma取込処理が完了しました。\n\n' +
    '✅ 新規登録: ' + stats.success + ' 件\n' +
    '🔁 重複スキップ: ' + stats.duplicate + ' 件\n' +
    '⏭ 対象外スキップ: ' + stats.skip + ' 件\n' +
    '❌ エラー: ' + stats.error + ' 件';

  ui.alert('Foresma取込完了', msg, ui.ButtonSet.OK);
}

// ============================================================
// 1行分の処理
// ============================================================
function processOneForesmaRow_(row, now, customerSheet, taskSheet, customerIndex, ss) {
  // --- 必須チェック ---
  var name      = String(row[FORESMA_COL.NAME] || '').trim();
  var phone     = normalizePhone_(String(row[FORESMA_COL.PHONE] || '').trim());
  var email     = String(row[FORESMA_COL.EMAIL] || '').trim().toLowerCase();
  var sendDate  = row[FORESMA_COL.SEND_DATE];

  var missing = [];
  if (!name) missing.push('氏名');
  if (missing.length > 0) {
    throw new Error('必須項目が未入力です: ' + missing.join('、'));
  }

  // 送客日がない場合は今日を使用
  if (!sendDate) sendDate = new Date();

  // --- 重複チェック ---
  // 優先順位: メール → 電話番号 → 氏名
  if (email && customerIndex.byEmail[email]) return 'duplicate';
  if (phone && customerIndex.byPhone[phone]) return 'duplicate';
  if (!email && !phone && customerIndex.byName[name]) return 'duplicate';

  // --- 顧客ID発行 ---
  var customerId = generateCustomerId_(customerSheet);

  // --- 顧客マスタに追加 ---
  var ca = String(row[FORESMA_COL.CA] || '').trim();
  var customerRow = buildCustomerRow_(customerId, now, row, phone, email, ca);
  customerSheet.appendRow(customerRow);

  // インデックスを更新（同一バッチ内の重複を防ぐ）
  if (email) customerIndex.byEmail[email] = customerId;
  if (phone) customerIndex.byPhone[phone] = customerId;
  if (name)  customerIndex.byName[name]   = customerId;

  // --- タスク作成（初回連絡） ---
  var taskId    = generateTaskId_(taskSheet);
  var deadline  = sendDate instanceof Date ? sendDate : new Date(sendDate);
  var taskRow   = buildTaskRow_(taskId, customerId, name, ca, '初回連絡', deadline, '未対応', '高', '初回未対応');
  taskSheet.appendRow(taskRow);

  return customerId;
}

// ============================================================
// 顧客マスタのインデックス構築（重複チェック用）
// ============================================================
function buildCustomerIndex_(customerSheet) {
  var index = { byEmail: {}, byPhone: {}, byName: {} };
  var lastRow = customerSheet.getLastRow();
  if (lastRow < 2) return index;

  var data = customerSheet.getRange(2, 1, lastRow - 1,
    Math.max(CUSTOMER_COL.EMAIL, CUSTOMER_COL.PHONE, CUSTOMER_COL.NAME) + 1).getValues();

  data.forEach(function(row) {
    var phone = normalizePhone_(String(row[CUSTOMER_COL.PHONE] || '').trim());
    var email = String(row[CUSTOMER_COL.EMAIL] || '').trim().toLowerCase();
    var name  = String(row[CUSTOMER_COL.NAME]  || '').trim();
    var id    = String(row[CUSTOMER_COL.ID] || '').trim();
    if (!id) return;
    if (email) index.byEmail[email] = id;
    if (phone) index.byPhone[phone] = id;
    if (name)  index.byName[name]   = id;
  });

  return index;
}

// ============================================================
// 顧客マスタ行の組み立て
// ============================================================
function buildCustomerRow_(customerId, now, foresmaRow, phone, email, ca) {
  // 26列分（CUSTOMER_COL の最大インデックス + 1）
  var row = new Array(26).fill('');

  row[CUSTOMER_COL.ID]          = customerId;
  row[CUSTOMER_COL.REG_DATE]    = now;
  row[CUSTOMER_COL.UPDATED_AT]  = now;
  row[CUSTOMER_COL.INFLOW]      = 'Foresma';
  row[CUSTOMER_COL.FORESMA_ID]  = String(foresmaRow[FORESMA_COL.FORESMA_ID] || '').trim();
  row[CUSTOMER_COL.NAME]        = String(foresmaRow[FORESMA_COL.NAME] || '').trim();
  row[CUSTOMER_COL.KANA]        = String(foresmaRow[FORESMA_COL.KANA] || '').trim();
  row[CUSTOMER_COL.PHONE]       = phone;
  row[CUSTOMER_COL.EMAIL]       = email;
  row[CUSTOMER_COL.AGE]         = foresmaRow[FORESMA_COL.AGE] || '';
  row[CUSTOMER_COL.GENDER]      = String(foresmaRow[FORESMA_COL.GENDER] || '').trim();
  row[CUSTOMER_COL.AREA]        = String(foresmaRow[FORESMA_COL.AREA] || '').trim();
  row[CUSTOMER_COL.COMPANY]     = '';  // Foresmaシートには現職企業名列なし
  row[CUSTOMER_COL.JOB]         = String(foresmaRow[FORESMA_COL.JOB] || '').trim();
  row[CUSTOMER_COL.SALARY]      = foresmaRow[FORESMA_COL.SALARY] || '';
  row[CUSTOMER_COL.HOPE_JOB]    = String(foresmaRow[FORESMA_COL.HOPE_JOB] || '').trim();
  row[CUSTOMER_COL.HOPE_AREA]   = String(foresmaRow[FORESMA_COL.HOPE_AREA] || '').trim();
  row[CUSTOMER_COL.HOPE_SALARY] = '';  // Foresmaシートには希望年収列なし
  row[CUSTOMER_COL.TIMING]      = String(foresmaRow[FORESMA_COL.TIMING] || '').trim();
  row[CUSTOMER_COL.CA]          = ca;
  row[CUSTOMER_COL.STATUS]      = '初回未対応';
  row[CUSTOMER_COL.YOMI_RANK]   = '';
  row[CUSTOMER_COL.NEXT_ACTION] = '初回連絡';
  row[CUSTOMER_COL.NEXT_DL]     = foresmaRow[FORESMA_COL.SEND_DATE] || now; // 送客日を期限に
  row[CUSTOMER_COL.LAST_CONT]   = '';
  row[CUSTOMER_COL.NOTE]        = String(foresmaRow[FORESMA_COL.NOTE] || '').trim();

  return row;
}

// ============================================================
// タスク行の組み立て
// ============================================================
function buildTaskRow_(taskId, custId, name, ca, content, deadline, status, priority, relStatus) {
  var row = new Array(11).fill('');
  row[TASK_COL.ID]         = taskId;
  row[TASK_COL.CUST_ID]    = custId;
  row[TASK_COL.NAME]       = name;
  row[TASK_COL.CA]         = ca;
  row[TASK_COL.CONTENT]    = content;
  row[TASK_COL.DEADLINE]   = deadline;
  row[TASK_COL.STATUS]     = status;
  row[TASK_COL.PRIORITY]   = priority;
  row[TASK_COL.REL_STATUS] = relStatus;
  row[TASK_COL.DONE_DATE]  = '';
  row[TASK_COL.NOTE]       = '';
  return row;
}

// ============================================================
// ID発行
// ============================================================
function generateCustomerId_(customerSheet) {
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var prefix  = 'C-' + dateStr + '-';
  var lastRow = customerSheet.getLastRow();

  var maxSeq = 0;
  if (lastRow >= 2) {
    var ids = customerSheet.getRange(2, CUSTOMER_COL.ID + 1, lastRow - 1, 1).getValues();
    ids.forEach(function(r) {
      var id = String(r[0] || '');
      if (id.indexOf(prefix) === 0) {
        var seq = parseInt(id.replace(prefix, ''), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  return prefix + zeroPad_(maxSeq + 1, 3);
}

function generateTaskId_(taskSheet) {
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var prefix  = 'T-' + dateStr + '-';
  var lastRow = taskSheet.getLastRow();

  var maxSeq = 0;
  if (lastRow >= 2) {
    var ids = taskSheet.getRange(2, TASK_COL.ID + 1, lastRow - 1, 1).getValues();
    ids.forEach(function(r) {
      var id = String(r[0] || '');
      if (id.indexOf(prefix) === 0) {
        var seq = parseInt(id.replace(prefix, ''), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  return prefix + zeroPad_(maxSeq + 1, 3);
}

// ============================================================
// ユーティリティ
// ============================================================
function zeroPad_(num, len) {
  return String(num).padStart(len, '0');
}

// 電話番号の正規化（ハイフン・スペース除去、先頭の+81を0に統一）
function normalizePhone_(phone) {
  if (!phone) return '';
  var p = phone.replace(/[\s\-\(\)]/g, '');
  if (p.indexOf('+81') === 0) p = '0' + p.slice(3);
  return p;
}
