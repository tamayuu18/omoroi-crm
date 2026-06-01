// ============================================================
// ステータス管理
// 1. ステータス変更 → タスク自動生成（onEdit）
// 2. ステータス一覧ビュー（updateStatusView）
// 3. 期限切れアラート（checkAlerts）
// ============================================================

// ステータス変更時に自動生成するタスクの定義
var STATUS_TASK_MAP = {
  '初回未対応':     { content: '初回連絡',           daysOffset: 0,  priority: '高' },
  '初回連絡済み':   { content: '再連絡・面談設定',    daysOffset: 3,  priority: '高' },
  '不通':           { content: '再連絡（不通）',       daysOffset: 1,  priority: '高' },
  '面談予約済み':   { content: '面談前確認・準備',     daysOffset: -1, priority: '高' },  // 面談前日
  '面談実施済み':   { content: '面談後フォロー・求人提案', daysOffset: 1, priority: '高' },
  'リスケ調整中':   { content: 'リスケ日程調整',       daysOffset: 1,  priority: '高' },
  '求人提案中':     { content: '応募意思確認',         daysOffset: 3,  priority: '中' },
  '応募意思確認中': { content: '応募書類確認・提出',   daysOffset: 2,  priority: '高' },
  '応募済み':       { content: '選考状況確認',         daysOffset: 7,  priority: '中' },
  '書類選考中':     { content: '書類選考結果確認',     daysOffset: 5,  priority: '中' },
  '一次面接予定':   { content: '面接前サポート・確認', daysOffset: -1, priority: '高' },
  '一次面接結果待ち': { content: '一次面接結果確認',   daysOffset: 5,  priority: '中' },
  '最終面接予定':   { content: '最終面接前サポート',   daysOffset: -1, priority: '高' },
  '最終面接結果待ち': { content: '最終面接結果確認',   daysOffset: 5,  priority: '高' },
  '内定':           { content: '内定承諾意思確認',     daysOffset: 1,  priority: '高' },
  '承諾':           { content: '入社手続き確認',       daysOffset: 3,  priority: '中' },
  '長期フォロー':   { content: '定期フォロー連絡',     daysOffset: 30, priority: '低' }
};

// ============================================================
// onEdit トリガー
// 顧客マスタのステータス列（U列=21）が変更されたらタスク生成
// ============================================================
function onEdit(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAMES.CUSTOMER) return;

    var col = e.range.getColumn();
    var row = e.range.getRow();
    if (row < 2) return;

    // U列(21)=顧客ステータス が変更された場合
    if (col !== CUSTOMER_COL.STATUS + 1) return;

    var newStatus = String(e.value || '').trim();
    var taskDef   = STATUS_TASK_MAP[newStatus];
    if (!taskDef) return;

    var ss            = sheet.getParent();
    var taskSheet     = ss.getSheetByName(SHEET_NAMES.TASK);
    if (!taskSheet) return;

    var rowData    = sheet.getRange(row, 1, 1, 26).getValues()[0];
    var customerId = String(rowData[CUSTOMER_COL.ID]   || '').trim();
    var name       = String(rowData[CUSTOMER_COL.NAME] || '').trim();
    var ca         = String(rowData[CUSTOMER_COL.CA]   || '').trim();
    if (!customerId) return;

    var now      = new Date();
    var deadline = new Date(now);
    deadline.setDate(deadline.getDate() + taskDef.daysOffset);

    var taskId  = generateTaskId_(taskSheet);
    var taskRow = buildTaskRow_(taskId, customerId, name, ca,
      taskDef.content, deadline, '未対応', taskDef.priority, newStatus);
    taskSheet.appendRow(taskRow);

    // 顧客マスタの次回アクション・期限も更新
    sheet.getRange(row, CUSTOMER_COL.NEXT_ACTION + 1).setValue(taskDef.content);
    sheet.getRange(row, CUSTOMER_COL.NEXT_DL     + 1).setValue(deadline);
    sheet.getRange(row, CUSTOMER_COL.UPDATED_AT  + 1).setValue(now);

  } catch(err) {
    // onEdit エラーはサイレントに処理（ユーザー操作を妨げない）
  }
}

