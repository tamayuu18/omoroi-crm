// ============================================================
// TimeRex取込処理 - Gmailからの自動取込
// ============================================================
//
// 【動作概要】
// importTimeRexFromGmail() を実行すると:
//   1. GmailでTimeRex通知メールを検索（設定シートの送信元アドレスを使用）
//   2. メール本文を解析して予約情報を抽出
//   3. TimeRex取込シートに「未取込」として追加
//   4. そのまま importTimeRexData() を呼び出し、顧客マスタ・面談管理に反映
//
// 【設定シートに追加が必要な項目】
// 設定シートの「TimeRex設定」セクション（setupTimeRexSettings_で自動作成）:
//   - TimeRex送信元メールアドレス（例: noreply@timerex.net）
//   - 処理済みラベル名（例: CRM処理済）
//   - デフォルト担当CA
// ============================================================

// TimeRex取込シートの列インデックス（0始まり）
var TIMEREX_COL = {
  STATUS:      0,   // 取込ステータス
  IMPORT_DT:   1,   // 取込日時
  BOOKING_ID:  2,   // TimeRex予約ID
  RECV_DATE:   3,   // 予約受付日
  NAME:        4,   // 氏名
  EMAIL:       5,   // メールアドレス
  PHONE:       6,   // 電話番号
  MTG_DATE:    7,   // 面談予定日
  MTG_START:   8,   // 面談開始時間
  MTG_END:     9,   // 面談終了時間
  MTG_METHOD:  10,  // 面談方法
  CA:          11,  // 担当CA
  MEMO:        12,  // 予約時メモ
  BOOKING_URL: 13   // 予約URL
};

// 面談管理シートの列インデックス（0始まり）
var MEETING_COL = {
  ID:          0,   // 面談ID
  CUST_ID:     1,   // 顧客ID
  NAME:        2,   // 氏名
  CA:          3,   // 担当CA
  MTG_DATE:    4,   // 面談予定日
  MTG_START:   5,   // 面談開始時間
  MTG_END:     6,   // 面談終了時間
  MTG_METHOD:  7,   // 面談方法
  STATUS:      8,   // 面談ステータス
  REMIND:      9,   // リマインド状況
  RESULT:      10,  // 面談結果
  TEMP:        11,  // 温度感
  PROPOSAL:    12,  // 求人提案有無
  NEXT_ACTION: 13,  // 次回アクション
  NEXT_DL:     14   // 次回アクション期限
};

// 設定シートでTimeRex設定を読み書きする際のラベル
var TIMEREX_SETTINGS = {
  SENDER_LABEL:     'TimeRex送信元メールアドレス',
  DONE_LABEL:       '処理済みGmailラベル',
  DEFAULT_CA_LABEL: 'TimeRexデフォルト担当CA',
  DEFAULT_METHOD_LABEL: 'TimeRexデフォルト面談方法'
};

// ============================================================
// エントリポイント: GmailからTimeRexメールを取込
// ============================================================
function importTimeRexFromGmail() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();

  // 設定を読み込む
  var config = loadTimeRexConfig_(ss);

  if (!config.senderEmail) {
    ui.alert(
      '設定が必要です',
      '設定シートの「TimeRex送信元メールアドレス」にTimeRexの通知メール送信元を入力してください。\n\n' +
      '例: noreply@timerex.net\n\n' +
      '設定シートの右側「TimeRex設定」エリアに記入してください。',
      ui.ButtonSet.OK
    );
    return;
  }

  // Gmail検索クエリ（未処理のTimeRex通知メール）
  var query = buildGmailQuery_(config);
  var threads = GmailApp.search(query, 0, 50); // 最大50件

  if (threads.length === 0) {
    ui.alert('TimeRex取込', '新しい予約通知メールは見つかりませんでした。', ui.ButtonSet.OK);
    return;
  }

  var timerexSheet = ss.getSheetByName(SHEET_NAMES.TIMEREX);
  if (!timerexSheet) {
    ui.alert('エラー', '「TimeRex取込」シートが見つかりません。CRMを初期化してください。', ui.ButtonSet.OK);
    return;
  }

  var added   = 0;
  var skipped = 0;
  var errors  = [];
  var doneLabel = getOrCreateLabel_(config.doneLabel);

  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(message) {
      try {
        var parsed = parseTimeRexEmail_(message, config);
        if (!parsed) {
          skipped++;
          return;
        }

        // TimeRex取込シートに1行追加
        appendTimeRexRow_(timerexSheet, parsed);
        added++;
        appendLog_(ss, 'Gmail取込', parsed.name || '（氏名不明）',
          'TimeRex予約メールを取込しました', '成功', message.getSubject());

      } catch (e) {
        errors.push(message.getSubject() + ': ' + e.message);
        appendLog_(ss, 'Gmail取込エラー', message.getSubject(), e.message, 'エラー', e.stack);
      }
    });

    // 処理済みラベルを付与してアーカイブ
    if (doneLabel) thread.addLabel(doneLabel);
    thread.moveToArchive();
  });

  // 取込シートのデータを顧客マスタ・面談管理に反映
  if (added > 0) {
    importTimeRexData();
  } else {
    var msg = 'メール取込結果:\n' +
      '✅ 取込成功: ' + added + ' 件\n' +
      '⏭ スキップ: ' + skipped + ' 件\n';
    if (errors.length > 0) msg += '❌ エラー:\n' + errors.join('\n');
    ui.alert('TimeRex Gmail取込', msg, ui.ButtonSet.OK);
  }
}

