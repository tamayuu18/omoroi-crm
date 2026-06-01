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
// ダッシュボード更新（全指標を集計して書き込む）
// ============================================================
function updateDashboard() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ui   = SpreadsheetApp.getUi();
  var dash = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!dash) { ui.alert('エラー', 'ダッシュボードシートが見つかりません。', ui.ButtonSet.OK); return; }

  var now       = new Date();
  var today     = new Date(now); today.setHours(0,0,0,0);
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // --- データ読み込み ---
  var custSheet  = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var taskSheet  = ss.getSheetByName(SHEET_NAMES.TASK);
  var mtgSheet   = ss.getSheetByName(SHEET_NAMES.MEETING);
  var yomiSheet  = ss.getSheetByName(SHEET_NAMES.YOMI);

  var custData = custSheet && custSheet.getLastRow() >= 2
    ? custSheet.getRange(2, 1, custSheet.getLastRow()-1, 26).getValues() : [];
  var taskData = taskSheet && taskSheet.getLastRow() >= 2
    ? taskSheet.getRange(2, 1, taskSheet.getLastRow()-1, 11).getValues() : [];
  var mtgData  = mtgSheet  && mtgSheet.getLastRow()  >= 2
    ? mtgSheet.getRange(2, 1, mtgSheet.getLastRow()-1, 9).getValues()   : [];
  var yomiData = yomiSheet && yomiSheet.getLastRow() >= 2
    ? yomiSheet.getRange(2, 1, yomiSheet.getLastRow()-1, 18).getValues(): [];

  // --- ステータス別集計 ---
  var statusCount = {}; var caCount = {};
  custData.forEach(function(r) {
    var s  = String(r[CUSTOMER_COL.STATUS] || '').trim();
    var ca = String(r[CUSTOMER_COL.CA]     || '未設定').trim();
    var rd = r[CUSTOMER_COL.REG_DATE];
    statusCount[s] = (statusCount[s] || 0) + 1;
    if (!caCount[ca]) caCount[ca] = { total:0, newMonth:0 };
    caCount[ca].total++;
    if (rd instanceof Date && rd >= monthStart) caCount[ca].newMonth++;
  });

  // --- タスク集計 ---
  var taskOverdue = 0; var taskToday = 0; var taskThisWeek = 0;
  var weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  taskData.forEach(function(r) {
    var st = String(r[TASK_COL.STATUS]   || '').trim();
    var dl = r[TASK_COL.DEADLINE];
    if (st === '完了' || st === '保留') return;
    if (!(dl instanceof Date)) return;
    var d = new Date(dl); d.setHours(0,0,0,0);
    if (d < today)          taskOverdue++;
    else if (d.getTime() === today.getTime()) taskToday++;
    else if (d <= weekEnd)  taskThisWeek++;
  });

  // --- 面談集計 ---
  var mtgToday = 0; var mtgMonth = 0;
  mtgData.forEach(function(r) {
    var d = r[MEETING_COL.MTG_DATE];
    if (!(d instanceof Date)) return;
    var day = new Date(d); day.setHours(0,0,0,0);
    if (day.getTime() === today.getTime()) mtgToday++;
    if (d >= monthStart) mtgMonth++;
  });

  // --- ヨミ集計 ---
  // YOMI列: ヨミID(0),顧客ID(1),氏名(2),担当CA(3),現在ステータス(4),ヨミランク(5),
  //         成約確度(6),想定成約月(7),想定入社日(8),想定年収(9),手数料率(10),
  //         想定売上(11),加重売上(12),...
  var yomiSummary = { A:0, B:0, C:0, sales:0, weighted:0 };
  yomiData.forEach(function(r) {
    var rank     = String(r[5]  || '').trim();
    var sales    = Number(r[11] || 0);
    var weighted = Number(r[12] || 0);
    if (rank === 'A') yomiSummary.A++;
    if (rank === 'B') yomiSummary.B++;
    if (rank === 'C') yomiSummary.C++;
    yomiSummary.sales    += sales;
    yomiSummary.weighted += weighted;
  });

  // --- 月次KPI ---
  var monthlyKpi = { sent:0, mtgBooked:0, mtgDone:0, applied:0, offer:0, accept:0, joined:0 };
  custData.forEach(function(r) {
    var rd = r[CUSTOMER_COL.REG_DATE];
    var st = String(r[CUSTOMER_COL.STATUS] || '').trim();
    if (rd instanceof Date && rd >= monthStart) monthlyKpi.sent++;
  });
  mtgData.forEach(function(r) {
    var d = r[MEETING_COL.MTG_DATE];
    var st = String(r[MEETING_COL.STATUS] || '').trim();
    if (!(d instanceof Date) || d < monthStart) return;
    if (st === '予約済') monthlyKpi.mtgBooked++;
    if (st === '実施済') monthlyKpi.mtgDone++;
  });
  custData.forEach(function(r) {
    var st = String(r[CUSTOMER_COL.STATUS] || '').trim();
    var ud = r[CUSTOMER_COL.UPDATED_AT];
    if (!(ud instanceof Date) || ud < monthStart) return;
    if (['応募済み','書類選考中','一次面接予定','一次面接結果待ち','最終面接予定','最終面接結果待ち','内定','承諾','入社予定','入社済み'].indexOf(st) >= 0) monthlyKpi.applied++;
    if (st === '内定' || st === '承諾' || st === '入社予定' || st === '入社済み') monthlyKpi.offer++;
    if (st === '承諾' || st === '入社予定' || st === '入社済み') monthlyKpi.accept++;
    if (st === '入社済み') monthlyKpi.joined++;
  });

  // --- ダッシュボードに書き込む ---
  function findRow_(label) {
    var vals = dash.getRange(1, 1, dash.getLastRow(), 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === label) return i + 1;
    }
    return -1;
  }
  function setVal_(label, val) {
    var r = findRow_(label);
    if (r > 0) dash.getRange(r, 2).setValue(val);
  }

  dash.getRange(findRow_('最終更新'), 2).setValue(now);

  // 日次確認
  setVal_('本日の面談予定数',    mtgToday);
  setVal_('本日の対応タスク数',  taskToday);
  setVal_('期限超過タスク数',    taskOverdue);
  setVal_('新規送客数（本日）',  statusCount['新規送客'] || 0);
  setVal_('初回未対応数',        statusCount['初回未対応'] || 0);
  setVal_('面談後未更新数',      statusCount['面談実施済み'] || 0);

  // ヨミ管理
  setVal_('Aヨミ件数', yomiSummary.A);
  setVal_('Bヨミ件数', yomiSummary.B);
  setVal_('Cヨミ件数', yomiSummary.C);
  setVal_('今月の想定売上合計', yomiSummary.sales);
  setVal_('今月の加重売上合計', yomiSummary.weighted);

  // CA別KPI
  var caRow = findRow_('CA名');
  if (caRow > 0) {
    var caNames = Object.keys(caCount).filter(function(c){ return c !== '未設定'; }).sort();
    caNames.forEach(function(ca, i) {
      var mtgCount = mtgData.filter(function(r){
        return String(r[MEETING_COL.CA] || '').trim() === ca && r[MEETING_COL.MTG_DATE] instanceof Date && r[MEETING_COL.MTG_DATE] >= monthStart;
      }).length;
      dash.getRange(caRow + 1 + i, 1).setValue(ca);
      dash.getRange(caRow + 1 + i, 2).setValue(caCount[ca].total);
      dash.getRange(caRow + 1 + i, 3).setValue(mtgCount);
      dash.getRange(caRow + 1 + i, 4).setValue('');
    });
  }

  // 月次KPI
  setVal_('月間送客数',     monthlyKpi.sent);
  setVal_('月間面談予約数', monthlyKpi.mtgBooked);
  setVal_('月間面談実施数', monthlyKpi.mtgDone);
  setVal_('月間応募数',     monthlyKpi.applied);
  setVal_('月間内定数',     monthlyKpi.offer);
  setVal_('月間承諾数',     monthlyKpi.accept);
  setVal_('月間入社数',     monthlyKpi.joined);

  // ファネル
  setVal_('① 送客数', custData.length);
  var funnelLabels = {
    '② 初回連絡済み': ['初回連絡済み','不通'],
    '③ 面談設定済み': ['面談予約済み'],
    '④ 面談実施済み': ['面談実施済み','求人提案中','応募意思確認中'],
    '⑤ 応募済み':     ['応募済み','書類選考中','一次面接予定','一次面接結果待ち','最終面接予定','最終面接結果待ち'],
    '⑥ 内定':         ['内定','承諾','入社予定','入社済み']
  };
  Object.keys(funnelLabels).forEach(function(label) {
    var cnt = funnelLabels[label].reduce(function(sum, s){ return sum + (statusCount[s] || 0); }, 0);
    setVal_(label, cnt);
  });

  // タスク期限状況をステータスビューの後に追記
  updateStatusView();

  appendLog_(ss, 'ダッシュボード更新', 'updateDashboard', '全指標を更新しました', '成功', '');
  ui.alert('ダッシュボード更新完了',
    '以下を更新しました:\n' +
    '・日次確認\n・ヨミ管理\n・CA別KPI\n・月次KPI\n・ファネル\n・ステータス別件数',
    ui.ButtonSet.OK);
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

