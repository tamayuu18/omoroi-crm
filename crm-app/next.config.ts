import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist は Node 向けの動的読み込み（ワーカー等）を含むため、バンドルせず node_modules から読み込む
  serverExternalPackages: ["pdfjs-dist"],
  // サーバーレス関数にワーカーのファイルも同梱する（pdfjs が実行時に動的 import する）
  outputFileTracingIncludes: {
    "/api/jobs/import-pdf": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