// ============================================================
// エントリポイント: TimeRex取込シート → 顧客マスタ・面談管理への反映
// ============================================================
function importTimeRexData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var timerexSheet  = ss.getSheetByName(SHEET_NAMES.TIMEREX);
  var customerSheet = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var meetingSheet  = ss.getSheetByName(SHEET_NAMES.MEETING);
  var taskSheet     = ss.getSheetByName(SHEET_NAMES.TASK);

  if (!timerexSheet || !customerSheet || !meetingSheet || !taskSheet) {
    ui.alert('エラー', '必要なシートが見つかりません。先に「CRMを初期化」を実行してください。', ui.ButtonSet.OK);
    return;
  }

  var lastRow = timerexSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('TimeRex取込', '取込対象のデータがありません。', ui.ButtonSet.OK);
    return;
  }

  var timerexData   = timerexSheet.getRange(2, 1, lastRow - 1, Object.keys(TIMEREX_COL).length).getValues();
  var customerIndex = buildCustomerIndex_(customerSheet);
  var now           = new Date();
  var stats         = { success: 0, duplicate: 0, error: 0, skip: 0 };

  timerexData.forEach(function(row, i) {
    var sheetRowNum = i + 2;
    var status = String(row[TIMEREX_COL.STATUS]).trim();

    if (status !== '未取込') {
      stats.skip++;
      return;
    }

    try {
      var result = processOneTimeRexRow_(row, now, customerSheet, meetingSheet, taskSheet, customerIndex, ss);

      foresmaSheet_updateStatus_(timerexSheet, sheetRowNum, '取込済', now);
      stats.success++;
      appendLog_(ss, 'TimeRex取込', row[TIMEREX_COL.NAME],
        '面談登録完了。顧客ID: ' + result.customerId + ' / 面談ID: ' + result.meetingId, '成功', '');

    } catch (e) {
      foresmaSheet_updateStatus_(timerexSheet, sheetRowNum, 'エラー', now);
      stats.error++;
      appendLog_(ss, 'TimeRex取込エラー', row[TIMEREX_COL.NAME], e.message, 'エラー', e.stack);
    }
  });

  var msg = 'TimeRex取込処理が完了しました。\n\n' +
    '✅ 新規登録: '      + stats.success   + ' 件\n' +
    '⏭ 対象外スキップ: ' + stats.skip      + ' 件\n' +
    '❌ エラー: '        + stats.error     + ' 件';

  ui.alert('TimeRex取込完了', msg, ui.ButtonSet.OK);
}