// ============================================================
// ステータス一覧ビューをダッシュボードに出力
// ============================================================
function updateStatusView() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var src  = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var dash = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!src || !dash) return;

  var lastRow = src.getLastRow();
  if (lastRow < 2) return;

  var data = src.getRange(2, 1, lastRow - 1, CUSTOMER_COL.STATUS + 1).getValues();

  // ステータス別集計
  var statusCount = {};
  MASTER.CUSTOMER_STATUS.forEach(function(s) { statusCount[s] = 0; });

  // CA別×ステータス別集計
  var caStatus = {};

  data.forEach(function(row) {
    var status = String(row[CUSTOMER_COL.STATUS] || '').trim();
    var ca     = String(row[CUSTOMER_COL.CA]     || '未設定').trim();
    if (status) statusCount[status] = (statusCount[status] || 0) + 1;
    if (!caStatus[ca]) caStatus[ca] = {};
    caStatus[ca][status] = (caStatus[ca][status] || 0) + 1;
  });

  // ダッシュボードの書き込み開始行を探す（既存のステータスビュー行を上書き）
  var startRow = findOrCreateSection_(dash, '■ ステータス別 顧客数');

  // ステータス別一覧
  var output = [['ステータス', '件数']];
  MASTER.CUSTOMER_STATUS.forEach(function(s) {
    if (statusCount[s] > 0) output.push([s, statusCount[s]]);
  });
  output.push(['', '']);

  // CA別ステータスサマリー
  output.push(['■ CA別サマリー', '']);
  var caNames = Object.keys(caStatus).sort();
  caNames.forEach(function(ca) {
    output.push(['▼ ' + ca, '']);
    MASTER.CUSTOMER_STATUS.forEach(function(s) {
      if (caStatus[ca][s]) output.push(['　' + s, caStatus[ca][s]]);
    });
  });

  var range = dash.getRange(startRow, 1, output.length, 2);
  range.clearContent();
  range.setValues(output);

  // ヘッダー行を太字に
  dash.getRange(startRow, 1, 1, 2).setFontWeight('bold');
}

function findOrCreateSection_(sheet, title) {
  var data    = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === title) return i + 1;
  }
  // 見つからなければ末尾に追加
  var last = sheet.getLastRow();
  sheet.getRange(last + 2, 1).setValue(title);
  return last + 2;
}

// ============================================================
// 期限切れアラート
// - タスク: 期限切れ・未対応
// - 顧客マスタ: 次回アクション期限切れ
// ============================================================
function checkAlerts() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ui   = SpreadsheetApp.getUi();
  var now  = new Date();
  now.setHours(0, 0, 0, 0);

  var alerts = [];

  // --- タスクシートの期限切れチェック ---
  var taskSheet = ss.getSheetByName(SHEET_NAMES.TASK);
  if (taskSheet && taskSheet.getLastRow() >= 2) {
    var taskData = taskSheet.getRange(2, 1, taskSheet.getLastRow() - 1,
      TASK_COL.STATUS + 1).getValues();

    taskData.forEach(function(row) {
      var status   = String(row[TASK_COL.STATUS]   || '').trim();
      var deadline = row[TASK_COL.DEADLINE];
      var name     = String(row[TASK_COL.NAME]     || '').trim();
      var content  = String(row[TASK_COL.CONTENT]  || '').trim();
      var ca       = String(row[TASK_COL.CA]        || '').trim();

      if (status === '完了' || status === '保留') return;
      if (!(deadline instanceof Date)) return;

      var dl = new Date(deadline);
      dl.setHours(0, 0, 0, 0);
      var diffDays = Math.floor((now - dl) / 86400000);

      if (diffDays >= 1) {
        alerts.push('【' + diffDays + '日超過】' + name + ' / ' + content +
          (ca ? ' (' + ca + ')' : ''));
      } else if (diffDays === 0) {
        alerts.push('【本日期限】' + name + ' / ' + content +
          (ca ? ' (' + ca + ')' : ''));
      }
    });
  }

  if (alerts.length === 0) {
    ui.alert('アラート確認', '期限切れ・本日期限のタスクはありません ✅', ui.ButtonSet.OK);
    return;
  }

  // 20件超は省略
  var msg = alerts.slice(0, 20).join('\n');
  if (alerts.length > 20) msg += '\n\n…ほか ' + (alerts.length - 20) + '件';

  ui.alert('⚠️ アラート（' + alerts.length + '件）', msg, ui.ButtonSet.OK);
  appendLog_(ss, 'アラート確認', 'checkAlerts',
    alerts.length + '件のアラートを確認', '情報', '');
}

// ============================================================
// ダッシュボード更新（ステータスビュー含む）
// ============================================================
function updateDashboard() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  updateStatusView_(ss);
  SpreadsheetApp.getUi().alert('ダッシュボード更新完了', 'ステータス一覧を更新しました。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function updateStatusView_(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  updateStatusView();
}

