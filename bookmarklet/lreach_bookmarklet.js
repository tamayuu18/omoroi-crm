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
 */
javascript:(function(){

  // ============================================================
  // ★ GASウェブアプリのURL（デプロイ済み）★
  // ============================================================
  var ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxrAa8KzeSUafmNNIRrTCiSMm12smGTNtnhgPCAkHsNiIHy1WtGbPetj9WHZbrb9Ikj/exec';

  // ============================================================
  // Step1: __NEXT_DATA__ からAPIデータを取得（最優先）
  // Next.js(Vercel)アプリはここにサーバーサイドデータを持つ
  // コンソールに "Loaded reservations: 76 ▶ Array(76)" が出ているため
  // "reservations" キーを最優先で探す
  // ============================================================
  function getRecordsFromNextData() {
    try {
      var nd = window.__NEXT_DATA__;
      if (!nd) return null;
      return findArraysInObject(nd.props, 'reservations', 'referrals', 'customers', 'leads', 'records');
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
  // 列順（実際の画面確認済み）:
  //   名前 | ステータス | 面談日 | 開始時間 | 終了時間 | 担当者 | ヒアリングメモ
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
    var memo   = rec.hearingMemo || rec.memo || rec.note || rec.comment || rec.ヒアリングメモ || '';
    var parsed = parseMemo(memo);
    // メモから電話番号・メールが取れない場合はAPI直接フィールドを使う
    var phone  = rec.phone || rec.tel || rec.phoneNumber || rec.電話番号 || parsed.phone || '';
    var email  = rec.email || rec.mailAddress || rec.emailAddress || rec.メールアドレス || parsed.email || '';
    return {
      name:         rec.name       || rec.customerName  || rec.fullName    || '',
      kana:         rec.kana       || rec.furigana       || parsed.kana    || '',
      email:        email,
      phone:        phone,
      age:          rec.age        || parsed.age         || '',
      gender:       rec.gender     || parsed.gender      || '',
      sendDate:     normDate(rec.referralDate || rec.createdAt || rec.scheduledAt || rec.interviewDate || ''),
      ca:           rec.staffName  || rec.assignee       || rec.担当者      || '',
      timing:       parsed.timing  || rec.transferTiming || '',
      salary:       parsed.salary  || String(rec.currentSalary  || ''),
      hopeSalary:   parsed.hopeSalary || String(rec.desiredSalary || ''),
      note:         memo,
      foresmaId:    rec.id         || rec.referralId     || ''
    };
  }

  // ============================================================
  // ヒアリングメモのパース
  // メモ形式例:
  //   名前　：生駒翔平
  //   ふりがな　：いこましょうへい
  //   性別　：男性
  //   生年月日　：1996年7月23日
  //   電話番号　：07017719439
  //   現年収　：300万
  //   希望年収　：300万
  //   転職時期　：良いところがあればすぐに
  // ============================================================
  function parseMemo(memo) {
    var r = { salary: '', hopeSalary: '', timing: '', phone: '', email: '', kana: '', age: '', gender: '' };
    if (!memo) return r;
    function mf(patterns) {
      for (var i = 0; i < patterns.length; i++) {
        var m = memo.match(new RegExp(patterns[i] + '[\\s　]*[：:][\\s　]*([^\\n]+)'));
        if (m) return m[1].trim();
      }
      return '';
    }
    r.phone     = mf(['電話番号']);
    r.email     = mf(['メールアドレス', 'Email', 'email']);
    r.kana      = mf(['ふりがな', 'フリガナ', '読み']);
    r.gender    = mf(['性別']);
    var birth   = mf(['生年月日']);
    if (birth) {
      // 生年月日から年齢を計算
      var bm = birth.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
      if (bm) {
        var today = new Date();
        var age = today.getFullYear() - parseInt(bm[1]);
        var monthDiff = today.getMonth() + 1 - parseInt(bm[2]);
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parseInt(bm[3]))) age--;
        r.age = String(age);
      }
    }
    var s  = memo.match(/現[在職]?年収\s*[：:]\s*([\d,，万円]+)/);
    var hs = memo.match(/希望年収\s*[：:]\s*([\d,，万円]+)/);
    var t  = memo.match(/転職時期\s*[：:]\s*([^\n。、]+)/);
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
  var preview = records.slice(0, 5).map(function(r){ return '・' + r.name; }).join('\n');
  if (records.length > 5) preview += '\n  ほか ' + (records.length - 5) + '件';

  if (!confirm('【CRM取込】' + records.length + '件を取り込みます。\n\n' + preview + '\n\nスプレッドシートに送信しますか？')) return;

  // ============================================================
  // GASエンドポイントに送信
  // ============================================================
  // LreachのCSPがform-actionをブロックするため、about:blankの新ウィンドウ経由で送信する。
  // about:blankはLreachのCSPを継承しないため制約なしに送信できる。
  var payloadJson = JSON.stringify({ records: records });

  var w = window.open('about:blank', '_blank');
  if (!w) {
    alert('ポップアップがブロックされました。\nアドレスバー右端のポップアップブロックアイコンをクリックして許可してください。');
    return;
  }

  w.document.write(
    '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:30px">' +
    '<p style="font-size:18px">&#128228; CRMに送信中... (' + records.length + '件)</p>' +
    '<p style="color:#666">このウィンドウは自動的に閉じます。</p>' +
    '<form id="f" method="POST" action="' + ENDPOINT_URL + '">' +
    '<input type="hidden" name="payload" id="p">' +
    '</form>' +
    '<scr' + 'ipt>' +
    'document.getElementById("p").value=' + JSON.stringify(payloadJson) + ';' +
    'document.getElementById("f").submit();' +
    'setTimeout(function(){' +
    'document.body.innerHTML="<p style=\'font-size:20px;color:green\'>&#10003; 送信完了！このタブを閉じてください。</p>";' +
    '},2000);' +
    '</scr' + 'ipt>' +
    '</body></html>'
  );
  w.document.close();

  setTimeout(function() {
    alert('【CRM取込 送信完了】\n✅ ' + records.length + '件を送信しました。\n\nForesma取込シートを確認してください。\n次に「Foresmaデータを取り込む」を実行して顧客マスタに反映してください。');
  }, 3000);

})();