// ============================================================
// 1行分の処理（取込シート → 顧客マスタ・面談管理・タスク）
// ============================================================
function processOneTimeRexRow_(row, now, customerSheet, meetingSheet, taskSheet, customerIndex, ss) {
  var name     = String(row[TIMEREX_COL.NAME]  || '').trim();
  var email    = String(row[TIMEREX_COL.EMAIL] || '').trim().toLowerCase();
  var phone    = normalizePhone_(String(row[TIMEREX_COL.PHONE] || '').trim());
  var mtgDate  = row[TIMEREX_COL.MTG_DATE];
  var mtgStart = row[TIMEREX_COL.MTG_START];
  var ca       = String(row[TIMEREX_COL.CA]    || '').trim();

  // 必須チェック
  var missing = [];
  if (!name)              missing.push('氏名');
  if (!email && !phone)   missing.push('メールアドレスまたは電話番号');
  if (!mtgDate)           missing.push('面談予定日');
  if (!mtgStart && !row[TIMEREX_COL.MTG_START]) missing.push('面談開始時間');
  if (missing.length > 0) throw new Error('必須項目が未入力: ' + missing.join('、'));

  // 既存顧客の照合
  var customerId = null;
  if (email && customerIndex.byEmail[email]) customerId = customerIndex.byEmail[email];
  if (!customerId && phone && customerIndex.byPhone[phone]) customerId = customerIndex.byPhone[phone];

  var isNewCustomer = !customerId;

  // 新規顧客の場合は顧客マスタに登録
  if (isNewCustomer) {
    customerId = generateCustomerId_(customerSheet);
    var customerRow = buildCustomerRowFromTimerex_(customerId, now, row, phone, email, ca);
    customerSheet.appendRow(customerRow);
    if (email) customerIndex.byEmail[email] = customerId;
    if (phone) customerIndex.byPhone[phone] = customerId;
    appendLog_(ss, '新規顧客登録', name, '顧客マスタに追加。ID: ' + customerId, '成功', 'TimeRex経由');
  } else {
    // 既存顧客: ステータスと担当CAを更新
    updateCustomerForMeeting_(customerSheet, customerId, ca, mtgDate, now);
  }

  // 面談IDを発行して面談管理に追加
  var meetingId  = generateMeetingId_(meetingSheet);
  var meetingRow = buildMeetingRow_(meetingId, customerId, name, row);
  meetingSheet.appendRow(meetingRow);

  // タスク管理に「面談実施」タスクを作成
  var taskId   = generateTaskId_(taskSheet);
  var deadline = mtgDate instanceof Date ? mtgDate : new Date(mtgDate);
  var taskRow  = buildTaskRow_(taskId, customerId, name, ca, '面談実施', deadline, '未対応', '高', '面談予約済み');
  taskSheet.appendRow(taskRow);

  return { customerId: customerId, meetingId: meetingId, isNew: isNewCustomer };
}

// ============================================================
// 顧客マスタの面談予約済み更新（既存顧客向け）
// ============================================================
function updateCustomerForMeeting_(customerSheet, customerId, ca, mtgDate, now) {
  var lastRow = customerSheet.getLastRow();
  if (lastRow < 2) return;

  var ids = customerSheet.getRange(2, CUSTOMER_COL.ID + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === customerId) {
      var rowNum = i + 2;
      customerSheet.getRange(rowNum, CUSTOMER_COL.STATUS + 1).setValue('面談予約済み');
      customerSheet.getRange(rowNum, CUSTOMER_COL.NEXT_ACTION + 1).setValue('面談実施');
      customerSheet.getRange(rowNum, CUSTOMER_COL.NEXT_DL + 1).setValue(mtgDate);
      customerSheet.getRange(rowNum, CUSTOMER_COL.UPDATED_AT + 1).setValue(now);
      if (ca) customerSheet.getRange(rowNum, CUSTOMER_COL.CA + 1).setValue(ca);
      return;
    }
  }
}

// ============================================================
// 行データの組み立て
// ============================================================
function buildCustomerRowFromTimerex_(customerId, now, timerexRow, phone, email, ca) {
  var row = new Array(26).fill('');
  row[CUSTOMER_COL.ID]          = customerId;
  row[CUSTOMER_COL.REG_DATE]    = now;
  row[CUSTOMER_COL.UPDATED_AT]  = now;
  row[CUSTOMER_COL.INFLOW]      = 'TimeRex';
  row[CUSTOMER_COL.FORESMA_ID]  = '';
  row[CUSTOMER_COL.NAME]        = String(timerexRow[TIMEREX_COL.NAME]  || '').trim();
  row[CUSTOMER_COL.KANA]        = '';
  row[CUSTOMER_COL.PHONE]       = phone;
  row[CUSTOMER_COL.EMAIL]       = email;
  row[CUSTOMER_COL.CA]          = ca;
  row[CUSTOMER_COL.STATUS]      = '面談予約済み';
  row[CUSTOMER_COL.NEXT_ACTION] = '面談実施';
  row[CUSTOMER_COL.NEXT_DL]     = timerexRow[TIMEREX_COL.MTG_DATE] || now;
  row[CUSTOMER_COL.NOTE]        = String(timerexRow[TIMEREX_COL.MEMO] || '').trim();
  return row;
}