// ============================================================
// インストーラブルトリガーの登録
// メニュー「ステータス変更トリガーを設定する」から1回だけ実行
// ============================================================
function setupStatusTrigger() {
  // 既存の onEdit トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert(
    'トリガー設定完了',
    '顧客マスタのステータスを変更すると自動でタスクが生成されるようになりました。\n\n' +
    '※ この設定は1回だけ実行すれば有効です。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ============================================================
// ステータス同期
// 面談管理・選考管理の状況をもとに顧客マスタのステータスを更新
// ============================================================
function syncCustomerStatus() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ui  = SpreadsheetApp.getUi();

  var customerSheet  = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var meetingSheet   = ss.getSheetByName(SHEET_NAMES.MEETING);
  var selectionSheet = ss.getSheetByName(SHEET_NAMES.SELECTION);

  if (!customerSheet) {
    ui.alert('エラー', '顧客マスタシートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  var updated = 0;
  var now = new Date();

  // 顧客マスタを顧客IDでインデックス化
  var custLastRow = customerSheet.getLastRow();
  if (custLastRow < 2) {
    ui.alert('ステータス同期', '顧客マスタにデータがありません。', ui.ButtonSet.OK);
    return;
  }

  var custData = customerSheet.getRange(2, 1, custLastRow - 1,
    Math.max(CUSTOMER_COL.STATUS, CUSTOMER_COL.CA) + 1).getValues();

  // 顧客ID → { rowIndex, currentStatus, ca }
  var custIndex = {};
  custData.forEach(function(row, i) {
    var id = String(row[CUSTOMER_COL.ID] || '').trim();
    if (id) custIndex[id] = {
      rowIndex: i + 2,  // 実際のシート行番号
      status:   String(row[CUSTOMER_COL.STATUS] || '').trim(),
      ca:       String(row[CUSTOMER_COL.CA]     || '').trim()
    };
  });

  // --- 面談管理から同期 ---
  // 面談ステータスが「実施済」→ 顧客ステータスを「面談実施済み」に
  // 面談ステータスが「キャンセル」/「無断キャンセル」→「面談キャンセル」に
  if (meetingSheet && meetingSheet.getLastRow() >= 2) {
    var mtgCols = MEETING_COL.STATUS + 1;
    var mtgData = meetingSheet.getRange(2, 1, meetingSheet.getLastRow() - 1, mtgCols).getValues();

    mtgData.forEach(function(row) {
      var custId    = String(row[MEETING_COL.CUST_ID] || '').trim();
      var mtgStatus = String(row[MEETING_COL.STATUS]  || '').trim();
      var mtgDate   = row[MEETING_COL.MTG_DATE];

      if (!custId || !custIndex[custId]) return;

      var cust = custIndex[custId];
      var newStatus = null;

      if (mtgStatus === '実施済') {
        newStatus = '面談実施済み';
      } else if (mtgStatus === 'キャンセル' || mtgStatus === '無断キャンセル') {
        newStatus = '面談キャンセル';
      } else if (mtgStatus === 'リスケ') {
        newStatus = 'リスケ調整中';
      } else if (mtgStatus === '予約済' && mtgDate instanceof Date && mtgDate > now) {
        newStatus = '面談予約済み';
      }

      if (newStatus && cust.status !== newStatus) {
        customerSheet.getRange(cust.rowIndex, CUSTOMER_COL.STATUS + 1).setValue(newStatus);
        customerSheet.getRange(cust.rowIndex, CUSTOMER_COL.UPDATED_AT + 1).setValue(now);
        cust.status = newStatus;
        updated++;
      }
    });
  }

  // --- 選考管理から同期 ---
  // 選考ステータス → 顧客ステータスのマッピング
  var selectionStatusMap = {
    '書類選考中':     '書類選考中',
    '一次面接予定':   '一次面接予定',
    '一次結果待ち':   '一次面接結果待ち',
    '最終面接予定':   '最終面接予定',
    '内定':           '内定',
    '承諾':           '承諾',
    '辞退':           '辞退',
    'お見送り':       '失注'
  };

  if (selectionSheet && selectionSheet.getLastRow() >= 2) {
    // 選考ID(0), 顧客ID(1), 氏名(2), 企業名(3), 求人名(4), 応募日(5),
    // 選考ステータス(6), ...
    var selData = selectionSheet.getRange(2, 1, selectionSheet.getLastRow() - 1, 7).getValues();

    selData.forEach(function(row) {
      var custId    = String(row[1] || '').trim();
      var selStatus = String(row[6] || '').trim();
      if (!custId || !custIndex[custId]) return;

      var newStatus = selectionStatusMap[selStatus];
      if (!newStatus) return;

      var cust = custIndex[custId];
      if (cust.status !== newStatus) {
        customerSheet.getRange(cust.rowIndex, CUSTOMER_COL.STATUS + 1).setValue(newStatus);
        customerSheet.getRange(cust.rowIndex, CUSTOMER_COL.UPDATED_AT + 1).setValue(now);
        cust.status = newStatus;
        updated++;
      }
    });
  }

  appendLog_(ss, 'ステータス同期', 'syncCustomerStatus',
    updated + '件の顧客ステータスを更新しました', '成功', '');

  ui.alert('ステータス同期完了',
    updated + '件の顧客ステータスを更新しました。\n\n' +
    '面談管理・選考管理の状況を顧客マスタに反映しました。',
    ui.ButtonSet.OK);
}
