import { useMemo } from "react";
import type { Asset } from "../../api/types";

export const useAssetsView = (assets: Asset[]) => {
  const onlineAssets = useMemo(
    () => assets.filter((asset) => asset.status === "Online"),
    [assets],
  );

  const assetSummary = useMemo(
    () => ({
      total: assets.length,
      online: onlineAssets.length,
      offline: Math.max(0, assets.length - onlineAssets.length),
    }),
    [assets.length, onlineAssets.length],
  );

  return {
    onlineAssets,
    assetSummary,
  };
};