function buildMeetingRow_(meetingId, customerId, name, timerexRow) {
  var row = new Array(15).fill('');
  row[MEETING_COL.ID]          = meetingId;
  row[MEETING_COL.CUST_ID]     = customerId;
  row[MEETING_COL.NAME]        = name;
  row[MEETING_COL.CA]          = String(timerexRow[TIMEREX_COL.CA]         || '').trim();
  row[MEETING_COL.MTG_DATE]    = timerexRow[TIMEREX_COL.MTG_DATE]    || '';
  row[MEETING_COL.MTG_START]   = timerexRow[TIMEREX_COL.MTG_START]   || '';
  row[MEETING_COL.MTG_END]     = timerexRow[TIMEREX_COL.MTG_END]     || '';
  row[MEETING_COL.MTG_METHOD]  = timerexRow[TIMEREX_COL.MTG_METHOD]  || '';
  row[MEETING_COL.STATUS]      = '予約済';
  row[MEETING_COL.REMIND]      = '未送信';
  row[MEETING_COL.NEXT_ACTION] = '面談実施';
  row[MEETING_COL.NEXT_DL]     = timerexRow[TIMEREX_COL.MTG_DATE]    || '';
  return row;
}

// ============================================================
// Gmailメールの解析
// ============================================================
function parseTimeRexEmail_(message, config) {
  var subject = message.getSubject();
  var body    = message.getPlainBody();
  var from    = message.getFrom();

  // 送信元アドレスの確認
  if (config.senderEmail && from.indexOf(config.senderEmail) === -1) return null;

  // TimeRex通知メールかどうかを判定（件名または本文でチェック）
  var isTimeRex = /timerex|予約(が入り|通知|確認|完了)/i.test(subject) ||
                  /timerex|予約が入り/i.test(body);
  if (!isTimeRex) return null;

  // ---- 各フィールドを抽出 ----
  var result = {
    bookingId:  extractField_(body, ['予約ID', 'BookingID', '予約番号']),
    name:       extractField_(body, ['お名前', '氏名', 'お客様名', '予約者名', 'Name']),
    email:      extractEmail_(body),
    phone:      extractField_(body, ['電話番号', 'お電話番号', 'TEL', 'Tel', '携帯番号']),
    mtgDateRaw: extractField_(body, ['日時', '面談日時', '予約日時', '開始日時', '面談日']),
    mtgMethod:  extractField_(body, ['面談方法', '面談形式', '実施方法', 'ミーティング方法']),
    ca:         extractField_(body, ['担当', '担当者', '担当CA', 'ホスト']),
    memo:       extractMemo_(body),
    bookingUrl: extractUrl_(body, ['timerex.net']),
    recvDate:   message.getDate(),
    rawBody:    body
  };

  // 氏名がない場合は件名から推測
  if (!result.name) {
    var nameFromSubject = subject.match(/【(.+?)】|「(.+?)」|^予約:.+?（(.+?)）/);
    if (nameFromSubject) result.name = nameFromSubject[1] || nameFromSubject[2] || nameFromSubject[3];
  }

  // 日時の解析
  var parsed = parseDatetime_(result.mtgDateRaw, result.rawBody);
  result.mtgDate  = parsed.date;
  result.mtgStart = parsed.start;
  result.mtgEnd   = parsed.end;

  // 面談方法の正規化
  result.mtgMethod = normalizeMeetingMethod_(result.mtgMethod, config.defaultMethod);

  // デフォルトCA（設定値があれば補完）
  if (!result.ca && config.defaultCa) result.ca = config.defaultCa;

  return result;
}

