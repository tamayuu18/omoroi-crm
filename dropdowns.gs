// ============================================================
// プルダウン（データバリデーション）設定
// ============================================================

// メニューから直接呼び出す用ラッパー
function applyAllDropdowns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  applyAllDropdowns_(ss);
  SpreadsheetApp.getUi().alert('プルダウン設定完了', '各シートのプルダウンを設定しました。', SpreadsheetApp.getUi().ButtonSet.OK);
}

function applyAllDropdowns_(ss) {
  applyCustomerDropdowns_(ss);
  applyForesmaDropdowns_(ss);
  applyTimeRexDropdowns_(ss);
  applyMeetingDropdowns_(ss);
  applySelectionDropdowns_(ss);
  applyTaskDropdowns_(ss);
}

// ============================================================
// 顧客マスタ
// 列: 顧客ID(A), 登録日(B), 最終更新日(C), 流入元(D), Foresma管理ID(E),
//     氏名(F), フリガナ(G), 電話番号(H), メールアドレス(I), 年齢(J),
//     性別(K), 居住地(L), 現職企業名(M), 現職職種(N), 現在年収(O),
//     希望職種(P), 希望勤務地(Q), 希望年収(R), 転職希望時期(S),
//     担当CA(T), 顧客ステータス(U), ヨミランク(V),
//     次回アクション(W), 次回アクション期限(X), 最終対応日(Y), 備考(Z)
// ============================================================
function applyCustomerDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.CUSTOMER);
  if (!sheet) return;

  // 顧客ステータス → U列 (21)
  setDropdown_(sheet, 2, 21, MASTER.CUSTOMER_STATUS);
  // ヨミランク → V列 (22)
  setDropdown_(sheet, 2, 22, MASTER.YOMI_RANK);
  // 性別 → K列 (11)
  setDropdown_(sheet, 2, 11, ['男性', '女性']);
  // 流入元 → D列 (4)
  setDropdown_(sheet, 2, 4, ['Foresma', 'Lreach', 'TimeRex', '紹介', 'その他']);
}

// ============================================================
// Foresma取込シート
// 取込ステータス(A)
// ============================================================
function applyForesmaDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.FORESMA);
  if (!sheet) return;
  setDropdown_(sheet, 2, 1, MASTER.IMPORT_STATUS);
}

// ============================================================
// TimeRex取込シート
// 取込ステータス(A)
// ============================================================
function applyTimeRexDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.TIMEREX);
  if (!sheet) return;
  setDropdown_(sheet, 2, 1, MASTER.IMPORT_STATUS);
}

// ============================================================
// 面談管理
// 列順: 面談ID, 顧客ID, 氏名, 担当CA,
//       面談予定日, 面談開始時間, 面談終了時間, 面談方法, 面談ステータス(9),
//       リマインド状況(10), 面談結果(11), 温度感(12), 求人提案有無(13), 備考
// ============================================================
function applyMeetingDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.MEETING);
  if (!sheet) return;
  setDropdown_(sheet, 2, 8,  MASTER.MEETING_METHOD);   // 面談方法
  setDropdown_(sheet, 2, 9,  MASTER.MEETING_STATUS);   // 面談ステータス
  setDropdown_(sheet, 2, 10, MASTER.REMIND_STATUS);    // リマインド状況
  setDropdown_(sheet, 2, 12, ['高', '中', '低']);       // 温度感
  setDropdown_(sheet, 2, 13, ['あり', 'なし']);          // 求人提案有無
}

// ============================================================
// 選考管理
// 列順: 選考ID, 顧客ID, 氏名, 企業名, 求人名, 応募日,
//       選考ステータス(7), 面接予定日, ...
// ============================================================
function applySelectionDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.SELECTION);
  if (!sheet) return;
  setDropdown_(sheet, 2, 7, MASTER.SELECTION_STATUS);  // 選考ステータス
}

// ============================================================
// タスク管理
// 列順: タスクID, 顧客ID, 氏名, 担当CA,
//       タスク内容, タスク期限, タスクステータス(7), 優先度(8), ...
// ============================================================
function applyTaskDropdowns_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.TASK);
  if (!sheet) return;
  setDropdown_(sheet, 2, 7, MASTER.TASK_STATUS);       // タスクステータス
  setDropdown_(sheet, 2, 8, ['高', '中', '低']);        // 優先度
}

// ============================================================
// ヘルパー: 指定列の2行目〜1000行目にプルダウンを設定
// col は1始まり
// ============================================================
function setDropdown_(sheet, startRow, col, values) {
  var maxRow  = 1000;
  var numRows = maxRow - startRow + 1;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(startRow, col, numRows, 1).setDataValidation(rule);
}