// ============================================================
// ヨミ管理: 顧客マスタからヨミランク付き顧客を同期
// ============================================================
function syncYomiData() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var ui        = SpreadsheetApp.getUi();
  var custSheet = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  var yomiSheet = ss.getSheetByName(SHEET_NAMES.YOMI);
  if (!custSheet || !yomiSheet) {
    ui.alert('エラー', '必要なシートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  var now     = new Date();
  var added   = 0;
  var updated = 0;

  // 既存ヨミ管理を顧客IDでインデックス化
  // YOMI列: ヨミID(0),顧客ID(1),氏名(2),担当CA(3),現在ステータス(4),ヨミランク(5),...最終更新日(17)
  var yomiIndex = {};
  if (yomiSheet.getLastRow() >= 2) {
    var yomiVals = yomiSheet.getRange(2, 1, yomiSheet.getLastRow()-1, 18).getValues();
    yomiVals.forEach(function(r, i) {
      var cid = String(r[1] || '').trim();
      if (cid) yomiIndex[cid] = { row: i + 2, data: r };
    });
  }

  if (custSheet.getLastRow() < 2) {
    ui.alert('ヨミ管理同期', '顧客マスタにデータがありません。', ui.ButtonSet.OK);
    return;
  }

  var custData = custSheet.getRange(2, 1, custSheet.getLastRow()-1, 26).getValues();

  // ヨミ対象ステータス（面談以降の進行中顧客）
  var yomiTargetStatus = [
    '面談実施済み', '求人提案中', '応募意思確認中', '応募済み',
    '書類選考中', '一次面接予定', '一次面接結果待ち',
    '最終面接予定', '最終面接結果待ち', '内定', '承諾', '入社予定'
  ];

  // ステータス → デフォルトヨミランクのマッピング
  var statusToRank = {
    '面談実施済み':       'D',
    '求人提案中':         'D',
    '応募意思確認中':     'D',
    '応募済み':           'C',
    '書類選考中':         'C',
    '一次面接予定':       'C',
    '一次面接結果待ち':   'C',
    '最終面接予定':       'B',
    '最終面接結果待ち':   'B',
    '内定':               'A',
    '承諾':               'A',
    '入社予定':           'A'
  };

  custData.forEach(function(r) {
    var custId = String(r[CUSTOMER_COL.ID]     || '').trim();
    var name   = String(r[CUSTOMER_COL.NAME]   || '').trim();
    var ca     = String(r[CUSTOMER_COL.CA]     || '').trim();
    var status = String(r[CUSTOMER_COL.STATUS] || '').trim();
    var yomiRank = String(r[CUSTOMER_COL.YOMI_RANK] || '').trim();

    if (!custId || !name) return;

    // ヨミランクが設定されているか、ヨミ対象ステータスの顧客を対象
    var defaultRank = statusToRank[status] || yomiRank;
    if (!defaultRank && yomiTargetStatus.indexOf(status) < 0) return;

    var rank = yomiRank || defaultRank || 'D';

    if (yomiIndex[custId]) {
      // 既存行: ステータス・ヨミランク・最終更新日のみ更新
      var existRow = yomiIndex[custId].row;
      yomiSheet.getRange(existRow, 3).setValue(name);
      yomiSheet.getRange(existRow, 4).setValue(ca);
      yomiSheet.getRange(existRow, 5).setValue(status);
      if (!yomiIndex[custId].data[5]) {  // ヨミランク未設定なら自動設定
        yomiSheet.getRange(existRow, 6).setValue(rank);
      }
      yomiSheet.getRange(existRow, 18).setValue(now);
      updated++;
    } else {
      // 新規行追加
      var yomiId = 'Y-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') +
        '-' + String(yomiSheet.getLastRow()).padStart(3, '0');
      var newRow = [
        yomiId, custId, name, ca, status, rank,
        '', '', '', '', '', '', '', '', '',  // 成約確度〜ネック要因（手動入力）
        '', '', now                           // 次回アクション, 期限, 最終更新日
      ];
      yomiSheet.appendRow(newRow);
      yomiIndex[custId] = { row: yomiSheet.getLastRow(), data: newRow };
      added++;
    }
  });

  appendLog_(ss, 'ヨミ管理同期', 'syncYomiData',
    added + '件追加、' + updated + '件更新', '成功', '');
  ui.alert('ヨミ管理同期完了',
    '✅ 新規追加: ' + added + '件\n🔄 更新: ' + updated + '件\n\n' +
    '想定売上・手数料率はヨミ管理シートで直接入力してください。',
    ui.ButtonSet.OK);
}