// ============================================================
// フィールド抽出ユーティリティ
// ============================================================
function extractField_(body, labels) {
  for (var i = 0; i < labels.length; i++) {
    // "ラベル: 値" または "ラベル：値" または "ラベル\t値" にマッチ
    var regex = new RegExp(labels[i] + '\\s*[：:：]\\s*(.+)', 'i');
    var match = body.match(regex);
    if (match && match[1]) {
      return match[1].split(/[\r\n]/)[0].trim();
    }
  }
  return '';
}

function extractEmail_(body) {
  var match = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : '';
}

function extractUrl_(body, domains) {
  var lines = body.split(/[\r\n]+/);
  for (var i = 0; i < lines.length; i++) {
    var urlMatch = lines[i].match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      for (var d = 0; d < domains.length; d++) {
        if (urlMatch[0].indexOf(domains[d]) !== -1) return urlMatch[0];
      }
    }
  }
  return '';
}

function extractMemo_(body) {
  // 「回答内容」「ご要望」「メモ」以降の段落を取得
  var match = body.match(/(?:回答内容|ご要望|お問い合わせ内容|備考|メモ)\s*[：:]\s*([\s\S]+?)(?:\n\n|\r\n\r\n|$)/i);
  return match ? match[1].trim() : '';
}

// ============================================================
// 日時解析
// ============================================================
function parseDatetime_(rawDatetime, body) {
  var result = { date: '', start: '', end: '' };
  if (!rawDatetime && !body) return result;

  var text = rawDatetime || body;

  // パターン例: 「2026年6月1日（月）14:00〜15:00」
  var fullPattern = /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?[\s\S]{0,10}?(\d{1,2}):(\d{2})(?:[〜～\-〜](\d{1,2}):(\d{2}))?/;
  var m = text.match(fullPattern);
  if (m) {
    result.date  = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    result.start = zeroPad_(m[4], 2) + ':' + m[5];
    result.end   = m[6] ? zeroPad_(m[6], 2) + ':' + m[7] : '';
    return result;
  }

  // 日付のみのパターン
  var dateOnly = text.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
  if (dateOnly) {
    result.date = new Date(parseInt(dateOnly[1]), parseInt(dateOnly[2]) - 1, parseInt(dateOnly[3]));
  }

  // 時刻のみのパターン（別行にある場合）
  var timePattern = body.match(/(\d{1,2}):(\d{2})(?:[〜～\-](\d{1,2}):(\d{2}))?/);
  if (timePattern) {
    result.start = zeroPad_(timePattern[1], 2) + ':' + timePattern[2];
    result.end   = timePattern[3] ? zeroPad_(timePattern[3], 2) + ':' + timePattern[4] : '';
  }

  return result;
}

function normalizeMeetingMethod_(raw, defaultMethod) {
  if (!raw) return defaultMethod || '';
  var lower = raw.toLowerCase();
  if (/zoom/i.test(raw))             return 'Zoom';
  if (/meet|google/i.test(raw))      return 'Google Meet';
  if (/teams/i.test(raw))            return 'Google Meet'; // Teamsは近いものに
  if (/電話|phone|tel/i.test(raw))   return '電話';
  if (/対面|来社|訪問/i.test(raw))   return '対面';
  return raw;
}

// ============================================================
// TimeRex取込シートへ追記
// ============================================================
function appendTimeRexRow_(timerexSheet, parsed) {
  var row = new Array(14).fill('');
  row[TIMEREX_COL.STATUS]      = '未取込';
  row[TIMEREX_COL.IMPORT_DT]   = '';
  row[TIMEREX_COL.BOOKING_ID]  = parsed.bookingId  || '';
  row[TIMEREX_COL.RECV_DATE]   = parsed.recvDate   || '';
  row[TIMEREX_COL.NAME]        = parsed.name        || '';
  row[TIMEREX_COL.EMAIL]       = parsed.email       || '';
  row[TIMEREX_COL.PHONE]       = parsed.phone       || '';
  row[TIMEREX_COL.MTG_DATE]    = parsed.mtgDate     || '';
  row[TIMEREX_COL.MTG_START]   = parsed.mtgStart    || '';
  row[TIMEREX_COL.MTG_END]     = parsed.mtgEnd      || '';
  row[TIMEREX_COL.MTG_METHOD]  = parsed.mtgMethod   || '';
  row[TIMEREX_COL.CA]          = parsed.ca           || '';
  row[TIMEREX_COL.MEMO]        = parsed.memo         || '';
  row[TIMEREX_COL.BOOKING_URL] = parsed.bookingUrl  || '';
  timerexSheet.appendRow(row);
}

