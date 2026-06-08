/**
 * Foresma Lreach CRM → スプレッドシート 転送ブックマークレット
 *
 * 対象URL: lreach-crm-prototype.vercel.app/referrals
 *
 * 【登録方法】
 * 1. このファイルの内容をすべてコピー
 * 2. ブラウザのブックマークを新規作成
 * 3. URLの欄に貼り付け（ファイル先頭の javascript: から末尾まで）
 * 4. 名前: 「CRM: Lreach取込」
 *
 * 【使い方】
 * Lreach CRM の「顧客管理」ページを開いてブックマークをクリック
 *
 * 【注意】
 * - ブックマークとして保存する際、ファイル内の改行・コメントは削除してください
 * - 日本語文字は \uXXXX 形式にエスケープしてある版（lreach_bookmarklet.min.js）を使用してください
 */
javascript:(function(){

  // ============================================================
  // ★ CRM WebアプリのURL ★
  // ============================================================
  var ENDPOINT_URL = 'https://omoroi-crm.vercel.app/api/ingest/lreach';
  var INGEST_TOKEN = 'crm-ingest-secret-2024';

  // ============================================================
  // Step1: __NEXT_DATA__ からAPIデータを取得（最優先）
  // ============================================================
  function getRecordsFromNextData() {
    try {
      var nd = window.__NEXT_DATA__;
      if (!nd) return null;
      return findArraysInObject(nd.props);
    } catch(e) { return null; }
  }

  function findArraysInObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var keys = ['reservations', 'referrals', 'customers', 'leads', 'records'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(obj[keys[i]]) && obj[keys[i]].length > 0) return obj[keys[i]];
    }
    for (var k in obj) {
      if (typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
        var found = findArraysInObject(obj[k]);
        if (found) return found;
      }
    }
    return null;
  }

  // ============================================================
  // Step2: ReactのFiberノードからstateを取得
  // ============================================================
  function getRecordsFromReact() {
    try {
      var root = document.querySelector('#__next');
      if (!root) return null;
      var fiberKey = Object.keys(root).find(function(k){
        return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
      });
      if (!fiberKey) return null;
      return searchFiber(root[fiberKey], 0);
    } catch(e) { return null; }
  }

  function searchFiber(fiber, depth) {
    if (!fiber || depth > 25) return null;
    try {
      var state = fiber.memoizedState;
      while (state) {
        var ms = state.memoizedState;
        if (Array.isArray(ms) && ms.length > 3) {
          var f = ms[0];
          if (f && typeof f === 'object' && (f.name || f.id || f.email)) return ms;
        }
        state = state.next;
      }
    } catch(e) {}
    return searchFiber(fiber.child, depth+1) || searchFiber(fiber.sibling, depth+1);
  }

  // ============================================================
  // Step3: DOMテーブルから取得（フォールバック）
  // ============================================================
  function getRecordsFromDOM() {
    var rows = document.querySelectorAll('table tbody tr');
    if (rows.length === 0) return [];
    var records = [];
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      var t = function(i){ return cells[i] ? cells[i].innerText.trim().replace(/\s+/g,' ') : ''; };
      var name = t(0);
      if (!name) return;
      var memo   = t(6);
      var parsed = parseMemo(memo);
      records.push({
        name:         name,
        sendDate:     normDate(t(2)),
        ca:           t(5) === '-' ? '' : t(5),
        timing:       parsed.timing,
        salary:       parsed.salary,
        hopeSalary:   parsed.hopeSalary,
        note:         memo,
        lreachStatus: t(1)
      });
    });
    return records;
  }

  // ============================================================
  // __NEXT_DATA__ / React Fiber の生データ → CRMフォーマット変換
  // ============================================================
  function normalize(rec) {
    var memo   = rec.hearingMemo || rec.memo || rec.note || rec.comment || rec['ヒアリングメモ'] || '';
    var parsed = parseMemo(memo);
    var phone  = rec.phone || rec.tel || rec.phoneNumber || rec['電話番号'] || parsed.phone || '';
    var email  = rec.email || rec.mailAddress || rec.emailAddress || rec['メールアドレス'] || parsed.email || '';
    return {
      name:         rec.name       || rec.customerName  || rec.fullName    || '',
      kana:         rec.kana       || rec.furigana       || parsed.kana    || '',
      email:        email,
      phone:        phone,
      age:          rec.age        || parsed.age         || '',
      gender:       rec.gender     || parsed.gender      || '',
      sendDate:     normDate(rec.referralDate || rec.createdAt || rec.scheduledAt || rec.interviewDate || ''),
      ca:           rec.staffName  || rec.assignee       || rec['担当者']      || '',
      timing:       parsed.timing  || rec.transferTiming || '',
      salary:       parsed.salary  || String(rec.currentSalary  || ''),
      hopeSalary:   parsed.hopeSalary || String(rec.desiredSalary || ''),
      note:         memo,
      foresmaId:    rec.id         || rec.referralId     || ''
    };
  }

  // ============================================================
  // ヒアリングメモのパース（型別正規表現）
  // ============================================================
  function parseMemo(memo) {
    var r = { salary: '', hopeSalary: '', timing: '', phone: '', email: '', kana: '', age: '', gender: '' };
    if (!memo) return r;
    // フリガナ: ひらがな・カタカナのみ
    var kanaM = memo.match(/(?:ふりがな|フリガナ|読み)[\s　]*[：:]\s*([぀-ヿ゠･\s　]+?)(?=\s*\S+[：:]|\s*$)/);
    if (kanaM) r.kana = kanaM[1].trim();
    // 電話番号: 数字・ハイフンのみ
    var phoneM = memo.match(/電話番号[\s　]*[：:]\s*(\d[\d\-\s]{8,14})/);
    if (phoneM) r.phone = phoneM[1].replace(/\s/g,'').trim();
    // メールアドレス: メール形式のみ
    var emailM = memo.match(/(?:メールアドレス|Email|email)[\s　]*[：:]\s*([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/);
    if (emailM) r.email = emailM[1].trim();
    // 性別: 男性/女性
    var genderM = memo.match(/性別[\s　]*[：:]\s*(男性?|女性?)/);
    if (genderM) r.gender = genderM[1].trim();
    // 生年月日 → 年齢計算
    var birthM = memo.match(/生年月日[\s　]*[：:]\s*(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
    if (birthM) {
      var today = new Date();
      var age = today.getFullYear() - parseInt(birthM[1]);
      var md = today.getMonth() + 1 - parseInt(birthM[2]);
      if (md < 0 || (md === 0 && today.getDate() < parseInt(birthM[3]))) age--;
      r.age = String(age);
    }
    var s  = memo.match(/現[在職]?年収\s*[：:]\s*([\d,，万円]+)/);
    var hs = memo.match(/希望年収\s*[：:]\s*([\d,，万円]+)/);
    var t  = memo.match(/転職時期\s*[：:]\s*([^\n。、　]{1,30})/);
    if (s)  r.salary     = s[1].trim();
    if (hs) r.hopeSalary = hs[1].trim();
    if (t)  r.timing     = t[1].trim();
    return r;
  }

  function normDate(str) {
    if (!str) return '';
    var m = str.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (!m) return str;
    return m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2);
  }

  // ============================================================
  // データ取得
  // ============================================================
  var raw     = getRecordsFromNextData() || getRecordsFromReact();
  var records;

  if (raw && raw.length > 0) {
    records = raw.map(normalize).filter(function(r){ return r.name; });
  } else {
    records = getRecordsFromDOM().filter(function(r){ return r.name; });
  }

  if (records.length === 0) {
    alert('【CRM取込】データが取得できませんでした。\nLreach CRMの「顧客管理」ページを開いた状態で実行してください。');
    return;
  }

  // ============================================================
  // 確認ダイアログ
  // ============================================================
  var preview = records.slice(0, 5).map(function(r){ return '・' + r.name + (r.phone ? ' (' + r.phone + ')' : ''); }).join('\n');
  if (records.length > 5) preview += '\n  ほか ' + (records.length - 5) + '件';

  if (!confirm('【CRM取込】' + records.length + '件を処理します。\n（新規登録 + 既存顧客の空欄補完）\n\n' + preview + '\n\nCRMに送信しますか？')) return;

  // ============================================================
  // about:blank ポップアップ経由でCRM APIに送信
  // ============================================================
  var payloadJson = JSON.stringify({ records: records });

  var w = window.open('', '_blank', 'width=360,height=180,left=100,top=100');
  if (!w) {
    alert('ポップアップがブロックされています。\nアドレスバー右端のアイコンをクリックして\nlreach-crm-prototype.vercel.appのポップアップを許可してください。');
    return;
  }

  var escUrl   = JSON.stringify(ENDPOINT_URL);
  var escToken = JSON.stringify(INGEST_TOKEN);
  var escBody  = JSON.stringify(payloadJson);
  var cnt      = records.length;

  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>body{font-family:sans-serif;padding:20px;background:#f0f4ff;margin:0}' +
    'p{font-size:15px;color:#333;margin:0 0 8px}' +
    '.sub{font-size:12px;color:#666}</style>' +
    '</head><body>' +
    '<p id="s">&#128228; CRMに送信中... (' + cnt + '件)</p>' +
    '<p class="sub" id="d">このウィンドウを閉じないでください</p>' +
    '<script>' +
    'var url=' + escUrl + ';' +
    'var token=' + escToken + ';' +
    'var body=' + escBody + ';' +
    'fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-ingest-token":token},body:body})' +
    '.then(function(r){return r.json();})' +
    '.then(function(d){' +
    '  document.getElementById("s").textContent="✅ 完了！ 新規:"+d.added+"件 更新:"+d.updated+"件 スキップ:"+d.skipped+"件";' +
    '  document.getElementById("d").textContent="このウィンドウを閉じてください";' +
    '  try{window.opener.postMessage("crm_ok_"+d.added+"_"+d.updated,"*");}catch(e){}' +
    '  setTimeout(function(){try{window.close();}catch(e){}},3000);' +
    '})' +
    '.catch(function(err){' +
    '  document.getElementById("s").textContent="❌ エラー: "+err.message;' +
    '  document.getElementById("d").textContent="エラーが発生しました";' +
    '});' +
    '<\/script></body></html>'
  );
  w.document.close();

  // postMessage で送信完了を受け取る
  var done = false;
  function onMsg(ev) {
    if (typeof ev.data === 'string' && ev.data.indexOf('crm_ok_') === 0 && !done) {
      done = true;
      window.removeEventListener('message', onMsg);
      var parts = ev.data.replace('crm_ok_','').split('_');
      var addedN = parts[0], updatedN = parts[1];
      alert('【CRM取込 完了】\n✅ 新規登録: ' + addedN + '件\n🔄 情報補完（更新）: ' + updatedN + '件\n\nおもろいCRMを確認してください。');
    }
  }
  window.addEventListener('message', onMsg);
  setTimeout(function(){
    if (!done) {
      done = true;
      window.removeEventListener('message', onMsg);
      alert('【CRM取込】送信しました。おもろいCRMを確認してください。');
    }
  }, 10000);

})();
