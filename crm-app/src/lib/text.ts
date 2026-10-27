// 文字列の正規化（PDF・HTML取込で共用）

// 康熙部首（U+2F00〜）など、見た目が同じ別コードポイントを通常の漢字に揃える
// （ブラウザ印刷のPDFやWebページで、フォント置換により「力」が「⼒」になっていることがある）
export function normalizeGlyphs(s: string): string {
  return s.replace(/[⺀-⻳⼀-⿕]/g, c => c.normalize('NFKC'))
}