// ============================================================
// ステータス更新ヘルパー
// ============================================================
function foresmaSheet_updateStatus_(sheet, rowNum, status, now) {
  sheet.getRange(rowNum, TIMEREX_COL.STATUS + 1).setValue(status);
  sheet.getRange(rowNum, TIMEREX_COL.IMPORT_DT + 1).setValue(now);
}

// ============================================================
// ID発行
// ============================================================
function generateMeetingId_(meetingSheet) {
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var prefix  = 'M-' + dateStr + '-';
  var lastRow = meetingSheet.getLastRow();
  var maxSeq  = 0;

  if (lastRow >= 2) {
    var ids = meetingSheet.getRange(2, MEETING_COL.ID + 1, lastRow - 1, 1).getValues();
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
// 設定シートからTimeRex設定を読み込む
// ============================================================
function loadTimeRexConfig_(ss) {
  var config = {
    senderEmail:   '',
    doneLabel:     'CRM処理済',
    defaultCa:     '',
    defaultMethod: 'Zoom'
  };

  var settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!settingsSheet) return config;

  var data = settingsSheet.getDataRange().getValues();
  data.forEach(function(row) {
    var label = String(row[0] || '').trim();
    var value = String(row[1] || '').trim();
    if (label === TIMEREX_SETTINGS.SENDER_LABEL)       config.senderEmail   = value;
    if (label === TIMEREX_SETTINGS.DONE_LABEL)         config.doneLabel     = value || 'CRM処理済';
    if (label === TIMEREX_SETTINGS.DEFAULT_CA_LABEL)   config.defaultCa     = value;
    if (label === TIMEREX_SETTINGS.DEFAULT_METHOD_LABEL) config.defaultMethod = value || 'Zoom';
  });

  return config;
}

// ============================================================
// Gmailラベルを取得または作成
// ============================================================
function getOrCreateLabel_(labelName) {
  if (!labelName) return null;
  try {
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) label = GmailApp.createLabel(labelName);
    return label;
  } catch (e) {
    return null;
  }
}

// ============================================================
// Gmail検索クエリの構築
// ============================================================
function buildGmailQuery_(config) {
  var parts = [];
  if (config.senderEmail) parts.push('from:' + config.senderEmail);
  if (config.doneLabel)   parts.push('-label:' + config.doneLabel.replace(/\s/g, '-'));
  parts.push('is:unread OR label:inbox');
  return parts.join(' ');
}

// ============================================================
// 設定シートにTimeRex設定欄を追加するセットアップ関数
// （initializeCRM実行時に自動で呼ばれる / 手動でも呼べる）
// ============================================================
function setupTimeRexSettings() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // すでに設定済みならスキップ
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).indexOf('TimeRex送信元') !== -1) return;
  }

  // 空行を探して追記
  var insertRow = sheet.getLastRow() + 2;

  var settings = [
    ['■ TimeRex設定', ''],
    [TIMEREX_SETTINGS.SENDER_LABEL,       'noreply@timerex.net'],
    [TIMEREX_SETTINGS.DONE_LABEL,         'CRM処理済'],
    [TIMEREX_SETTINGS.DEFAULT_CA_LABEL,   ''],
    [TIMEREX_SETTINGS.DEFAULT_METHOD_LABEL, 'Zoom']
  ];

  sheet.getRange(insertRow, 1, settings.length, 2).setValues(settings);
  sheet.getRange(insertRow, 1).setBackground('#4285f4').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(insertRow + 1, 1, settings.length - 1, 1).setFontWeight('bold');
  sheet.getRange(insertRow + 1, 2, settings.length - 1, 1).setBackground('#e8f0fe');

  SpreadsheetApp.getUi().alert(
    'TimeRex設定を追加しました',
    '設定シートの「TimeRex設定」エリアに以下を入力してください:\n\n' +
    '・TimeRex送信元メールアドレス\n  （例: noreply@timerex.net）\n\n' +
    '・TimeRexデフォルト担当CA\n  （担当が特定できない場合の初期値）',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
