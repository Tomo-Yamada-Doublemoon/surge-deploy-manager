import type { Metadata } from "next"

import { DeployManager } from "@/components/deploy-manager"

export const metadata: Metadata = {
  title: "Surge Deploy Manager",
  description: "Surge デプロイ一覧の確認と選択削除",
}

export default function Page() {
  return <DeployManager />
}
